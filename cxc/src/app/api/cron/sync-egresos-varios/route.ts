/**
 * Cron de EGRESOS VARIOS — trae de Switch lo que salió de caja y banco en las 8
 * empresas.
 *
 * Corre 1×/día a las **10:35 UTC = 05:35 a.m. de Panamá**.
 *
 * ── Por qué esa hora, y por qué NO entre las 00:20 y las 05:20 UTC ──────────
 *
 * El login web usa `changesession="SI"`, que TOMA la sesión y EXPULSA a quien
 * esté en el panel de esa empresa. El usuario configurado en
 * `SWITCH_<EMPRESA>_WEB_USER` es el de **Daniel**, así que la hora se elige para
 * que no haya nadie adentro.
 *
 * ⚠️ Los crons de Vercel van en **UTC**, y Panamá es **UTC−5 fijo**. La franja
 * 00:20-05:20 UTC —que a primera vista parece de madrugada— es en realidad
 * **19:20 a 00:20 de Panamá**, o sea la tarde-noche. La madrugada de Panamá es
 * **06:00-11:00 UTC**, y ahí ya viven `sync-utilidad` (07:00), `boston-cartera`
 * (08:10) y `sync-mayor` (09:05), los tres con el mismo login web.
 *
 * 10:35 UTC en concreto (05:35 a.m. Panamá), y es el hueco más ancho que queda:
 *   • `switch-reconciliacion` 10:00 → 35 min por detrás. Es la vecina crítica:
 *     puede abrir la sesión de cualquier empresa hasta 12 min
 *     (`RECOVERY_BUDGET_MS` = 740 s), o sea que termina 10:12 en el peor caso y
 *     quedan 23 min de aire real.
 *   • `joybees-catalogo` 11:00 (solo joystep) → 25 min por delante.
 *   • Los otros crons de las 8 empresas quedan lejísimos: `sync-mayor` 09:05
 *     (90 min) y `sync-proveedores` 09:30 (65 min).
 *   • Todos muy por encima de los 15 de `SEPARACION_MINIMA_MIN`.
 *   • Fuera de las ventanas de deploy (23:50-00:20 y 05:50-06:10 UTC) y del
 *     minuto redondo de `/api/cron/backup` (10:30), que no toca Switch pero no
 *     hay razón para pisarlo.
 *
 * ── Frecuencia: 1×/día ─────────────────────────────────────────────────────
 * Es plata que ya salió: verla a las 5:35 a.m. del día siguiente alcanza de
 * sobra. Más frecuencia solo multiplicaría las veces que se le toma la sesión a
 * Daniel.
 *
 * ── 🔴 SI LA BASE NO CONTESTA, NO SE TOCA SWITCH ───────────────────────────
 * Antes de abrir una sola sesión se hace una consulta de una fila contra
 * `egresos_varios`: sin ese chequeo, el cron expulsaría a quien esté en el panel
 * de 8 empresas para tirar todo a la basura y anotarse 8 errores por día. Si la
 * sonda falla, 500 sin heartbeat — y la regla 2 de alertas lo ve.
 *
 * Historia (ago-2026): la sonda además reconocía "esa tabla no existe" y se
 * omitía LIMPIO con 503 mientras `20260813120000_egresos_varios.sql` no
 * corriera. Tolerancia retirada el 3-sep-2026: la tabla existe (verificado en
 * producción); ver `verificarBaseDeEgresos`.
 *
 * Las empresas van SECUENCIALES, una sesión por empresa, cerrada al terminar.
 *
 * ── 🔴 BOSTON NO ENTRA EN LA CORRIDA AUTOMÁTICA ────────────────────────────
 * Daniel, textual (13-ago-2026): *"ve avanzando con todas menos boston, ese
 * usuario es mio y no entrare"*. El cron corre las **7** de
 * `EGRESOS_EMPRESA_KEYS_CRON`. Boston **sigue en el módulo** (su pestaña se ve,
 * con lo que tenga del mayor) y **sigue aceptándose a mano** con
 * `?empresas=confecciones_boston`. Ver `EMPRESAS_EGRESOS_FUERA_DE_CRON`.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Query params (opcionales, uso manual):
 *   empresas=a,b     solo esas empresas (acepta las 8, Boston incluida).
 *   anio=2025        otro año (backfill).
 *   desde=&hasta=    rango exacto (para certificar contra un archivo bajado a
 *                    mano). Los dos o ninguno.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncAllEgresos,
  verificarBaseDeEgresos,
  EGRESOS_EMPRESA_KEYS,
  EGRESOS_EMPRESA_KEYS_CRON,
  type ResultadoEgresosEmpresa,
} from "@/lib/switch-api/sync-egresos-varios";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid).

const CRON_NAME = "sync-egresos-varios";
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ANTES de tocar Switch. Ver el encabezado.
  try {
    await verificarBaseDeEgresos();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `no se pudo consultar la base: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const pedidas = sp.get("empresas")?.split(",").map((s) => s.trim()).filter(Boolean);
  // 🔴 Sin `?empresas=` corren las 7 del cron: Boston queda FUERA de la descarga
  // automática (`EMPRESAS_EGRESOS_FUERA_DE_CRON`). Pedida a propósito SÍ corre —
  // el universo que se valida es el de las 8, no el del cron. Mismo patrón que
  // `empresasConEstadoCuentaEnCron()`.
  const empresas = pedidas?.length
    ? pedidas.filter((e) => EGRESOS_EMPRESA_KEYS.includes(e))
    : EGRESOS_EMPRESA_KEYS_CRON;

  const anioParam = sp.get("anio");
  const anio =
    anioParam && /^\d{4}$/.test(anioParam) ? Number(anioParam) : Number(hoyPanama().slice(0, 4));

  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  // Los dos o ninguno: un rango a medias pediría un período que nadie eligió.
  const rango =
    desde && hasta && FECHA_RE.test(desde) && FECHA_RE.test(hasta) && desde <= hasta
      ? { desde, hasta }
      : undefined;

  const resultados: ResultadoEgresosEmpresa[] = await syncAllEgresos(empresas, anio, rango);
  const fallidas = resultados.filter((r) => !r.ok);

  // Heartbeat SOLO si TODO salió bien. Si algo falló, el heartbeat no se refresca
  // (el vigía lo ve envejecer) y el error pasa por la política anti-ruido de
  // siempre: un fallo suelto se calla, dos corridas seguidas del mismo par
  // avisan. NO se agrega una alerta de sistema nueva — la lista está cerrada y
  // esto entra en la regla 2 reusando el mecanismo que ya existe.
  if (fallidas.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      fallidas.map((r) => ({
        empresaKey: r.empresaKey,
        syncType: "egresos_varios" as const,
        error: r.error ?? "error",
      })),
    );
  }

  return NextResponse.json(
    {
      ok: fallidas.length === 0,
      anio,
      rango: rango ?? null,
      empresas: empresas.length,
      resultados,
    },
    { status: fallidas.length === 0 ? 200 : 500 },
  );
}
