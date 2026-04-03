import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

const ALLOWED_FIELDS = ["fecha", "descripcion", "proveedor", "categoria", "subtotal", "itbms", "total", "responsable", "metodo_pago", "numero_factura", "empresa"];

function pick(body: Record<string, unknown>, fields: string[]) {
  const result: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) result[f] = body[f]; }
  return result;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const fields = pick(body, ALLOWED_FIELDS);
  if (fields.itbms !== undefined) fields.itbms = Math.round((Number(fields.itbms) || 0) * 100) / 100;
  if (fields.total !== undefined) fields.total = Math.round((Number(fields.total) || 0) * 100) / 100;
  const { data, error } = await supabaseServer.from("caja_gastos").update(fields).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Error al actualizar gasto" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "caja_gasto_update", "caja", { gastoId: params.id, fields: Object.keys(fields) }, session?.userName);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { data: existing } = await supabaseServer.from("caja_gastos").select("id, descripcion, total").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });

  const { error } = await supabaseServer.from("caja_gastos").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error al eliminar gasto" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "caja_gasto_delete", "caja", { gastoId: params.id, descripcion: existing.descripcion, total: existing.total }, session?.userName);

  return NextResponse.json({ ok: true });
}
