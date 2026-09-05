import { NextRequest, NextResponse } from "next/server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { runLimpiezaArchivosDepurador } from "@/lib/depurador/historial-archivos";

export const dynamic = "force-dynamic";
// Purga acotada (≤500 archivos + un update): corre en segundos. Explícito para
// no depender del default de Vercel (10s).
export const maxDuration = 60;

const CRON_NAME = "cleanup-depurador-archivos";

// Los Excel del Historial del Depurador duran 90 días (Daniel: «que el archivo
// dure 90 días»). Este cron borra los vencidos de Storage y le quita el botón
// a la fila — 🔴 LA FILA CON LOS TOTALES SE QUEDA PARA SIEMPRE. La lógica core
// vive en src/lib/depurador/historial-archivos.ts (runLimpiezaArchivosDepurador).
// Schedule diario 03:20 UTC (solo DB + Storage, no toca Switch).
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = await runLimpiezaArchivosDepurador();

  if (!r.ok) {
    console.error("[cleanup-depurador-archivos] failed:", r.detail);
    // SIN Telegram inmediato (anti-ruido): rastro en cron_email_errors; si
    // sigue caído, el watchdog de heartbeats lo dice.
    await logCronError("cleanup_depurador_archivos_failed", r.detail, null, { telegram: false });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ borrados: r.borrados, cutoff: r.cutoff, detail: r.detail });
}
