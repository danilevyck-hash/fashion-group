// Cron fidelización ACS — 08:15 UTC (1×/día, plan Hobby).
//
// 1) Baja el directorio de clientes de la instancia MULTI → switch_clientes
//    (american_classic): teléfono/celular/email para WhatsApp en la pestaña
//    Clientes de Multifashion.
// 2) Baja /apifactura/info de facturas ACS pendientes (~50 nuevas/día, tope
//    200/corrida) → descuento_global_pct (detección del 5% de fidelización).
//
// Horario elegido por SESIÓN ÚNICA de Switch (1 token por empresa/instancia):
// multifashion-sync corre 05:00 y switch-sync american_classic 06:30 — a las
// 08:15 nadie más está logueado en la instancia MULTI.

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { runAcsFidelizacionSync } from "@/lib/switch-api/sync-acs-fidelizacion";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_NAME = "acs-fidelizacion";

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const r = await runAcsFidelizacionSync();
    // Heartbeat solo si la corrida fue útil (algo sincronizó); errores parciales
    // se devuelven igual para verlos en el log de Vercel.
    if (r.clientes > 0 || r.detallesProcesados > 0 || r.errores.length === 0) {
      await recordCronHeartbeat(CRON_NAME);
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logCronError(CRON_NAME, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
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
