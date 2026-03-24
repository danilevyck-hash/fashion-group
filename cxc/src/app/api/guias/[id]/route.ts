import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const { data, error } = await supabaseServer
    .from("guia_transporte")
    .select("*, guia_items(*)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sort items by orden
  if (data?.guia_items) {
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const { error } = await supabaseServer
    .from("guia_transporte")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
