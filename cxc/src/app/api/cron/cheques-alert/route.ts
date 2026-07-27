import { NextRequest, NextResponse } from "next/server";
import { sendTelegramAlert } from "@/lib/telegram";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { runChequesAlert } from "@/lib/cheques-alert";
import { enviarNegocio } from "@/lib/alertas/canal";

const CRON_NAME = "cheques-alert";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dynamic = "force-dynamic";
// Query + Telegram: corre en segundos. Explícito para no depender del default
// de Vercel (10s) — margen si Supabase/Telegram se ponen lentos.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  let authorized = secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      if (verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin") {
        authorized = true;
      }
    } catch { /* invalid cookie */ }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Test mode: dispara un mensaje Telegram de prueba.
  if (req.nextUrl.searchParams.get("test") === "true") {
    const sent = await enviarNegocio(
      `🧪 Cheques por vencer (PRUEBA)\n1 cheque — ${money(1000)}\n• PRUEBA TEST (Vistana) ${money(1000)} — MAÑANA`,
    );
    return NextResponse.json({ message: "Telegram de prueba", sent });
  }

  // Lógica core compartida con la recuperación in-process de la reconciliación.
  const r = await runChequesAlert();
  if (!r.ok) {
    console.error("[cheques-alert] query failed:", r.detail);
    // SIN Telegram inmediato (anti-ruido 17-jul-2026): colateral de la
    // reconciliación → ella re-ejecuta y alerta si sigue caído; rastro en cron_email_errors.
    await logCronError("cheques_query_failed", r.detail, null, { telegram: false });
    return NextResponse.json({ error: r.detail }, { status: 500 });
  }

  await recordCronHeartbeat(CRON_NAME);
  if (r.count === 0) {
    return NextResponse.json({ message: "No hay cheques por vencer", count: 0 });
  }
  return NextResponse.json({
    message: r.sent ? "Alerta enviada" : "Alerta no enviada (Telegram falló)",
    count: r.count,
    sent: r.sent,
  });
}
