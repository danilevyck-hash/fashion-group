// Upsert/eliminación de UN item del pedido, con el candado post-envío a
// Switch (#236). is_preorder solo existe en Reebok (Joybees no maneja
// pre-orden) — el payload lo incluye solo cuando la config lo dice.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { getEnvioActivo, switchLockResponse } from "@/lib/catalogo/switch-lock";

export async function PATCH(req: NextRequest, { params }: { params: { marca: string; id: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const { product_id, sku, name, image_url, quantity, unit_price, is_preorder } = await req.json();
  if (!product_id) return NextResponse.json({ error: "product_id requerido" }, { status: 400 });

  const db = await cfg.db();

  // Candado post-envío a Switch: un pedido ya enviado no acepta cambios de items.
  const envio = await getEnvioActivo(db, cfg.enviosTable, params.id);
  if (envio) return switchLockResponse(envio);

  const itemsTable = cfg.itemsRelation;
  if (quantity <= 0) {
    const { error } = await db.from(itemsTable).delete()
      .eq("order_id", params.id).eq("product_id", product_id);
    if (error) return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  } else {
    const { error } = await db.from(itemsTable)
      .upsert({
        order_id: params.id, product_id, sku: sku || null, name: name || null,
        image_url: image_url || null, quantity, unit_price: Number(unit_price) || 0,
        ...(cfg.itemsHasPreorder ? { is_preorder: is_preorder === true } : {}),
      }, { onConflict: "order_id,product_id" });
    if (error) return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
