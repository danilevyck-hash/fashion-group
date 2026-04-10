import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

const RECLAMOS_ROLES = ["admin", "secretaria"];
const ALLOWED_FIELDS = ["empresa", "nombre", "nombre_contacto", "whatsapp", "correo", "activo"];

function pick(body: Record<string, unknown>, fields: string[]) {
  const result: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) result[f] = body[f]; }
  return result;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("reclamo_contactos")
    .select("*")
    .eq("activo", true)
    .order("empresa");

  if (error) return NextResponse.json({ error: "Error al cargar contactos" }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const fields = pick(body, ALLOWED_FIELDS);
  if (!fields.empresa) return NextResponse.json({ error: "Empresa requerida" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("reclamo_contactos")
    .insert(fields)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Error al crear contacto" }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const fields = pick(body, ALLOWED_FIELDS);

  const { data, error } = await supabaseServer
    .from("reclamo_contactos")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Error al actualizar contacto" }, { status: 500 });
  return NextResponse.json(data);
}
