/**
 * Cron multi-empresa Switch.
 *
 * Por defecto (sin params): sincroniza FACTURAS incrementales (ventana 7 días)
 * de todas las empresas con facturas=true (empresasConFacturas() = las 6 B2B +
 * Boston + Multifashion/american_classic). Multifashion SÍ entra acá: su data
 * alimenta switch_facturas (base del tab Multifashion desde fase 2.1b) además de
 * su tabla legacy multifashion_tickets, que su cron propio (/api/cron/
 * multifashion-sync) sigue manteniendo. Vive en ambas a propósito (invariante
 * 🟡-14: nunca sumar las dos fuentes → doble conteo).
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
 * NOTA timing + sesión única (raíz del 401 / code 0006): Switch es SESIÓN ÚNICA
 * por empresa — un 2do login a la misma empresa mata el token del 1ro (0006) →
 * 401. Antes los crons facturas (monolito), estadocuenta (x3) y costo corrían en
 * invocaciones separadas que Vercel agrupaba en un cluster, autenticando la MISMA
 * empresa concurrentemente → colisión. Fix: UN cron por GRUPO de empresas con
 * tipo=all. Cada empresa vive en exactamente un cron (cero colisión intra-empresa,
 * todo serial) y empresas distintas no comparten sesión (cero colisión cross-cron,
 * aunque Vercel los agrupe → ya NO depende de horarios). Duraciones medidas
 * (~85-120s/empresa en estadocuenta; facturas/costo ~2-12s) → 2 B2B/run ≈ 210-225s,
 * holgado bajo maxDuration=300. El backfill (scripts/switch-backfill.ts) sigue
 * disponible para corridas masivas.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
  syncCostoDiario,
  type EmpresaSyncResult,
  type CostoDiarioResult,
} from "@/lib/switch-api/sync-empresa";
import {
  empresasConFacturas,
  empresasConCxc,
  isEmpresaKey,
} from "@/lib/switch-api/empresas";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

type SyncTipo = "facturas" | "estadocuenta" | "all";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
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

export async function GET(req: NextRequest): Promise<NextResponse> {
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
  // Universo: estadocuenta solo aplica a B2B (empresasConCxc); facturas y `all`
  // aplican a todas las que tienen facturas (en `all`, estadocuenta se salta
  // adentro del loop para las retail que no tienen CXC).
  const empresaParam = sp.get("empresa");
  const empresasParam = sp.get("empresas");
  const universe: EmpresaKey[] = tipo === "estadocuenta" ? empresasConCxc() : empresasConFacturas();
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

  // estadocuenta solo corre para B2B (empresasConCxc); en tipo=all las retail
  // (american_classic, confecciones_boston) hacen solo facturas+costo.
  const cxcSet = new Set<EmpresaKey>(empresasConCxc());

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
  // switch_sync_log y recupera; el watchdog ve el heartbeat stale) y disparamos
  // alerta Telegram inmediata. Antes el heartbeat se registraba siempre → un 207
  // parcial quedaba invisible para el watchdog.
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    const detalle = errors.map((e) => `${e.empresaKey}/${e.tipo}: ${e.error}`).join("; ");
    await logCronError(CRON_NAME, `${errors.length} sync(s) fallaron — ${detalle}`);
  }
  return NextResponse.json(
    {
      ok: errors.length === 0,
      tipo,
      range: { desde, hasta },
      results,
      errors,
    },
    { status: errors.length === 0 ? 200 : 207 },
  );
}
