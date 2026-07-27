// Lógica core del cron integrity-check, extraída del route para poder llamarla
// IN-PROCESS desde la reconciliación (recuperación sin self-fetch), igual que
// cheques-alert. NO registra heartbeat ni logCronError: eso es del caller
// (route u orquestador). Corre los checks, los persiste (append, igual que el
// botón "Correr ahora") y manda la alerta Telegram SOLO si hay críticos. La
// idempotencia de la ALERTA la da el caller: solo se re-ejecuta si no hubo
// success hoy, y la reconciliación además la protege con recoverAfterHourUtc
// para no adelantarse al run normal de las 12:00 UTC.

import { runAllChecks, persistCheckResults, summarize, type CheckResult } from "@/lib/integrity-checks";
import { sendTelegramAlert } from "@/lib/telegram";
import { enviarSistema } from "@/lib/alertas/canal";

const DASHBOARD_URL = "https://fashiongr.com/admin/data-health";

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

export interface IntegrityRunResult {
  ok: boolean; // false solo si runAllChecks/persist lanzó (el caller NO registra heartbeat)
  detail: string;
  criticalCount: number;
  alertSent: boolean;
  summary: ReturnType<typeof summarize>;
  results: CheckResult[];
  durationMs: number;
}

/**
 * Corre todos los checks de integridad, los persiste y alerta por Telegram si
 * hay críticos. Devuelve summary/results para que el route arme su respuesta.
 */
export async function runIntegrityCheck(): Promise<IntegrityRunResult> {
  const startedMs = Date.now();
  let results: CheckResult[];
  try {
    results = await runAllChecks();
    await persistCheckResults(results);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      detail,
      criticalCount: 0,
      alertSent: false,
      summary: { total: 0, critical: 0, warning: 0, info: 0, ok: 0 },
      results: [],
      durationMs: Date.now() - startedMs,
    };
  }

  const summary = summarize(results);
  const criticals = results.filter((r) => r.severity === "critical");
  let alertSent = false;
  if (criticals.length > 0) {
    alertSent = await enviarSistema(buildCriticalAlert(criticals));
  }

  return {
    ok: true,
    detail: criticals.length > 0 ? `${criticals.length} críticos` : `${summary.total} checks ok`,
    criticalCount: criticals.length,
    alertSent,
    summary,
    results,
    durationMs: Date.now() - startedMs,
  };
}
