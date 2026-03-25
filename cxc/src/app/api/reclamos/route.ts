import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { empresa, proveedor, marca, nro_factura, nro_orden_compra, fecha_reclamo, notas, items } = body;

  if (!empresa || !nro_factura || !fecha_reclamo) {
    return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 });
  }

  // Generate nro_reclamo with retry to avoid UNIQUE conflicts
  const year = new Date().getFullYear();
  let nro_reclamo = "";
  let attempts = 0;
  while (!nro_reclamo && attempts < 5) {
    attempts++;
    const { count } = await supabaseServer
      .from("reclamos")
      .select("*", { count: "exact", head: true })
      .then((r) => ({ count: r.count ?? 0 }));
    const seq = (count || 0) + attempts;
    const candidate = `REC-${year}-${String(seq).padStart(4, "0")}`;
    const { data: existing } = await supabaseServer
      .from("reclamos")
      .select("id")
      .eq("nro_reclamo", candidate)
      .maybeSingle();
    if (!existing) nro_reclamo = candidate;
  }
  if (!nro_reclamo) nro_reclamo = `REC-${year}-${Date.now()}`;

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
      estado: "Enviado",
      notas: notas || "",
    })
    .select()
    .single();

  if (recErr) return NextResponse.json({
    error: recErr.message,
    code: recErr.code,
    details: recErr.details,
    hint: recErr.hint,
    attempted_nro: nro_reclamo,
  }, { status: 500 });

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
    if (itemsErr) return NextResponse.json({ error: itemsErr.message, hint: "Items insert failed" }, { status: 500 });
  }

  const { data: full } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .eq("id", reclamo.id)
    .single();

  return NextResponse.json(full);
}
