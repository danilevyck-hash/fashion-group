import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseServer
    .from("prestamos_empleados")
    .select("*, prestamos_movimientos(*)")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { data, error } = await supabaseServer
    .from("prestamos_empleados")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Check if employee has movements
  const { count, error: countErr } = await supabaseServer
    .from("prestamos_movimientos")
    .select("id", { count: "exact", head: true })
    .eq("empleado_id", params.id);

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

  if (count && count > 0) {
    return NextResponse.json(
      { error: "No se puede eliminar un empleado con movimientos. Puedes archivarlo si está saldado." },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer
    .from("prestamos_empleados")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
