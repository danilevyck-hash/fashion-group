import { NextRequest, NextResponse } from "next/server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { runLimpiezaAnuladosMarketing } from "@/lib/marketing/anulados-caducos";

export const dynamic = "force-dynamic";
// Purga acotada (≤500 filas + sus archivos): corre en segundos. Explícito para
// no depender del default de Vercel (10s).
export const maxDuration = 60;

const CRON_NAME = "cleanup-marketing-anulados";

// Los gastos de Marketing que se anularon hace más de 90 días se borran DE
// VERDAD (fila + adjuntos + sellos); hasta entonces quedan con `anulado_en`,
// fuera de todas las pantallas y recuperables solo por la base. Daniel
// (23-sep-2026): «se elimina y listo». La lógica vive en
// src/lib/marketing/anulados-caducos.ts. Schedule diario 03:40 UTC (solo DB +
// Storage, no toca Switch). Con `MARKETING_TIENDAS_Y_MARCAS` apagado no borra.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = await runLimpiezaAnuladosMarketing();

  if (!r.ok) {
    console.error("[cleanup-marketing-anulados] failed:", r.detail);
    // SIN Telegram inmediato (anti-ruido): rastro en cron_email_errors; si
    // sigue caído, el watchdog de heartbeats lo dice.
    await logCronError("cleanup_marketing_anulados_failed", r.detail, null, { telegram: false });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({
    facturas: r.facturas,
    archivos: r.archivos,
    entregas: r.entregas,
    cutoff: r.cutoff,
    detail: r.detail,
  });
}
