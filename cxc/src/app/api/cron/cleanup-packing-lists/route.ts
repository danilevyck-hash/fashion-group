import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

// Borra packing_lists creados hace más de 7 días. pl_items caen por FK CASCADE
// (ver supabase/migrations/packing-lists-fk-cascade.sql). Schedule diario 03:00 UTC.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: deleted, error } = await supabaseServer
    .from("packing_lists")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[cleanup-packing-lists] delete failed:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const count = deleted?.length || 0;
  await logActivity(
    "cron",
    "packing_lists_cleanup",
    "packing_lists",
    { deleted_count: count, cutoff_date: cutoff },
  );

  return NextResponse.json({ deleted: count, cutoff });
}
