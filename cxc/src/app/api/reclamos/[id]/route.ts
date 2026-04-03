import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/api-auth";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TRANSITIONS: Record<string, string[]> = {
  "Borrador": ["Enviado"],
  "Enviado": ["En revisión"],
  "En revisión": ["Resuelto con NC", "Rechazado"],
  "Resuelto con NC": [],
  "Rechazado": [],
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria", "upload", "director"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
    .eq("id", id)
    .eq("deleted", false)
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  if (data?.reclamo_seguimiento) {
    data.reclamo_seguimiento.sort((a: { created_at: string }, b: { created_at: string }) =>
      b.created_at.localeCompare(a.created_at));
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json();
  const { seguimiento_nota, autor, ...fields } = body;

  if (seguimiento_nota) {
    await supabaseServer.from("reclamo_seguimiento").insert({
      reclamo_id: id, nota: seguimiento_nota, autor: autor || "",
    });
  }

  // Validate estado transition
  if (fields.estado !== undefined) {
    const { data: current } = await supabaseServer.from("reclamos").select("estado").eq("id", id).single();
    if (current && fields.estado !== current.estado) {
      const allowed = VALID_TRANSITIONS[current.estado] || [];
      if (!allowed.includes(fields.estado)) {
        return NextResponse.json({ error: `Transición inválida: ${current.estado} → ${fields.estado}` }, { status: 400 });
      }
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["empresa", "proveedor", "marca", "nro_factura", "nro_orden_compra", "fecha_reclamo", "notas", "estado"]) {
    if (fields[key] !== undefined) updates[key] = fields[key];
  }

  if (Object.keys(updates).length > 1) {
    const { error } = await supabaseServer.from("reclamos").update(updates).eq("id", id);
    if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "reclamo_edit", "reclamos", { reclamoId: id, fields: Object.keys(updates) }, session?.userName);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req); if (denied) return denied;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { data: existing } = await supabaseServer.from("reclamos").select("id, nro_reclamo, empresa").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });

  // Soft delete
  const { error } = await supabaseServer.from("reclamos").update({ deleted: true }).eq("id", id);
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "reclamo_delete", "reclamos", { reclamoId: id, nro_reclamo: existing.nro_reclamo, empresa: existing.empresa }, session?.userName);

  return NextResponse.json({ ok: true });
}
