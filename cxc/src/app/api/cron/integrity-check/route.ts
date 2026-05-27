// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/integrity-check
//
// Corre los checks de integridad (ver src/lib/integrity-checks.ts) y los
// persiste en data_integrity_checks. Manda email de alerta a daniel@ si hay
// alguno con severity='critical'.
//
// Auth:
//   - Bearer token con CRON_SECRET (Vercel cron diario)
//   - Cookie cxc_session con role='admin' (botón "Correr ahora" del dashboard)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/lib/supabase-server";
import { runAllChecks, persistCheckResults, summarize, type CheckResult, type Severity } from "@/lib/integrity-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY);
const ALERT_TO = ["daniel@fashiongr.com"];
const DASHBOARD_URL = "https://fashiongr.com/admin/data-health";

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
    || req.nextUrl.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return true;

  // Fallback: admin con cookie de sesión (botón del dashboard).
  try {
    const sessionRaw = req.cookies.get("cxc_session")?.value;
    if (!sessionRaw) return false;
    const parsed = JSON.parse(Buffer.from(sessionRaw, "base64url").toString("utf-8"));
    return parsed?.role === "admin";
  } catch {
    return false;
  }
}

function severityBadge(s: Severity): string {
  if (s === "critical") return `<span style="background:#fee;color:#c00;padding:2px 8px;border-radius:4px;font-weight:600">CRITICAL</span>`;
  if (s === "warning") return `<span style="background:#fff3cd;color:#a06000;padding:2px 8px;border-radius:4px;font-weight:600">WARNING</span>`;
  if (s === "info") return `<span style="background:#e0f2fe;color:#0c4a6e;padding:2px 8px;border-radius:4px;font-weight:600">INFO</span>`;
  return `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-weight:600">OK</span>`;
}

function buildAlertEmail(criticals: CheckResult[], all: CheckResult[]): string {
  const rows = all.map(r => `
    <tr style="border-bottom:1px solid #eee">
      <td style="padding:8px;font-family:monospace;font-size:12px">${r.check_name}</td>
      <td style="padding:8px;text-align:center">${severityBadge(r.severity)}</td>
      <td style="padding:8px;text-align:right;font-family:monospace">${r.rows_affected}</td>
      <td style="padding:8px;font-size:11px;color:#666;font-family:monospace">${
        r.details ? JSON.stringify(r.details).slice(0, 200) : "—"
      }</td>
    </tr>`).join("");

  return `
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:720px">
      <h2 style="color:#c00;margin:0 0 8px 0">⚠️ Alerta integridad de data</h2>
      <p style="color:#666;margin:0 0 16px 0">${criticals.length} check${criticals.length === 1 ? "" : "s"} crítico${criticals.length === 1 ? "" : "s"} detectado${criticals.length === 1 ? "" : "s"} en la corrida diaria.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px;text-align:left">Check</th>
            <th style="padding:8px;text-align:center">Severity</th>
            <th style="padding:8px;text-align:right">Rows</th>
            <th style="padding:8px;text-align:left">Detalles</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:24px;font-size:13px"><a href="${DASHBOARD_URL}" style="color:#0070f3;text-decoration:none">Ver dashboard completo →</a></p>
      <p style="margin-top:24px;color:#888;font-size:11px">Fashion Group — sistema automático de integridad. Cron diario 7am Panamá.</p>
    </div>
  `;
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
    // Persistir el fallo en cron_email_errors. Best-effort: si el propio
    // INSERT falla, igual devolvemos el 500 con el error real.
    try {
      const { error: logErr } = await supabaseServer
        .from("cron_email_errors")
        .insert({
          tipo: "integrity_check_failed",
          cheque_context: null,
          error_message: message,
        });
      if (logErr) {
        console.error("[integrity] cron_email_errors insert failed:", logErr.message);
      }
    } catch (logErr) {
      console.error("[integrity] cron_email_errors insert threw:", logErr);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const summary = summarize(results);

  // Alerta por email solo si hay critical (warnings van al dashboard).
  const criticals = results.filter(r => r.severity === "critical");
  let emailSent = false;
  if (criticals.length > 0 && process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: "Fashion Group <notificaciones@fashiongr.com>",
        to: ALERT_TO,
        subject: `[fashiongr] Alerta integridad: ${criticals.length} check${criticals.length === 1 ? "" : "s"} críticos`,
        html: buildAlertEmail(criticals, results),
      });
      emailSent = true;
    } catch (err) {
      console.error("[integrity] email send error:", err);
      // Persistir el fallo en cron_email_errors. Best-effort: si el propio
      // INSERT falla, no rompemos el flujo — el cron sigue al return final
      // con email_sent=false.
      try {
        const { error: logErr } = await supabaseServer
          .from("cron_email_errors")
          .insert({
            tipo: "integrity_check_email_failed",
            cheque_context: null,
            error_message: err instanceof Error ? err.message : String(err),
          });
        if (logErr) {
          console.error("[integrity] cron_email_errors insert failed:", logErr.message);
        }
      } catch (logErr) {
        console.error("[integrity] cron_email_errors insert threw:", logErr);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    summary,
    email_sent: emailSent,
    results,
  });
}
