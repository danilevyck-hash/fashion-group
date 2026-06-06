/**
 * Telemetría compartida para crons: heartbeat de éxito + alerta de error.
 *
 * - recordCronHeartbeat(name): registra que el cron terminó OK hoy. El watchdog
 *   (dentro de switch-reconciliacion, 10:00 UTC) revisa estos heartbeats y alerta
 *   si alguno lleva >30h sin success.
 * - logCronError(tipo, message, context?): persiste el error en cron_email_errors
 *   (igual que antes) Y dispara una alerta Telegram con el error truncado a 200
 *   chars (shortError). Tolerante a fallos: nunca lanza, así un fallo de logging
 *   no tumba al cron que lo llama.
 *
 * Requiere la tabla cron_heartbeats (ver migración
 * supabase/migrations/*_cron_heartbeats.sql) — aplicar manualmente.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { sendTelegramAlert, shortError } from "@/lib/telegram";

/** Marca al cron como exitoso ahora (upsert por cron_name). No lanza. */
export async function recordCronHeartbeat(cronName: string): Promise<void> {
  try {
    const { error } = await supabaseServer
      .from("cron_heartbeats")
      .upsert(
        { cron_name: cronName, last_success_at: new Date().toISOString() },
        { onConflict: "cron_name" },
      );
    if (error) {
      console.error(`[cron-telemetry] heartbeat ${cronName} falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[cron-telemetry] heartbeat ${cronName} threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Registra un error de cron en cron_email_errors y dispara alerta Telegram.
 * No lanza. `context` es opcional (se guarda en cheque_context por compat con
 * el esquema existente de la tabla).
 */
export async function logCronError(
  tipo: string,
  message: string,
  context?: string | null,
): Promise<void> {
  // 1. Persistir en cron_email_errors (best-effort).
  try {
    const { error } = await supabaseServer.from("cron_email_errors").insert({
      tipo,
      cheque_context: context ?? null,
      error_message: message,
    });
    if (error) {
      console.error(`[cron-telemetry] insert cron_email_errors falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[cron-telemetry] insert cron_email_errors threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Alerta Telegram con el error truncado (best-effort; sendTelegramAlert no lanza).
  await sendTelegramAlert(`🚨 Cron error — ${tipo}\n${shortError(message)}`);
}
