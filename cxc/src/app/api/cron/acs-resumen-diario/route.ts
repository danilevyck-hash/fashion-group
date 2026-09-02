// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/acs-resumen-diario — Resumen de ventas ACS del día a Telegram.
// Corre 01:00 UTC (20:00 Panamá = 8pm), después del sync de cierre de facturas
// ACS de 00:15 UTC (la tienda cierra 7pm sin más movimiento) → el número de
// "hoy" ya incluye el día completo de la tienda.
//
// Los crons Hobby tienen jitter (el sync de 00:15 puede correr tarde o no
// correr): antes de calcular se verifica en switch_sync_log que el sync de
// cierre ya corrió; si no, el mensaje omite "Hoy" y reporta el mes al último
// día completo (ver guardia anti-ruido en src/lib/acs-resumen-diario.ts).
//
// Solo lee la DB (_multifashion_sf_vw) — NO toca la API de Switch, no necesita
// higiene de sesión. Semántica y validación: ver src/lib/acs-resumen-diario.ts.
//
// 🔴 CANAL: `enviarNegocioPrivado` — NEGOCIO en su trato (sale siempre, sin
// prefijo, sin regla anti-ruido) pero al CHAT PRIVADO de Daniel, no al de 📊
// NEGOCIO. Daniel, textual (2-sep-2026): *"solo me gustaría que las ventas de
// acs me lleguen solo a mí o por el chat de alertas, ya que ahí no está el
// celular de la empresa que tiene telegram para ver lo de las fotos, guías,
// etc."*. El motivo es PRIVACIDAD, no que sea una alerta: por eso NO lleva el
// prefijo "🔧 SISTEMA · " (rotular la venta del día como avería sería mentir en
// la notificación del celular) y por eso el resto de 📊 NEGOCIO no se movió.
//
// ⚠️ SON DOS LUGARES: este route y la RECUPERACIÓN de switch-reconciliacion
// (incidente 11-jul-2026, la invocación de la 01:00 se perdió). Si sólo se
// cambia uno, el resumen recuperado sigue cayendo en el grupo. Candado que
// exige que los dos apunten al mismo lado:
// src/__tests__/lib/acs-resumen-canal-privado.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { calcularResumenDiario, buildMensajeHtml, hoyPanama, ventasAcsSyncFresco } from "@/lib/acs-resumen-diario";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { enviarNegocioPrivado } from "@/lib/alertas/canal";

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
    // HTML (no texto plano): el mensaje es una tabla dentro de un <pre> y sin
    // monoespaciado las columnas no cuadran en el móvil.
    const mensaje = buildMensajeHtml(resumen);
    // 🔴 CANAL PRIVADO, NO EL GRUPO (2-sep-2026). Ver la cabecera del archivo:
    // esto va por `enviarNegocioPrivado` y el gemelo de la recuperación
    // (switch-reconciliacion) tiene que apuntar al MISMO destino. Candado:
    // src/__tests__/lib/acs-resumen-canal-privado.test.ts
    const sent = await enviarNegocioPrivado(mensaje, "HTML");
    if (!sent) throw new Error("Telegram no aceptó el mensaje (ver logs)");

    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({ ok: true, fecha, syncFresco, mensaje, resumen });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // SIN Telegram inmediato (anti-ruido 17-jul-2026): colateral de la
    // reconciliación → ella re-ejecuta y alerta si sigue caído; rastro en cron_email_errors.
    await logCronError(`${CRON_NAME}_failed`, msg, null, { telegram: false });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
