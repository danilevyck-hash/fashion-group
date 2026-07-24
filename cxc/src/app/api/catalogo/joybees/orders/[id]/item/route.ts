// Espejo Joybees de reebok/orders/[id]/item — upsert/eliminación de UN item
// del pedido, con el candado post-envío a Switch (#236). Joybees no maneja
// pre-orden (is_preorder es concepto solo-Reebok).

import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getEnvioActivo, switchLockResponse } from "@/lib/catalogo/switch-lock";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const { product_id, sku, name, image_url, quantity, unit_price } = await req.json();
  if (!product_id) return NextResponse.json({ error: "product_id requerido" }, { status: 400 });

  // Candado post-envío a Switch: un pedido ya enviado no acepta cambios de items.
  const envio = await getEnvioActivo(joybeesServer, "joybees_switch_envios", params.id);
  if (envio) return switchLockResponse(envio);

  if (quantity <= 0) {
    const { error } = await joybeesServer.from("joybees_order_items").delete()
      .eq("order_id", params.id).eq("product_id", product_id);
    if (error) return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  } else {
    const { error } = await joybeesServer.from("joybees_order_items")
      .upsert({
        order_id: params.id, product_id, sku: sku || null, name: name || null,
        image_url: image_url || null, quantity, unit_price: Number(unit_price) || 0,
      }, { onConflict: "order_id,product_id" });
    if (error) return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
