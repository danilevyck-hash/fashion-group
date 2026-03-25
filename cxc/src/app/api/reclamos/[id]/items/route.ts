import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { items } = await req.json();
  const { error: delErr } = await supabaseServer.from("reclamo_items").delete().eq("reclamo_id", params.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (items?.length > 0) {
    const rows = items.map((item: Record<string, unknown>) => ({
      reclamo_id: params.id,
      referencia: String(item.referencia || ""),
      descripcion: String(item.descripcion || ""),
      talla: String(item.talla || ""),
      cantidad: Number(item.cantidad) || 1,
      precio_unitario: Number(item.precio_unitario) || 0,
      subtotal: (Number(item.cantidad) || 1) * (Number(item.precio_unitario) || 0),
      motivo: String(item.motivo || "Faltante de Mercancía"),
    }));
    const { error: insErr } = await supabaseServer.from("reclamo_items").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
