import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

const ALLOWED_FIELDS = ["fecha", "descripcion", "proveedor", "categoria", "subtotal", "itbms", "total", "responsable", "metodo_pago", "numero_factura", "empresa"];

function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

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

  // Validate the gasto belongs to an open, non-deleted period before touching it.
  const { data: owning } = await supabaseServer
    .from("caja_gastos")
    .select("id, caja_periodos(estado, deleted)")
    .eq("id", params.id)
    .maybeSingle();
  if (!owning) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
  const periodo = Array.isArray(owning.caja_periodos) ? owning.caja_periodos[0] : owning.caja_periodos;
  if (!periodo || periodo.deleted) return NextResponse.json({ error: "Este período ya no existe." }, { status: 400 });
  if (periodo.estado !== "abierto") return NextResponse.json({ error: "No se pueden editar gastos de un período cerrado." }, { status: 400 });

  if (typeof fields.fecha === "string" && fields.fecha) {
    const hoyPanama = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    if (fields.fecha > hoyPanama) return NextResponse.json({ error: "La fecha no puede ser futura. Usa hoy o una fecha anterior." }, { status: 400 });
  }

  if (typeof fields.categoria === "string") fields.categoria = normalizeStr(fields.categoria) || "Varios";
  if (typeof fields.responsable === "string") fields.responsable = normalizeStr(fields.responsable);
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
