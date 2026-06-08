import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";

const CRON_NAME = "cleanup-packing-lists";
const RETENCION_DIAS = 90;

// Red de packing lists (soft-delete + retención):
//   - El borrado de usuario es SOFT (deleted_at). Los PL activos NUNCA se
//     purgan por edad (antes se borraban a los 7 días — eso se quitó).
//   - Este cron purga FÍSICAMENTE solo los soft-deleted con > 90 días, y ANTES
//     de purgar hace un snapshot (PL + pl_items) en activity_logs para poder
//     reconstruirlos. pl_items caen por FK CASCADE.
// Schedule diario 03:00 UTC.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENCION_DIAS * 86400000).toISOString();

  // 1. Candidatos a purga: soft-deleted con retención vencida.
  const { data: purgables, error: selErr } = await supabaseServer
    .from("packing_lists")
    .select("*")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  if (selErr) {
    console.error("[cleanup-packing-lists] select failed:", selErr.message);
    await logCronError("cleanup_packing_lists_failed", selErr.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const ids = (purgables || []).map((p) => p.id as string);

  // Sin candidatos → nada que purgar (caso normal la mayoría de los días).
  if (ids.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({ deleted: 0, cutoff });
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
    console.error("[cleanup-packing-lists] delete failed:", error.message);
    // Persistir el fallo en cron_email_errors — los logs de Vercel rotan
    // en 24h y el dashboard de salud necesita historial. Best-effort: si
    // el propio INSERT falla, igual devolvemos el 500 con el error real.
    try {
      const { error: logErr } = await supabaseServer
        .from("cron_email_errors")
        .insert({
          tipo: "cleanup_packing_lists",
          cheque_context: null,
          error_message: error.message,
        });
      if (logErr) {
        console.error("[cleanup-packing-lists] cron_email_errors insert failed:", logErr.message);
      }
    } catch (logErr) {
      console.error("[cleanup-packing-lists] cron_email_errors insert threw:", logErr);
    }
    await logCronError("cleanup_packing_lists_failed", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const count = deleted?.length || 0;
  await logActivity(
    "cron",
    "packing_lists_cleanup",
    "packing_lists",
    { deleted_count: count, cutoff_date: cutoff },
  );

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ deleted: count, cutoff });
}
