import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHEQUES_ROLES = ["admin", "secretaria", "director"];

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CHEQUES_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const allowed = ["cliente", "empresa", "banco", "numero_cheque", "monto", "fecha_deposito", "notas", "whatsapp", "estado", "motivo_rebote", "fecha_depositado"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (k in body) update[k] = body[k]; }

  const { data: previous } = await supabaseServer.from("cheques").select("estado, monto, cliente").eq("id", params.id).single();

  // Block double-deposit: if cheque already deposited, reject further state changes
  if (previous?.estado === "depositado" && update.estado && update.estado !== "depositado") {
    return NextResponse.json({ error: "Este cheque ya fue depositado" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.from("cheques").update(update).eq("id", params.id).select().single();
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "cheque_update", "cheques", { chequeId: params.id, from: previous?.estado, to: update.estado, cliente: previous?.cliente }, session?.userName);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { data: existing } = await supabaseServer.from("cheques").select("id, cliente, monto").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Cheque no encontrado" }, { status: 404 });

  const { error } = await supabaseServer.from("cheques").update({ deleted: true }).eq("id", params.id);
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "cheque_delete", "cheques", { chequeId: params.id, cliente: existing.cliente, monto: existing.monto }, session?.userName);

  return NextResponse.json({ ok: true });
}
