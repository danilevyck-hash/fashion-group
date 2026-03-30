import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";

const PIEZAS = 12;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { product_id, sku, name, image_url, quantity, unit_price } = await req.json();

  if (!product_id) return NextResponse.json({ error: "product_id requerido" }, { status: 400 });

  if (quantity <= 0) {
    // Delete item
    await reebokServer.from("reebok_order_items").delete()
      .eq("order_id", params.id).eq("product_id", product_id);
  } else {
    // Upsert item
    const { data: existing } = await reebokServer.from("reebok_order_items")
      .select("id").eq("order_id", params.id).eq("product_id", product_id).maybeSingle();

    if (existing) {
      await reebokServer.from("reebok_order_items").update({ quantity })
        .eq("order_id", params.id).eq("product_id", product_id);
    } else {
      await reebokServer.from("reebok_order_items").insert({
        order_id: params.id, product_id, sku: sku || null, name: name || null,
        image_url: image_url || null, quantity: quantity || 1, unit_price: Number(unit_price) || 0,
      });
    }
  }

  // Recalc order total
  const { data: items } = await reebokServer.from("reebok_order_items")
    .select("quantity, unit_price").eq("order_id", params.id);
  const total = (items || []).reduce((s, i) => s + (i.quantity || 1) * PIEZAS * Number(i.unit_price || 0), 0);
  await reebokServer.from("reebok_orders").update({ total, updated_at: new Date().toISOString() }).eq("id", params.id);

  return NextResponse.json({ ok: true });
}
