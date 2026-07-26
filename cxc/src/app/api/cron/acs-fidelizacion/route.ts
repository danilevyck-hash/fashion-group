// Cron fidelización ACS — 11:30 UTC + 2ª entrada 16:30 (segunda oportunidad:
// no-op si la 1ª ya registró success hoy).
//
// 1) Baja el directorio de clientes de la instancia MULTI → switch_clientes
//    (american_classic): teléfono/celular/email para WhatsApp en la pestaña
//    Clientes de Multifashion.
// 2) Baja /apifactura/info de facturas ACS pendientes (~50 nuevas/día, tope
//    200/corrida) → descuento_global_pct (detección del 5% de fidelización).
//
// Horario elegido por SESIÓN ÚNICA de Switch (1 token por empresa/instancia):
// a las 11:30 nadie más toca la instancia MULTI/american_classic — esquiva
// sync-recibos (07:50), switch-articulos (08:40) y la pasada de reconciliación
// de las 10:00 (termina ≤10:05) y queda a 90 min del facturas ACS de las 13:00.
// La 2ª entrada (16:30) cae entre el facturas ACS de las 15:00 (~1 min) y el de
// las 17:00, a 30 min de este último. En un día sano es un no-op (guard
// cronSuccessHoyUtc: si la corrida de las 11:30 salió bien, ni abre sesión);
// en el peor caso trabaja hasta su maxDuration de 800 s → termina 16:43 y deja
// 17 min de margen antes de las 17:00.

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { runAcsFidelizacionSync } from "@/lib/switch-api/sync-acs-fidelizacion";
import { recordCronHeartbeat, logCronError, cronSuccessHoyUtc } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

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

  // Segunda oportunidad (jul-2026): el cron tiene 2 entradas (11:30 y 16:30
  // UTC). Si la 1ª ya registró success HOY (día UTC), la 2ª no repite el
  // trabajo — responde no-op (evita tocar la sesión Switch MULTI sin necesidad).
  // Una corrida manual (?force=1) lo salta.
  if (req.nextUrl.searchParams.get("force") !== "1" && (await cronSuccessHoyUtc(CRON_NAME))) {
    return NextResponse.json({ ok: true, skipped: "ya corrió con éxito hoy (2ª entrada no-op)" });
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
