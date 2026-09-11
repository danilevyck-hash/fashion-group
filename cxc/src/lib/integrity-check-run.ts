// Lógica core del cron integrity-check, extraída del route para poder llamarla
// IN-PROCESS desde la reconciliación (recuperación sin self-fetch), igual que
// cheques-alert. NO registra heartbeat ni logCronError: eso es del caller
// (route u orquestador). Corre los checks, los persiste (append, igual que el
// botón "Correr ahora") y manda la alerta Telegram SOLO si hay críticos. La
// idempotencia de la ALERTA la da el caller: solo se re-ejecuta si no hubo
// success hoy, y la reconciliación además la protege con recoverAfterHourUtc
// para no adelantarse al run normal de las 12:00 UTC.

import { runAllChecks, persistCheckResults, summarize, type CheckResult } from "@/lib/integrity-checks";
import { enviarSistema } from "@/lib/alertas/canal";

// 🔴 EL MENSAJE YA NO LLEVA LINK (11-sep-2026). Data Health dejó de tener
// pantalla —Daniel: «data health quiero que el sistema o tú mida todo pero no
// verlo… no lo uso y no lo quiero usar»— y mandar un enlace a una pantalla que
// no existe es exactamente el marcador roto que este repo evita en todos lados.
// El aviso se basta solo: dice el check, la tabla, cuántas filas y el detalle.
// Para mirar los chequeos sin pantalla está `GET /api/diag/data-health`
// (CRON_SECRET o sesión de admin), que NO se nombra acá a propósito: es una
// ruta de diagnóstico para quien mantiene el sistema, no una instrucción para
// Daniel. ⚠️ Los mensajes VIEJOS que ya están en su Telegram traen el link de
// antes; `/admin/data-health` redirige al Inicio (next.config.js) para que ese
// toque llegue a algún lado en vez de a un 404.

function buildCriticalAlert(criticals: CheckResult[]): string {
  const lineas = criticals
    .map((r) => {
      const detalle = r.details ? ` — ${JSON.stringify(r.details).slice(0, 120)}` : "";
      return `• ${r.check_name} (${r.table_name}) — ${r.rows_affected} fila${r.rows_affected === 1 ? "" : "s"}${detalle}`;
    })
    .join("\n");
  return (
    `🔴 Integridad: ${criticals.length} check${criticals.length === 1 ? "" : "s"} crítico${criticals.length === 1 ? "" : "s"}\n` +
    `${lineas}`
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
