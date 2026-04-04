import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { stock_comprado } = await req.json();
  if (typeof stock_comprado !== "number" || stock_comprado < 0) {
    return NextResponse.json({ error: "stock_comprado inválido" }, { status: 400 });
  }
  const { error } = await supabaseServer
    .from("camisetas_productos")
    .update({ stock_comprado })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
