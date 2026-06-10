import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { runCleanupPackingLists } from "@/lib/cleanup-packing-lists";

export const dynamic = "force-dynamic";

const CRON_NAME = "cleanup-packing-lists";

// Red de packing lists (soft-delete + retención 90d). La lógica core vive en
// src/lib/cleanup-packing-lists.ts (runCleanupPackingLists), compartida con la
// recuperación in-process de switch-reconciliacion. Schedule diario 03:00 UTC.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = await runCleanupPackingLists();

  if (!r.ok) {
    console.error("[cleanup-packing-lists] failed:", r.detail);
    // Persistir el fallo en cron_email_errors — los logs de Vercel rotan
    // en 24h y el dashboard de salud necesita historial. Best-effort: si
    // el propio INSERT falla, igual devolvemos el 500 con el error real.
    try {
      const { error: logErr } = await supabaseServer
        .from("cron_email_errors")
        .insert({
          tipo: "cleanup_packing_lists",
          cheque_context: null,
          error_message: r.detail,
        });
      if (logErr) {
        console.error("[cleanup-packing-lists] cron_email_errors insert failed:", logErr.message);
      }
    } catch (logErr) {
      console.error("[cleanup-packing-lists] cron_email_errors insert threw:", logErr);
    }
    await logCronError("cleanup_packing_lists_failed", r.detail);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ deleted: r.deleted, cutoff: r.cutoff });
}
