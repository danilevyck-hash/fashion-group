// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/integrity-check
//
// Corre los checks de integridad (ver src/lib/integrity-checks.ts) y los
// persiste en data_integrity_checks. Manda alerta Telegram SOLO si hay algún
// check con severity='critical'. Si todo pasa → silencio total.
//
// La lógica core vive en src/lib/integrity-check-run.ts (runIntegrityCheck),
// compartida con la recuperación in-process de switch-reconciliacion.
//
// Auth:
//   - Bearer token con CRON_SECRET (Vercel cron diario)
//   - Cookie cxc_session con role='admin' (botón "Correr ahora" del dashboard)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { runIntegrityCheck } from "@/lib/integrity-check-run";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_NAME = "integrity-check";

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
    || req.nextUrl.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return true;

  // Fallback: admin con cookie de sesión firmada (botón del dashboard).
  return verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin";
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const r = await runIntegrityCheck();
  if (!r.ok) {
    console.error("[integrity] check run failed:", r.detail);
    // SIN Telegram inmediato (anti-ruido 17-jul-2026): colateral de la
    // reconciliación → ella re-ejecuta y alerta si sigue caído; rastro en cron_email_errors.
    await logCronError("integrity_check_failed", r.detail, null, { telegram: false });
    return NextResponse.json({ error: r.detail }, { status: 500 });
  }

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({
    ok: true,
    started_at: startedAt.toISOString(),
    duration_ms: r.durationMs,
    summary: r.summary,
    alert_sent: r.alertSent,
    results: r.results,
  });
}
