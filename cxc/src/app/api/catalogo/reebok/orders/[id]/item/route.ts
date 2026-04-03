import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria", "upload", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const { product_id, sku, name, image_url, quantity, unit_price } = await req.json();
  if (!product_id) return NextResponse.json({ error: "product_id requerido" }, { status: 400 });

  if (quantity <= 0) {
    const { error } = await reebokServer.from("reebok_order_items").delete()
      .eq("order_id", params.id).eq("product_id", product_id);
    if (error) return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  } else {
    const { error } = await reebokServer.from("reebok_order_items")
      .upsert({
        order_id: params.id, product_id, sku: sku || null, name: name || null,
        image_url: image_url || null, quantity, unit_price: Number(unit_price) || 0,
      }, { onConflict: "order_id,product_id" });
    if (error) return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
