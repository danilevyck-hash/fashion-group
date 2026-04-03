import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

const CAJA_ROLES = ["admin", "secretaria", "upload"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("caja_responsables")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { nombre } = body;

  const { data, error } = await supabaseServer
    .from("caja_responsables")
    .insert({ nombre })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
