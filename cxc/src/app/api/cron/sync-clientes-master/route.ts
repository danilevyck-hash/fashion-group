// ─────────────────────────────────────────────────────────────────────────────
// Cron diario: refresca clientes_master (datos fiscales) desde switch_clientes.
//
// PROBLEMA QUE RESUELVE: clientes_master se pobló UNA sola vez con un CSV manual
// (seed-clientes-master, 9-may-2026) y nunca más → la ficha mostraba "última
// sincronización 9 may" indefinidamente. El dato fresco SÍ existe: el sync
// nocturno de facturas mantiene switch_clientes al día (espejo del listado de
// Switch). Este cron propaga esa frescura al maestro.
//
// La LÓGICA vive en src/lib/switch-api/sync-clientes-master.ts (compartida con la
// reconciliación, que la invoca in-process al recuperar un cron perdido). Este
// route es solo el caller de producción: auth + heartbeat + mapeo HTTP.
//
// FUENTE: lee de NUESTRA DB (switch_clientes), NO pega al API de Switch → cero
// riesgo de colisión de sesión única. Schedule 0 7 UTC: después de switch-sync
// (5:30-6:30, que llena switch_clientes), antes de utilidad/recibos/articulos.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { syncClientesMaster } from "@/lib/switch-api/sync-clientes-master";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_NAME = "sync-clientes-master";

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncClientesMaster();

  if (!result.ok) {
    console.error("[cron/sync-clientes-master] falló:", result.error);
    // SIN Telegram inmediato (anti-ruido 17-jul-2026): colateral de la
    // reconciliación → ella re-ejecuta y alerta si sigue caído; rastro en cron_email_errors.
    await logCronError("sync_clientes_master_failed", result.error ?? "error desconocido", null, { telegram: false });
    return NextResponse.json(result, { status: 500 });
  }

  console.log(
    `[cron/sync-clientes-master] ${result.upserted} clientes refrescados (fiscal) desde switch_clientes`,
  );
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json(result);
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
