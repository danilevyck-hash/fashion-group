import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("reebok_pedidos_publicos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching reebok pedidos:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
