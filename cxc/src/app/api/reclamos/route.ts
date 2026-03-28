import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
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

  let itemsWarning = "";
  if (items && items.length > 0) {
    // First attempt: with subtotal
    const rowsFull = items.map((item: Record<string, unknown>) => ({
      reclamo_id: reclamo.id,
      referencia: String(item.referencia || ""),
      descripcion: String(item.descripcion || ""),
      talla: String(item.talla || ""),
      cantidad: Number(item.cantidad) || 1,
      precio_unitario: Number(item.precio_unitario) || 0,
      subtotal: (Number(item.cantidad) || 1) * (Number(item.precio_unitario) || 0),
      motivo: String(item.motivo || "Faltante de Mercancía"),
      nro_factura: String(item.nro_factura || ""),
      nro_orden_compra: String(item.nro_orden_compra || ""),
    }));
    const { error: err1 } = await supabaseServer.from("reclamo_items").insert(rowsFull);
    if (err1) {
      console.error("Items insert error:", JSON.stringify(err1));
      // Retry without subtotal in case column type mismatch
      const rowsMin = items.map((item: Record<string, unknown>) => ({
        reclamo_id: reclamo.id,
        referencia: String(item.referencia || ""),
        descripcion: String(item.descripcion || ""),
        talla: String(item.talla || ""),
        cantidad: Number(item.cantidad) || 1,
        precio_unitario: Number(item.precio_unitario) || 0,
        motivo: String(item.motivo || "Faltante de Mercancía"),
        nro_factura: String(item.nro_factura || ""),
        nro_orden_compra: String(item.nro_orden_compra || ""),
      }));
      const { error: err2 } = await supabaseServer.from("reclamo_items").insert(rowsMin);
      if (err2) {
        console.error("Items retry error:", JSON.stringify(err2));
        itemsWarning = err2.message;
      }
    }
  }

  const { data: full } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .eq("id", reclamo.id)
    .single();

  await logActivity("system", "reclamo_creado", "reclamo", reclamo.id, `${empresa} — Factura ${nro_factura}`);
  return NextResponse.json({ ...(full || reclamo), items_warning: itemsWarning || undefined });
}
