import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

// Última corrida exitosa del cron `joybees-catalogo` (cron_heartbeats), para el
// indicador "Sincronizado con Switch hace X" del catálogo admin. Read-only.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const { data } = await supabaseServer
    .from("cron_heartbeats")
    .select("last_success_at")
    .eq("cron_name", "joybees-catalogo")
    .maybeSingle();

  return NextResponse.json({ lastSync: data?.last_success_at ?? null });
}
