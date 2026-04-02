import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const allowed = ["tipo", "monto", "fecha", "descripcion", "estado", "aprobado_por"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (body[k] !== undefined) update[k] = body[k]; }

  const { data, error } = await supabaseServer.from("prestamos_movimientos").update(update).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", body.estado === "aprobado" ? "prestamo_approve" : "prestamo_mov_update", "prestamos", { movimientoId: params.id, fields: Object.keys(update) }, session?.userName);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: existing } = await supabaseServer.from("prestamos_movimientos").select("id, tipo, monto, empleado_id").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });

  const { error } = await supabaseServer.from("prestamos_movimientos").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "prestamo_mov_delete", "prestamos", { movimientoId: params.id, tipo: existing.tipo, monto: existing.monto }, session?.userName);

  return NextResponse.json({ ok: true });
}
