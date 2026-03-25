import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data?.reclamo_seguimiento) {
    data.reclamo_seguimiento.sort((a: { created_at: string }, b: { created_at: string }) =>
      b.created_at.localeCompare(a.created_at));
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { estado, notas, seguimiento_nota, autor } = body;

  if (seguimiento_nota) {
    await supabaseServer.from("reclamo_seguimiento").insert({
      reclamo_id: params.id,
      nota: seguimiento_nota,
      autor: autor || "",
    });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (estado) updates.estado = estado;
  if (notas !== undefined) updates.notas = notas;

  if (Object.keys(updates).length > 1) {
    const { error } = await supabaseServer.from("reclamos").update(updates).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Get fotos to delete from storage
  const { data: fotos } = await supabaseServer
    .from("reclamo_fotos")
    .select("storage_path")
    .eq("reclamo_id", params.id);

  if (fotos) {
    for (const f of fotos) {
      await supabaseServer.storage.from("reclamo-fotos").remove([f.storage_path]);
    }
  }

  const { error } = await supabaseServer.from("reclamos").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
