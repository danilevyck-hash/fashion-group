// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/integrity-check
//
// Corre los checks de integridad (ver src/lib/integrity-checks.ts) y los
// persiste en data_integrity_checks. Manda alerta Telegram SOLO si hay algún
// check con severity='critical'. Si todo pasa → silencio total.
//
// Auth:
//   - Bearer token con CRON_SECRET (Vercel cron diario)
//   - Cookie cxc_session con role='admin' (botón "Correr ahora" del dashboard)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { runAllChecks, persistCheckResults, summarize, type CheckResult } from "@/lib/integrity-checks";
import { sendTelegramAlert } from "@/lib/telegram";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_NAME = "integrity-check";
const DASHBOARD_URL = "https://fashiongr.com/admin/data-health";

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
    || req.nextUrl.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return true;

  // Fallback: admin con cookie de sesión firmada (botón del dashboard).
  return verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin";
}

function buildCriticalAlert(criticals: CheckResult[]): string {
  const lineas = criticals
    .map((r) => {
      const detalle = r.details ? ` — ${JSON.stringify(r.details).slice(0, 120)}` : "";
      return `• ${r.check_name} (${r.table_name}) — ${r.rows_affected} fila${r.rows_affected === 1 ? "" : "s"}${detalle}`;
    })
    .join("\n");
  return (
    `🔴 Integridad: ${criticals.length} check${criticals.length === 1 ? "" : "s"} crítico${criticals.length === 1 ? "" : "s"}\n` +
    `${lineas}\n` +
    `Dashboard: ${DASHBOARD_URL}`
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  let results: CheckResult[];
  try {
    results = await runAllChecks();
    await persistCheckResults(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[integrity] check run failed:", message);
    await logCronError("integrity_check_failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const summary = summarize(results);

  // Alerta Telegram solo si hay critical (warnings/info van al dashboard).
  const criticals = results.filter((r) => r.severity === "critical");
  let alertSent = false;
  if (criticals.length > 0) {
    alertSent = await sendTelegramAlert(buildCriticalAlert(criticals));
  }

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({
    ok: true,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    summary,
    alert_sent: alertSent,
    results,
  });
}
