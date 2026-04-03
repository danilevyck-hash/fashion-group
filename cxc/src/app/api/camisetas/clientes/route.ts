import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const { nombre } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: "nombre required" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("camisetas_clientes")
    .insert({ nombre: nombre.trim(), estado: "Pendiente" })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
