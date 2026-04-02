import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseServer
    .from("prestamos_empleados").select("*, prestamos_movimientos(*)").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { nombre, empresa, deduccion_quincenal, notas, activo } = body;
  const update: Record<string, unknown> = {};
  if (nombre !== undefined) update.nombre = nombre;
  if (empresa !== undefined) update.empresa = empresa;
  if (deduccion_quincenal !== undefined) update.deduccion_quincenal = deduccion_quincenal;
  if (notas !== undefined) update.notas = notas;
  if (activo !== undefined) update.activo = activo;

  const { data, error } = await supabaseServer.from("prestamos_empleados").update(update).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "prestamo_empleado_update", "prestamos", { empleadoId: params.id, fields: Object.keys(update) }, session?.userName);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: existing } = await supabaseServer.from("prestamos_empleados").select("id, nombre").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

  // Soft delete
  const { error } = await supabaseServer.from("prestamos_empleados").update({ deleted: true, activo: false }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "prestamo_empleado_delete", "prestamos", { empleadoId: params.id, nombre: existing.nombre }, session?.userName);

  return NextResponse.json({ ok: true });
}
