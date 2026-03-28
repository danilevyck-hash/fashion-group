import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("guia_transporte")
    .select("*, guia_items(*)")
    .eq("id", id)
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  if (data?.guia_items) {
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const { fecha, transportista, placa, observaciones, items, monto_total, estado, receptor_nombre, cedula, firma_base64, firma_entregador_base64, entregado_por, numero_guia_transp } = body;

  // Update header
  const updateData: Record<string, unknown> = {};
  if (fecha !== undefined) updateData.fecha = fecha;
  if (transportista !== undefined) updateData.transportista = transportista;
  if (placa !== undefined) updateData.placa = placa;
  if (observaciones !== undefined) updateData.observaciones = observaciones;
  if (monto_total !== undefined) updateData.monto_total = monto_total || 0;
  if (estado !== undefined) updateData.estado = estado;
  if (receptor_nombre !== undefined) updateData.receptor_nombre = receptor_nombre;
  if (cedula !== undefined) updateData.cedula = cedula;
  if (firma_base64 !== undefined) updateData.firma_base64 = firma_base64;
  if (entregado_por !== undefined) updateData.entregado_por = entregado_por;
  if (numero_guia_transp !== undefined) updateData.numero_guia_transp = numero_guia_transp;
  if (firma_entregador_base64 !== undefined) updateData.firma_entregador_base64 = firma_entregador_base64;

  const { error: guiaErr } = await supabaseServer
    .from("guia_transporte")
    .update(updateData)
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const allowed = ["placa", "observaciones", "estado", "receptor_nombre", "cedula", "firma_base64", "firma_entregador_base64", "entregado_por", "numero_guia_transp", "nombre_entregador", "cedula_entregador", "firma_transportista"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const { error } = await supabaseServer.from("guia_transporte").update(update).eq("id", params.id);
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { error } = await supabaseServer
    .from("guia_transporte")
    .delete()
    .eq("id", id);

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
