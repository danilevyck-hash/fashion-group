import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer.from("caja_categorias").select("nombre").order("nombre");
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json((data || []).map(c => c.nombre));
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { nombre } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const { error } = await supabaseServer.from("caja_categorias").insert({ nombre: nombre.trim() });
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
