// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/acs-resumen-diario — Resumen de ventas ACS del día a Telegram.
// Corre 01:45 UTC (20:45 Panamá), después del sync intradía de facturas ACS de
// 01:30 → el número de "hoy" ya incluye el día completo de la tienda.
//
// Los crons Hobby tienen jitter (el sync de 01:30 puede correr tarde o no
// correr): antes de calcular se verifica en switch_sync_log que el sync de
// cierre ya corrió; si no, el mensaje omite "Hoy" y reporta el mes al último
// día completo (ver guardia anti-ruido en src/lib/acs-resumen-diario.ts).
//
// Solo lee la DB (_multifashion_sf_vw) — NO toca la API de Switch, no necesita
// higiene de sesión. Semántica y validación: ver src/lib/acs-resumen-diario.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { calcularResumenDiario, buildMensaje, hoyPanama, ventasAcsSyncFresco } from "@/lib/acs-resumen-diario";
import { sendTelegramAlert } from "@/lib/telegram";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const CRON_NAME = "acs-resumen-diario";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const provided = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ?fecha= solo para pruebas manuales; el cron usa hoy Panamá.
  const fecha = req.nextUrl.searchParams.get("fecha") || hoyPanama();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ ok: false, error: "fecha inválida" }, { status: 400 });
  }

  try {
    // Guardia anti-ruido (incidente 5-jul-2026, jitter de crons Hobby): solo
    // aplica cuando se reporta HOY (Panamá) — un día pasado ya está completo
    // en la DB por definición, no depende del sync de cierre de anoche.
    const syncFresco = fecha === hoyPanama() ? await ventasAcsSyncFresco(fecha) : true;
    const resumen = await calcularResumenDiario(fecha, syncFresco);
    const mensaje = buildMensaje(resumen);
    const sent = await sendTelegramAlert(mensaje);
    if (!sent) throw new Error("Telegram no aceptó el mensaje (ver logs)");

    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({ ok: true, fecha, syncFresco, mensaje, resumen });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logCronError(`${CRON_NAME}_failed`, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
