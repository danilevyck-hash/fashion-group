// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/catalogos-fotos-resumen — Resumen SEMANAL de fotos faltantes.
// Corre los lunes a las 13:30 UTC (08:30 Panamá, `30 13 * * 1`) y manda a
// Telegram cuántos productos VISIBLES siguen sin foto por catálogo (Reebok /
// Joybees / Tommy) + sus códigos (límite 15 + "y N más"). Si los 3 están al
// día: un solo mensaje de "todas sus fotos ✅" (1×/semana está bien).
//
// Solo lee las DBs de los catálogos — NO toca la API de Switch, no necesita
// higiene de sesión ni lock. Tommy tolerante a DDL pendiente (se reporta
// "pendiente de activación" sin fallar). Cálculo y mensaje en
// src/lib/catalogos/fotos-resumen.ts (compartido con la recuperación de
// switch-reconciliacion, guard "solo lunes").
//
// Telemetría: heartbeat "catalogos-fotos-resumen" con umbral SEMANAL propio
// (8 días, CRON_STALE_HOURS_POR_CRON) y vigilancia seed-tolerante en
// health-crons (SEED_TOLERANT_CRONS) — no dispara 503 antes de su primera
// corrida.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { calcularFotosResumen } from "@/lib/catalogos/fotos-resumen";
import { limpiarVariantesRetiradas } from "@/lib/catalogos/variantes-limpieza";
import { lineaHousekeeping } from "@/lib/catalogos/variantes-housekeeping";
import { sendTelegramAlert } from "@/lib/telegram";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "catalogos-fotos-resumen";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const provided = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resumen = await calcularFotosResumen();

    // Housekeeping de variantes en el mismo pase. Va DESPUÉS del cálculo del
    // resumen y envuelto en try/catch: si falla, el resumen semanal igual sale
    // (es la función principal de este cron).
    let limpieza = { productos: 0, bytes: 0, fallos: 0 };
    try {
      limpieza = await limpiarVariantesRetiradas();
    } catch (err) {
      console.error("housekeeping variantes:", err);
      limpieza = { productos: 0, bytes: 0, fallos: 1 };
    }
    const linea = lineaHousekeeping(limpieza);
    const mensaje = linea ? `${resumen.mensaje}\n\n${linea}` : resumen.mensaje;

    const sent = await sendTelegramAlert(mensaje);
    if (!sent) throw new Error("Telegram no aceptó el mensaje (ver logs)");

    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({
      ok: true,
      totalSinFoto: resumen.totalSinFoto,
      marcas: resumen.marcas.map((m) => ({
        label: m.label,
        sinFoto: m.codigos.length,
        pendiente: m.pendiente ?? false,
      })),
      limpieza,
      mensaje,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logCronError(`${CRON_NAME}_failed`, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
