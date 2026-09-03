/**
 * Cron multi-empresa Switch.
 *
 * Por defecto (sin params): sincroniza FACTURAS incrementales (ventana 7 días)
 * de todas las empresas con facturas=true (empresasConFacturas() = las 6 B2B +
 * Boston + Multifashion/american_classic). Multifashion SÍ entra acá: su data
 * alimenta switch_facturas, que desde el 26-jul-2026 es su ÚNICA fuente viva
 * (base del tab Multifashion vía _multifashion_sf_vw). La tabla legacy
 * multifashion_tickets quedó CONGELADA ese día —su cron se retiró, los datos
 * históricos quedan— así que ya no hay duplicidad que cuidar. Ver CLAUDE.md.
 *
 * Query params (todos opcionales):
 *   tipo=facturas|estadocuenta|all   (default facturas)
 *   empresa=<empresa_key>            sincroniza solo esa empresa
 *   empresas=a,b,c                   CSV; precede a `empresa`
 *   desde=YYYY-MM-DD&hasta=...        override de rango (manual), ambos o ninguno
 *
 * tipo=all (PRODUCCIÓN): por cada empresa del grupo corre los 3 syncs EN SERIE
 * dentro de UNA sola invocación —facturas → estadocuenta (solo B2B) → costo—
 * reusando el MISMO token (tokenCache es por-empresa, TTL 55min: 1 auth por
 * empresa cubre los 3 tipos). Es el modo que dispara el cron de producción.
 *
 * NOTA timing + sesión única (raíz del 401 / code 0006): Switch admite UN SOLO
 * token válido por USUARIO (PDF del API, p. 6: «Solo habrá un token válido a la
 * vez por usuario»). Como cada empresa es su propia instancia y entra con un
 * único usuario de API, en la práctica es una sesión por empresa — un 2do login
 * a la misma empresa mata el token del 1ro (0006) →
 * 401. Antes los crons facturas (monolito), estadocuenta (x3) y costo corrían en
 * invocaciones separadas que Vercel agrupaba en un cluster, autenticando la MISMA
 * empresa concurrentemente → colisión. Fix: UN cron por GRUPO de empresas con
 * tipo=all. Cada empresa vive en exactamente un cron (cero colisión intra-empresa,
 * todo serial) y empresas distintas no comparten sesión (cero colisión cross-cron,
 * aunque Vercel los agrupe → ya NO depende de horarios). Duraciones medidas
 * (~85-120s/empresa en estadocuenta; facturas/costo ~2-12s) → 2 B2B/run ≈ 210-225s,
 * holgado bajo maxDuration=800. El backfill (scripts/switch-backfill.ts) sigue
 * disponible para corridas masivas.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
  syncCostoDiario,
  type EmpresaSyncResult,
  type CostoDiarioResult,
} from "@/lib/switch-api/sync-empresa";
import {
  empresasConFacturas,
  empresasConEstadoCuenta,
  empresasConEstadoCuentaEnCron,
  isEmpresaKey,
} from "@/lib/switch-api/empresas";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";
import { correrCentinelaTipos } from "@/lib/ventas/centinela-tipos";

type SyncTipo = "facturas" | "estadocuenta" | "all";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)
// Los errors[] por-empresa son transientes esperados (la reconciliación de las
// 10:00 los reintenta) → NO disparan alerta aquí. Solo registramos heartbeat de
// liveness; el watchdog avisa si el cron deja de correr del todo.
const CRON_NAME = "switch-sync";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365;

function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

function isValidYmd(s: string): boolean {
  if (!YMD_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;

  // tipo
  const tipo = (sp.get("tipo") ?? "facturas") as SyncTipo;
  if (tipo !== "facturas" && tipo !== "estadocuenta" && tipo !== "all") {
    return NextResponse.json({ ok: false, error: "tipo inválido (facturas|estadocuenta|all)" }, { status: 400 });
  }

  // empresa(s) (opcional). `empresas=a,b,c` (CSV) tiene precedencia sobre
  // `empresa=x` singular; ambos siguen soportados (aditivo). Las empresas se
  // procesan SERIALMENTE en el for de abajo — requisito de la sesión única por
  // empresa de Switch (logins concurrentes a la misma empresa → code 0006).
  //
  // Universo: estadocuenta aplica a las empresas con `estadoCuenta: true` (las 6
  // B2B + confecciones_boston, que trae saldos para su pestaña aparte); facturas
  // y `all` aplican a todas las que tienen facturas (en `all`, estadocuenta se
  // salta adentro del loop para las que no traen saldos, como american_classic).
  const empresaParam = sp.get("empresa");
  const empresasParam = sp.get("empresas");
  const universe: EmpresaKey[] = tipo === "estadocuenta" ? empresasConEstadoCuenta() : empresasConFacturas();
  let empresas: EmpresaKey[];
  if (empresasParam !== null) {
    const raw = empresasParam.split(",").map(s => s.trim()).filter(Boolean);
    if (raw.length === 0) {
      return NextResponse.json({ ok: false, error: "empresas vacío" }, { status: 400 });
    }
    const invalid = raw.filter(e => !isEmpresaKey(e) || !universe.includes(e as EmpresaKey));
    if (invalid.length > 0) {
      return NextResponse.json(
        { ok: false, error: `empresa(s) inválida(s) para tipo ${tipo}: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
    empresas = [...new Set(raw)] as EmpresaKey[]; // dedupe, preserva orden
  } else if (empresaParam !== null) {
    if (!isEmpresaKey(empresaParam)) {
      return NextResponse.json({ ok: false, error: `empresa inválida: ${empresaParam}` }, { status: 400 });
    }
    if (!universe.includes(empresaParam)) {
      return NextResponse.json(
        { ok: false, error: `empresa ${empresaParam} no tiene sync de tipo ${tipo}` },
        { status: 400 },
      );
    }
    empresas = [empresaParam];
  } else {
    empresas = universe;
  }

  // rango (opcional override)
  const desdeParam = sp.get("desde");
  const hastaParam = sp.get("hasta");
  let desde: string;
  let hasta: string;
  let triggeredBy: "cron" | "manual";
  if ((desdeParam === null) !== (hastaParam === null)) {
    return NextResponse.json({ ok: false, error: "desde y hasta deben venir juntos" }, { status: 400 });
  }
  if (desdeParam !== null && hastaParam !== null) {
    if (!isValidYmd(desdeParam) || !isValidYmd(hastaParam)) {
      return NextResponse.json({ ok: false, error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400 });
    }
    const days = daysBetween(desdeParam, hastaParam);
    if (days < 0) return NextResponse.json({ ok: false, error: "desde > hasta" }, { status: 400 });
    if (days > MAX_RANGE_DAYS) return NextResponse.json({ ok: false, error: `Rango > ${MAX_RANGE_DAYS} días` }, { status: 400 });
    desde = desdeParam;
    hasta = hastaParam;
    triggeredBy = "manual";
  } else {
    desde = panamaDate(-7);
    hasta = panamaDate(0);
    triggeredBy = "cron";
  }

  const results: Array<EmpresaSyncResult | CostoDiarioResult> = [];
  const errors: Array<{ empresaKey: string; tipo: string; error: string }> = [];
  const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));

  // estadocuenta corre para las empresas con `estadoCuenta: true`. OJO: NO es lo
  // mismo que "cartera del grupo" — confecciones_boston trae saldos (para su
  // pestaña aparte) pero tiene `cxc:false` y no suma a ningún total del grupo.
  // En tipo=all, american_classic hace solo facturas+costo.
  //
  // ...EnCron excluye a las empresas cuyo estado de cuenta no cabe en el techo de
  // la función (hoy: confecciones_boston, 4.912 clientes ≈ 54 min vs 800 s). Sin
  // esto el run de las 06:30 moría SIEMPRE y se llevaba puesto el heartbeat de
  // american_classic, que en el mismo run sincronizaba bien. Ver
  // EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON en switch-api/empresas.ts.
  const cxcSet = new Set<EmpresaKey>(empresasConEstadoCuentaEnCron());

  const runFacturas = async (empresaKey: EmpresaKey) => {
    try { results.push(await syncEmpresaFacturas(empresaKey, { desde, hasta, triggeredBy })); }
    catch (err) { errors.push({ empresaKey, tipo: "facturas", error: msg(err) }); }
  };
  const runEstadoCuenta = async (empresaKey: EmpresaKey) => {
    try { results.push(await syncEmpresaEstadoCuenta(empresaKey, { desde, hasta, triggeredBy })); }
    catch (err) { errors.push({ empresaKey, tipo: "estadocuenta", error: msg(err) }); }
  };
  const runCosto = async (empresaKey: EmpresaKey) => {
    try { results.push(await syncCostoDiario(empresaKey, triggeredBy)); }
    catch (err) { errors.push({ empresaKey, tipo: "costo", error: msg(err) }); }
  };

  // SERIAL por empresa. En tipo=all, los 3 syncs de UNA empresa corren seguidos
  // (1 auth reusada) antes de pasar a la siguiente. Un fallo de un tipo NO aborta
  // los demás ni el resto de empresas.
  for (const empresaKey of empresas) {
    if (tipo === "facturas") {
      await runFacturas(empresaKey);
    } else if (tipo === "estadocuenta") {
      await runEstadoCuenta(empresaKey);
    } else {
      // tipo === "all": facturas → estadocuenta (solo B2B) → costo
      await runFacturas(empresaKey);
      if (cxcSet.has(empresaKey)) await runEstadoCuenta(empresaKey);
      await runCosto(empresaKey);
    }
  }

  // Heartbeat de éxito SOLO si TODOS los syncs corrieron OK. Si alguno falló, NO
  // registramos éxito (la reconciliación detecta los pares faltantes en
  // switch_sync_log y recupera; el watchdog ve el heartbeat stale) y alertamos
  // vía alertSwitchCronErrors: los errores NO-401 alertan de inmediato como
  // siempre; un 401/token (transitorio de sesión única) solo alerta si la misma
  // empresa+tipo acumula 2+ corridas consecutivas con 401 en switch_sync_log.
  //
  // Heartbeat por-slot (jul-2026): cada entrada de cron en vercel.json trae
  // `&slot=<tipo>-<hhmm>` (hhmm = hora UTC de su schedule). Además del heartbeat
  // base se registra "switch-sync:<slot>" para que health-crons detecte una
  // entrada intradía perdida (antes cualquier entrada exitosa refrescaba el
  // base y tapaba a las demás). Corridas manuales/reconciliación sin ?slot= no
  // registran slot (no crean filas huérfanas que luego quedarían stale).
  // Refresh intradía del aging de CXC (audit jul-2026): la MV
  // switch_estadocuenta_aging_mv se refrescaba solo 1×/día (07:35), pero
  // estadocuenta sincroniza 3×/día → la pantalla CXC no veía los intradía.
  // Se dispara SOLO en corridas tipo=estadocuenta con al menos una empresa OK
  // (tipo=all ya tiene el cron refresh-clientes-views 07:35 justo después).
  // Barata (~seg, 218 filas). Tolerante: si falla, NO marca el sync como
  // fallido ni alerta por Telegram — solo log (el refresh de 07:35 y la
  // reconciliación lo recuperan).
  if (tipo === "estadocuenta" && results.length > 0) {
    try {
      const { error: mvErr } = await supabaseServer.rpc("refresh_switch_estadocuenta_aging_mv");
      if (mvErr) console.error(`[switch-sync] refresh aging_mv falló (no fatal): ${mvErr.message}`);
    } catch (err) {
      console.error(`[switch-sync] refresh aging_mv threw (no fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── EL CENTINELA DE TIPOS DE COMPROBANTE ────────────────────────────────
  //
  // 🩸 En mayo-2025 Switch estrenó «Transacción» y alguien lo agregó a tiempo —
  // POR SUERTE. Un tipo nuevo cae al `ELSE 0` de las vistas de ventas y esa
  // plata desaparece del tablero SIN un solo error. Acá se mira, justo después
  // de que las facturas aterrizaron, y se avisa por la política que ya existe.
  //
  // Solo en las corridas que traen facturas: es lo que puede estrenar un tipo.
  // NUNCA lanza y NUNCA toca el heartbeat — las facturas se escribieron bien.
  const centinela =
    tipo === "facturas" || tipo === "all"
      ? await correrCentinelaTipos([...new Set(results.map((r) => r.empresaKey))])
      : [];

  const slotParam = sp.get("slot");
  const slot = slotParam && /^(all|facturas|estadocuenta)-\d{4}$/.test(slotParam) ? slotParam : null;
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
    if (slot) await recordCronHeartbeat(`${CRON_NAME}:${slot}`);
  }
  // UNA sola llamada con TODO lo que hay que avisar — los fallos de sync y los
  // tipos sin clasificar. Dos llamadas serían dos mensajes por la misma corrida,
  // que es justo el ruido que la política existe para evitar.
  const paraAlertar = [
    ...errors.map((e) => ({ empresaKey: e.empresaKey, syncType: e.tipo, error: e.error })),
    ...centinela,
  ];
  if (paraAlertar.length > 0) {
    await alertSwitchCronErrors(CRON_NAME, paraAlertar);
  }
  return NextResponse.json(
    {
      ok: errors.length === 0,
      tipo,
      range: { desde, hasta },
      results,
      errors,
      tiposSinClasificar: centinela.length,
    },
    { status: errors.length === 0 ? 200 : 207 },
  );
}

// Higiene de sesión única (4-jul-2026): al terminar el cron —éxito o fallo—
// se cierran las sesiones de Switch abiertas por este proceso (POST
// /cierresesion, best-effort). Sin esto el token queda vivo ~60min y mata el
// login del siguiente cron que toque la misma empresa (colisión code 0006).
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCron(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}
