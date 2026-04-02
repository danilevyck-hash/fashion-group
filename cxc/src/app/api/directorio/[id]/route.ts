import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const { nombre, empresa, telefono, celular, correo, contacto, notas } = body;
  const { data, error } = await supabaseServer.from("directorio_clientes").update({ nombre, empresa, telefono, celular, correo, contacto, notas }).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "directorio_update", "directorio", { clienteId: params.id, nombre }, session?.userName);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const { data: existing } = await supabaseServer.from("directorio_clientes").select("id, nombre").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const { error } = await supabaseServer.from("directorio_clientes").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "directorio_delete", "directorio", { clienteId: params.id, nombre: existing.nombre }, session?.userName);

  return NextResponse.json({ ok: true });
}
