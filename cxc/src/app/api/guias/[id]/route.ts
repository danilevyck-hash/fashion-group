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

  if (data?.guia_items) {
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { fecha, transportista, placa, observaciones, items, monto_total, estado } = body;

  // Update header
  const { error: guiaErr } = await supabaseServer
    .from("guia_transporte")
    .update({ fecha, transportista, placa, observaciones, monto_total: monto_total || 0, estado: estado || "Preparando" })
    .eq("id", id);

  if (guiaErr) return NextResponse.json({ error: guiaErr.message }, { status: 500 });

  // Delete old items, insert new
  await supabaseServer.from("guia_items").delete().eq("guia_id", id);

  if (items && items.length > 0) {
    const rows = items.map((item: Record<string, unknown>, i: number) => ({
      guia_id: id,
      orden: i + 1,
      cliente: item.cliente || "",
      direccion: item.direccion || "",
      empresa: item.empresa || "",
      facturas: item.facturas || "",
      bultos: item.bultos || 0,
      numero_guia_transp: item.numero_guia_transp || "",
    }));

    const { error: itemsErr } = await supabaseServer.from("guia_items").insert(rows);
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // Return updated guia with items
  const { data } = await supabaseServer
    .from("guia_transporte")
    .select("*, guia_items(*)")
    .eq("id", id)
    .single();

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
