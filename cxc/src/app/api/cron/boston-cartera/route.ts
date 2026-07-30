/**
 * Cron de la CARTERA DE CONFECCIONES BOSTON, desde el reporte web del panel.
 *
 * Corre 1×/día a las **08:10 UTC = 03:10 a.m. de Panamá**. La hora no es
 * decorativa: el login web usa `changesession=SI`, que **EXPULSA** a quien esté
 * trabajando en el panel de Boston (Switch es sesión única). A las 3 de la
 * mañana no hay nadie, y la sesión se cierra apenas se tiene el dato.
 *
 * Por qué 08:10 y no otra hora de la madrugada:
 *   • `sync-recibos` (07:50) toca Boston → 20 min de separación, sobre los 15
 *     de `SEPARACION_MINIMA_MIN`.
 *   • `switch-articulos` (08:40) toca las 8 empresas → 30 min por delante.
 *   • Fuera de las ventanas de deploy (23:50-00:20 y 05:50-06:10 UTC).
 *   • Lejos del bloque `all-0630`, que es el que este cron viene a descargar.
 *
 * Reemplaza para Boston el recorrido cliente-por-cliente que moría siempre
 * (4.912 llamadas HTTP / 54 min contra un techo de 800 s). Ver
 * `sync-estadocuenta-web.ts` para las guardas del reconcile.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Query params (opcionales, solo para uso manual):
 *   dry=1   calcula y cuadra contra Switch, pero NO escribe ni reconcilia.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncCarteraWeb, EMPRESA_CARTERA_WEB } from "@/lib/switch-api/sync-estadocuenta-web";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid). Medido: ~5 s.

const CRON_NAME = "boston-cartera";

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

  const r = await syncCarteraWeb({
    triggeredBy: dryRun || [...sp.keys()].length > 0 ? "manual" : "cron",
    dryRun,
  });

  // Heartbeat SOLO si salió bien. Si falló, no se registra (así el vigía lo ve
  // envejecer) y se pasa por la política anti-ruido de siempre: un fallo suelto
  // se calla, dos seguidas del mismo par avisan. Un dry-run no es una corrida:
  // no toca el heartbeat ni alerta.
  if (!dryRun) {
    if (r.ok) {
      await recordCronHeartbeat(CRON_NAME);
    } else {
      await alertSwitchCronErrors(CRON_NAME, [
        { empresaKey: EMPRESA_CARTERA_WEB, syncType: "estadocuenta", error: r.error ?? "error" },
      ]);
    }
  }

  return NextResponse.json({ ok: r.ok, dryRun, resultado: r }, { status: r.ok ? 200 : 500 });
}
