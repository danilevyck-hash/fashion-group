import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/api-auth";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
    .eq("id", id)
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  if (data?.reclamo_seguimiento) {
    data.reclamo_seguimiento.sort((a: { created_at: string }, b: { created_at: string }) =>
      b.created_at.localeCompare(a.created_at));
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json();
  const { seguimiento_nota, autor, ...fields } = body;

  if (seguimiento_nota) {
    await supabaseServer.from("reclamo_seguimiento").insert({
      reclamo_id: id,
      nota: seguimiento_nota,
      autor: autor || "",
    });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["empresa", "proveedor", "marca", "nro_factura", "nro_orden_compra", "fecha_reclamo", "notas", "estado"]) {
    if (fields[key] !== undefined) updates[key] = fields[key];
  }

  if (Object.keys(updates).length > 1) {
    const { error } = await supabaseServer.from("reclamos").update(updates).eq("id", id);
    if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req); if (denied) return denied;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Check reclamo exists
  const { data: existing } = await supabaseServer.from("reclamos").select("id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });

  const { data: fotos } = await supabaseServer
    .from("reclamo_fotos")
    .select("storage_path")
    .eq("reclamo_id", id);

  if (fotos) {
    for (const f of fotos) {
      await supabaseServer.storage.from("reclamo-fotos").remove([f.storage_path]);
    }
  }

  const { error } = await supabaseServer.from("reclamos").delete().eq("id", id);
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
