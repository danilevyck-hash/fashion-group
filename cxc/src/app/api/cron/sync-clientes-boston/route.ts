/**
 * Cron SEMANAL del DIRECTORIO DE CLIENTES de Confecciones Boston.
 *
 * 🩸 Corre porque el directorio estuvo **37 días congelado** y nadie lo notó:
 * las 4.915 filas de `switch_clientes` de Boston tenían todas el mismo
 * `synced_at` (30-jul-2026 06:31:07). El único escritor del directorio vivía
 * dentro del sync de estado de cuenta por API, y ese camino para Boston está
 * vetado (`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`: 4.912 llamadas HTTP, 54 min
 * medidos contra un techo de 800 s). Cuando la cartera se mudó al reporte web,
 * la cartera quedó al día y el directorio se quedó atrás en silencio.
 *
 * ── SEMANAL, y por qué ese día y esa hora ───────────────────────────────────
 * Daniel: *«semanal»*. El dato se mueve poco y cada corrida abre una sesión de
 * Switch de esa empresa (un solo token válido por USUARIO).
 *
 * **DOMINGO 07:10 UTC = domingo 2:10 a.m. de Panamá.**
 *   • Madrugada de Panamá, y encima domingo: nadie está en Switch.
 *   • 40 min por detrás del bloque `all-0630` (american_classic +
 *     confecciones_boston) y 40 min por delante de `sync-recibos` (07:50), que
 *     también toca Boston. Los dos vecinos más cercanos quedan al DOBLE de
 *     `SEPARACION_MINIMA_MIN` (15).
 *   • Fuera de las ventanas de deploy (23:50-00:20 y 05:50-06:10 UTC).
 *   • No pisa `sync-utilidad` (07:00, que no toca Boston) ni
 *     `refresh-clientes-views` (07:35, que no toca Switch).
 *
 * ── 🔴 LO QUE NO TOCA ───────────────────────────────────────────────────────
 * Escribe SOLO `switch_clientes` con `empresa_key = 'confecciones_boston'`.
 * **`clientes_master` no se toca ni por asomo** — es el directorio del GRUPO y
 * solo del grupo. Ver el encabezado de `sync-clientes-boston.ts` y el candado
 * `boston-clientes-no-tocan-el-grupo.test.ts`.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Query params (opcionales, solo para uso manual):
 *   dry=1   trae y cuenta, pero NO escribe.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncClientesBoston,
  EMPRESA_CLIENTES_APARTE,
} from "@/lib/switch-api/sync-clientes-boston";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
// Techo del plan (Pro + Fluid). Boston tiene 4.915 clientes y `/apicliente/lista`
// capea en ~50 por página ⇒ ~99 llamadas. Es una lista, no una llamada por
// cliente: nada que ver con los 54 min del estado de cuenta.
export const maxDuration = 800;

const CRON_NAME = "sync-clientes-boston";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const dryRun = sp.get("dry") === "1";

  const r = await syncClientesBoston({
    triggeredBy: dryRun || [...sp.keys()].length > 0 ? "manual" : "cron",
    dryRun,
  });

  // Heartbeat SOLO si salió bien. Si falló, no se registra (así el vigía lo ve
  // envejecer) y pasa por la política anti-ruido de siempre: un fallo suelto se
  // calla, dos seguidas del mismo par avisan. Un dry-run no es una corrida.
  if (!dryRun) {
    if (r.ok) {
      await recordCronHeartbeat(CRON_NAME);
    } else {
      await alertSwitchCronErrors(CRON_NAME, [
        { empresaKey: EMPRESA_CLIENTES_APARTE, syncType: "clientes", error: r.error ?? "error" },
      ]);
    }
  }

  return NextResponse.json({ ok: r.ok, dryRun, resultado: r }, { status: r.ok ? 200 : 500 });
}
