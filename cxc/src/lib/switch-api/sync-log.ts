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

export async function createSwitchSyncLog(opts: {
  empresaKey: string;
  syncType: string;
  triggeredBy?: SwitchSyncTriggeredBy;
  rangeFrom?: string | null;
  rangeTo?: string | null;
}): Promise<string | null> {
  try {
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
      console.error(
        `[sync-log ${opts.empresaKey}/${opts.syncType}] no pude crear switch_sync_log (¿CHECK de sync_type pendiente?): ${error?.message ?? "vacío"}`,
      );
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
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
