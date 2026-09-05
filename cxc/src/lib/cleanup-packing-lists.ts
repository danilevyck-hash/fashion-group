// Lógica core del cron cleanup-packing-lists, extraída del route para poder
// llamarla IN-PROCESS desde la reconciliación (recuperación sin self-fetch),
// igual que cheques-alert. NO registra heartbeat ni logCronError ni escribe
// cron_email_errors: eso es del caller (route u orquestador).
//
// Red de packing lists (soft-delete + retención 90d):
//   - El borrado de usuario es SOFT (deleted_at). Los PL activos NUNCA se purgan.
//   - Purga FÍSICAMENTE solo los soft-deleted con > 90 días, y ANTES de purgar
//     hace un snapshot (PL + pl_items) en activity_logs para reconstruirlos.
//     pl_items caen por FK CASCADE.
//
// IDEMPOTENTE: re-ejecutar no rompe ni duplica. La 2da corrida ya no encuentra
// candidatos (los soft-deleted vencidos se purgaron) → deleted=0, sin snapshot
// nuevo. Solo entra al trabajo si HAY soft-deleted con retención vencida.

import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { RETENCION_PACKING_LISTS_DIAS } from "@/lib/packing-lists/retencion";

// El número vive en UN solo lugar, compartido con el texto de la pantalla
// (ver el encabezado de packing-lists/retencion.ts: la pantalla decía «7 días»).
const RETENCION_DIAS = RETENCION_PACKING_LISTS_DIAS;

export interface CleanupPackingResult {
  ok: boolean; // false solo si el select o el delete falló (el caller maneja el error)
  detail: string;
  deleted: number;
  cutoff: string;
}

export async function runCleanupPackingLists(): Promise<CleanupPackingResult> {
  const cutoff = new Date(Date.now() - RETENCION_DIAS * 86400000).toISOString();

  // 1. Candidatos a purga: soft-deleted con retención vencida.
  const { data: purgables, error: selErr } = await supabaseServer
    .from("packing_lists")
    .select("*")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  if (selErr) {
    return { ok: false, detail: selErr.message, deleted: 0, cutoff };
  }

  const ids = (purgables || []).map((p) => p.id as string);

  // Sin candidatos → nada que purgar (caso normal la mayoría de los días).
  if (ids.length === 0) {
    return { ok: true, detail: "sin candidatos", deleted: 0, cutoff };
  }

  // 2. Snapshot ANTES de purgar: PL header + pl_items en activity_logs.
  const { data: items } = await supabaseServer
    .from("pl_items")
    .select("*")
    .in("pl_id", ids);
  const itemsByPl = new Map<string, unknown[]>();
  for (const it of items || []) {
    const pid = String((it as { pl_id: string }).pl_id);
    const arr = itemsByPl.get(pid) || [];
    arr.push(it);
    itemsByPl.set(pid, arr);
  }
  for (const pl of purgables || []) {
    const plId = String((pl as { id: string }).id);
    await logActivity(
      "cron",
      "packing_list_purge_snapshot",
      "packing_lists",
      { pl, items: itemsByPl.get(plId) || [] },
    );
  }

  // 3. Purga física (pl_items por CASCADE).
  const { data: deleted, error } = await supabaseServer
    .from("packing_lists")
    .delete()
    .in("id", ids)
    .select("id");

  if (error) {
    return { ok: false, detail: error.message, deleted: 0, cutoff };
  }

  const count = deleted?.length || 0;
  await logActivity(
    "cron",
    "packing_lists_cleanup",
    "packing_lists",
    { deleted_count: count, cutoff_date: cutoff },
  );

  return { ok: true, detail: `${count} purgados`, deleted: count, cutoff };
}
