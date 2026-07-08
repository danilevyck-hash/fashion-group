/**
 * Telemetría compartida para crons: heartbeat de éxito + alerta de error.
 *
 * - recordCronHeartbeat(name): registra que el cron terminó OK hoy. El watchdog
 *   (dentro de switch-reconciliacion, 10/14/18 UTC) revisa estos heartbeats y
 *   alerta si alguno excede su umbral stale (cronStaleThresholdHours: 26h por
 *   defecto, propio para crons no diarios como grupo-resumen-mensual).
 * - logCronError(tipo, message, context?, opts?): persiste el error en
 *   cron_email_errors (igual que antes) Y dispara una alerta Telegram con el
 *   error truncado a 200 chars (shortError). Si el caller ya mandó su propia
 *   alerta Telegram con más detalle, pasar { telegram: false } para persistir
 *   sin duplicar el aviso. Tolerante a fallos: nunca lanza, así un fallo de
 *   logging no tumba al cron que lo llama.
 *
 * Requiere la tabla cron_heartbeats (ver migración
 * supabase/migrations/*_cron_heartbeats.sql) — aplicar manualmente.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { sendTelegramAlert, shortError } from "@/lib/telegram";

// ─── Umbrales de "staleness" del watchdog (fuente ÚNICA para AMBOS watchdogs) ──
// Hay dos vigías de crons: health-crons (monitor externo, responde 200/503) y el
// watchdog Telegram dentro de switch-reconciliacion. Antes cada uno tenía su
// propia copia del umbral; el de switch-reconciliacion se quedó sin el mapa
// mensual y alertaba falsamente que grupo-resumen-mensual (mensual, día 3)
// estaba caído. Ambos importan estas constantes/helpers para no volver a divergir.

/** Umbral por defecto (horas) sin success antes de marcar un cron como stale.
 *  26h da margen sobre el ciclo diario (1×/día) sin tragarse un día entero. */
export const CRON_STALE_HOURS_DEFAULT = 26;

/** Umbrales propios por cron NO diario. El default de 26h marcaría un cron
 *  mensual como caído ~29 días/mes; grupo-resumen-mensual corre el día 3 → 33
 *  días cubren el gap más largo entre corridas aun con jitter. */
export const CRON_STALE_HOURS_POR_CRON: Record<string, number> = {
  "grupo-resumen-mensual": 33 * 24,
};

/** Horas de umbral stale para un cron (su override propio o el default). */
export function cronStaleThresholdHours(cronName: string): number {
  return CRON_STALE_HOURS_POR_CRON[cronName] ?? CRON_STALE_HOURS_DEFAULT;
}

/** ¿Un cron está stale? true si nunca registró success (fecha inválida/ausente)
 *  o si su último success es anterior al umbral (propio o default). Lógica ÚNICA
 *  usada por health-crons y por el watchdog de switch-reconciliacion. */
export function cronIsStale(
  cronName: string,
  lastSuccessAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const t = lastSuccessAt ? new Date(lastSuccessAt).getTime() : NaN;
  if (!Number.isFinite(t)) return true;
  return t < now - cronStaleThresholdHours(cronName) * 3600 * 1000;
}

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
 * el esquema existente de la tabla). `opts.telegram` (default true) permite
 * persistir sin mandar Telegram cuando el caller ya envió una alerta propia
 * más específica (evita el doble aviso).
 */
export async function logCronError(
  tipo: string,
  message: string,
  context?: string | null,
  opts?: { telegram?: boolean },
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

  // 2. Alerta Telegram con el error truncado (best-effort; sendTelegramAlert no
  // lanza). Se omite si el caller ya mandó su propia alerta específica.
  if (opts?.telegram !== false) {
    await sendTelegramAlert(`🚨 Cron error — ${tipo}\n${shortError(message)}`);
  }
}
