import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/api-auth";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { firmarFacturaPathSafe } from "@/lib/reclamos/factura-storage";
import { validateReclamoHeader } from "@/lib/reclamos/validate";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Máquina de estados del pipeline (Creado → En proceso → Pagado), con corrección
// de un paso hacia atrás. Validación de transición — fuente de verdad server.
// Notas: Creado → En proceso va por el endpoint /en-proceso (comprobante opcional).
// A Pagado NUNCA se llega por este PATCH: solo vía settlements con markPaid, que
// exige comprobante (foto o PDF) y acepta desde Creado (pago inmediato) o En proceso.
// Este PATCH solo permite los rollbacks de un paso.
const VALID_TRANSITIONS: Record<string, string[]> = {
  "Creado": ["En proceso"],
  "En proceso": ["Creado"],
  "Pagado": ["En proceso"],
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*), reclamo_settlements(*)")
    .eq("id", id)
    .eq("deleted", false)
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  if (data?.reclamo_seguimiento) {
    data.reclamo_seguimiento.sort((a: { created_at: string }, b: { created_at: string }) =>
      b.created_at.localeCompare(a.created_at));
  }

  // Firma el PDF de factura (signed URL TTL 1h) para "Ver factura". Nunca público.
  if (data?.factura_pdf_path) {
    data.factura_pdf_url = await firmarFacturaPathSafe(data.factura_pdf_path);
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

  // Obligatoriedad de cabecera al EDITAR: solo si el PATCH trae campos de cabecera
  // (no aplica a PATCH de solo-estado ni de solo-seguimiento). Evita dejar un
  // reclamo incompleto editando.
  const editaCabecera = ["empresa", "nro_factura", "fecha_reclamo", "nro_orden_compra"].some(
    (k) => fields[k] !== undefined,
  );
  if (editaCabecera) {
    const vErr = validateReclamoHeader({
      empresa: fields.empresa,
      nro_factura: fields.nro_factura,
      fecha_reclamo: fields.fecha_reclamo,
      nro_orden_compra: fields.nro_orden_compra,
    });
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });
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
  for (const key of ["empresa", "proveedor", "marca", "nro_factura", "nro_orden_compra", "fecha_reclamo", "notas", "estado", "monto_reclamado_snapshot", "factura_pdf_path"]) {
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
