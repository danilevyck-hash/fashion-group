import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]); if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("cxc_uploads")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
