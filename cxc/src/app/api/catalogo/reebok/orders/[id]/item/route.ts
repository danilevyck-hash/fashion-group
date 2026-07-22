import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getEnvioActivo, switchLockResponse } from "@/lib/catalogo/switch-lock";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const { product_id, sku, name, image_url, quantity, unit_price, is_preorder } = await req.json();
  if (!product_id) return NextResponse.json({ error: "product_id requerido" }, { status: 400 });

  // Candado post-envío a Switch: un pedido ya enviado no acepta cambios de items.
  const envio = await getEnvioActivo(reebokServer, "reebok_switch_envios", params.id);
  if (envio) return switchLockResponse(envio);

  if (quantity <= 0) {
    const { error } = await reebokServer.from("reebok_order_items").delete()
      .eq("order_id", params.id).eq("product_id", product_id);
    if (error) return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  } else {
    const { error } = await reebokServer.from("reebok_order_items")
      .upsert({
        order_id: params.id, product_id, sku: sku || null, name: name || null,
        image_url: image_url || null, quantity, unit_price: Number(unit_price) || 0,
        is_preorder: is_preorder === true,
      }, { onConflict: "order_id,product_id" });
    if (error) return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
