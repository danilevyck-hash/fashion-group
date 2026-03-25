import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message, details: error, hint: "GET failed" }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { empresa, proveedor, marca, nro_factura, nro_orden_compra, fecha_reclamo, notas, items } = body;

  if (!empresa || !nro_factura || !fecha_reclamo) {
    return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 });
  }

  // Generate nro_reclamo: REC-YYYY-NNNN
  const year = new Date().getFullYear();
  let seq = 1;
  try {
    const { data: existing, error: countErr } = await supabaseServer
      .from("reclamos")
      .select("nro_reclamo")
      .like("nro_reclamo", `REC-${year}-%`)
      .order("nro_reclamo", { ascending: false })
      .limit(1);

    if (!countErr && existing && existing.length > 0) {
      const last = existing[0].nro_reclamo as string;
      const parts = last.split("-");
      seq = (parseInt(parts[2]) || 0) + 1;
    }
  } catch {
    // If table is empty or query fails, start at 1
  }

  const nro_reclamo = `REC-${year}-${String(seq).padStart(4, "0")}`;

  const { data: reclamo, error: recErr } = await supabaseServer
    .from("reclamos")
    .insert({
      nro_reclamo,
      empresa,
      proveedor: proveedor || "",
      marca: marca || "",
      nro_factura,
      nro_orden_compra: nro_orden_compra || "",
      fecha_reclamo,
      notas: notas || "",
    })
    .select()
    .single();

  if (recErr) return NextResponse.json({ error: recErr.message, details: recErr, hint: "Insert failed", nro_reclamo }, { status: 500 });

  if (items && items.length > 0) {
    const rows = items.map((item: Record<string, unknown>) => ({
      reclamo_id: reclamo.id,
      referencia: item.referencia || "",
      descripcion: item.descripcion || "",
      talla: item.talla || "",
      cantidad: item.cantidad || 0,
      precio_unitario: item.precio_unitario || 0,
      subtotal: ((item.cantidad as number) || 0) * ((item.precio_unitario as number) || 0),
      motivo: item.motivo || "",
    }));
    const { error: itemsErr } = await supabaseServer.from("reclamo_items").insert(rows);
    if (itemsErr) return NextResponse.json({ error: itemsErr.message, details: itemsErr, hint: "Items insert failed" }, { status: 500 });
  }

  // Return with items
  const { data: full } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .eq("id", reclamo.id)
    .single();

  return NextResponse.json(full);
}
