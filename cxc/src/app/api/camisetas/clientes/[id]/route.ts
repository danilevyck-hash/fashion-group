import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { estado } = await req.json();
  if (!estado) return NextResponse.json({ error: "estado required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("camisetas_clientes")
    .update({ estado })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  // Delete pedidos first, then client
  await supabaseServer.from("camisetas_pedidos").delete().eq("cliente_id", id);
  const { error } = await supabaseServer.from("camisetas_clientes").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
