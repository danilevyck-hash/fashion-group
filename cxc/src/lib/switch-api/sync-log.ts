/**
 * Helpers DEGRADABLES para registrar corridas en switch_sync_log (mismo formato
 * que switch-sync: empresa_key + sync_type + status running→success/error).
 *
 * Usados por los syncs que se sumaron al log en jul-2026 para la política
 * anti-ruido 401 (alert-policy.ts): articulos, multifashion, catalogo_reebok,
 * catalogo_joybees. Los syncs originales (facturas/estadocuenta/costo en
 * sync-empresa.ts, recibos, utilidad) conservan sus helpers propios.
 *
 * DEGRADABLE (patrón de syncCostoDiario): si el INSERT falla —p.ej. el CHECK de
 * sync_type aún no incluye el tipo nuevo (migración manual pendiente)— NO se
 * aborta el sync: se pierde solo la observabilidad de esa corrida (console.error)
 * y logId queda null. La política 401 es fail-open ante historia ilegible, así
 * que sin log el 401 alerta inmediato (comportamiento previo, sin regresión).
 */

import { supabaseServer } from "@/lib/supabase-server";

export type SwitchSyncTriggeredBy = "cron" | "manual" | "backfill";

// ─── Lock de corrida en curso (índice único parcial) ─────────────────────────
// DDL 20260723120000_switch_sync_running_lock.sql (manual): índice único
// parcial sobre (empresa_key, sync_type) WHERE status='running'. Con el índice
// aplicado, el INSERT de la fila 'running' se vuelve MUTEX: dos corridas
// simultáneas del mismo (empresa, tipo) → la 2ª falla con 23505. Mientras la
// DDL no corra, el insert nunca conflictúa y todo queda como antes (tolerante).

/** Ventana tras la cual una fila 'running' se considera huérfana (un run que
 *  murió sin finalizar; maxDuration es 300s, 30 min es holgadísimo). */
export const RUNNING_STALE_MIN = 30;

/** ¿El error es el conflicto del índice único de 'running' (23505)? Acepta el
 *  objeto de error de PostgREST, un Error ya envuelto o un string. */
export function isRunningLockConflict(err: unknown): boolean {
  const msg =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : err && typeof err === "object"
          ? `${(err as { code?: string }).code ?? ""} ${(err as { message?: string }).message ?? ""}`
          : "";
  return /23505|duplicate key|switch_sync_log_running_lock/i.test(msg);
}

/**
 * Cierra (status='error') las filas 'running' huérfanas (> RUNNING_STALE_MIN)
 * de un (empresa, tipo). CRÍTICO con el índice único: sin esta limpieza, una
 * corrida que murió sin finalizar bloquearía TODOS los inserts futuros de ese
 * par. Se llama antes de cada insert de fila running. Tolerante: nunca lanza.
 */
export async function clearStaleRunning(empresaKey: string, syncType: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RUNNING_STALE_MIN * 60 * 1000).toISOString();
    const { error } = await supabaseServer
      .from("switch_sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message:
          "Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run.",
      })
      .eq("empresa_key", empresaKey)
      .eq("sync_type", syncType)
      .eq("status", "running")
      .lt("started_at", cutoff);
    if (error) {
      console.error(`[sync-log ${empresaKey}/${syncType}] clearStaleRunning falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[sync-log ${empresaKey}/${syncType}] clearStaleRunning threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function createSwitchSyncLog(opts: {
  empresaKey: string;
  syncType: string;
  triggeredBy?: SwitchSyncTriggeredBy;
  rangeFrom?: string | null;
  rangeTo?: string | null;
}): Promise<string | null> {
  try {
    // Auto-sana huérfanos antes del insert: con el índice único de 'running'
    // una fila atascada bloquearía este insert para siempre.
    await clearStaleRunning(opts.empresaKey, opts.syncType);
    const { data, error } = await supabaseServer
      .from("switch_sync_log")
      .insert({
        empresa_key: opts.empresaKey,
        sync_type: opts.syncType,
        status: "running",
        range_from: opts.rangeFrom ?? null,
        range_to: opts.rangeTo ?? null,
        triggered_by: opts.triggeredBy ?? "cron",
        records_inserted: 0,
        records_updated: 0,
        records_skipped: 0,
      })
      .select("id")
      .single();
    if (error || !data) {
      // Conflicto del lock = hay OTRA corrida fresca del mismo (empresa, tipo)
      // en curso. Acá SÍ se lanza (mutex): el caller aborta limpio en vez de
      // correr en paralelo y chocar la sesión única de Switch.
      if (error && isRunningLockConflict(error)) {
        throw new Error(
          `Ya hay una corrida de ${opts.syncType} en curso para ${opts.empresaKey} (lock switch_sync_log_running_lock)`,
        );
      }
      console.error(
        `[sync-log ${opts.empresaKey}/${opts.syncType}] no pude crear switch_sync_log (¿CHECK de sync_type pendiente?): ${error?.message ?? "vacío"}`,
      );
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    if (isRunningLockConflict(err)) throw err; // mutex: no degradar el conflicto
    console.error(
      `[sync-log ${opts.empresaKey}/${opts.syncType}] createSwitchSyncLog threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function finishSwitchSyncLog(
  logId: string | null,
  status: "success" | "error",
  fields?: { inserted?: number; updated?: number; skipped?: number; errorMessage?: string },
): Promise<void> {
  if (!logId) return;
  try {
    const { error } = await supabaseServer
      .from("switch_sync_log")
      .update({
        status,
        finished_at: new Date().toISOString(),
        records_inserted: fields?.inserted ?? 0,
        records_updated: fields?.updated ?? 0,
        records_skipped: fields?.skipped ?? 0,
        error_message: fields?.errorMessage ? fields.errorMessage.slice(0, 2000) : null,
      })
      .eq("id", logId);
    if (error) console.error(`[sync-log] no pude finalizar switch_sync_log ${logId}: ${error.message}`);
  } catch (err) {
    console.error(`[sync-log] finishSwitchSyncLog threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
