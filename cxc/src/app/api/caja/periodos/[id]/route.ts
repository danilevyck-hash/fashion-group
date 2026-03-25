import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const { data, error } = await supabaseServer
    .from("caja_periodos")
    .select("*, caja_gastos(*)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data?.caja_gastos) {
    data.caja_gastos.sort((a: { fecha: string; created_at: string }, b: { fecha: string; created_at: string }) =>
      a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at)
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body = close period */ }

  if (body.action === "repuesto") {
    const { error } = await supabaseServer
      .from("caja_periodos")
      .update({ repuesto: true, repuesto_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Default: close period
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer
    .from("caja_periodos")
    .update({ estado: "cerrado", fecha_cierre: today })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { error } = await supabaseServer
    .from("caja_periodos")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
