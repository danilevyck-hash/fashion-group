import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  // Allow estado, motivo_rebote, fecha_depositado and all editable fields
  const allowed = ["cliente", "empresa", "banco", "numero_cheque", "monto", "fecha_deposito", "notas", "whatsapp", "estado", "motivo_rebote", "fecha_depositado"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (k in body) update[k] = body[k]; }
  const { data, error } = await supabaseServer
    .from("cheques")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabaseServer.from("cheques").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
