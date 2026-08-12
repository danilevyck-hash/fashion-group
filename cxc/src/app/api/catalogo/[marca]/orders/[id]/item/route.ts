// Upsert/eliminación de UN item del pedido, con el candado post-envío a
// Switch (#236). is_preorder solo existe en Reebok (Joybees no maneja
// pre-orden) — el payload lo incluye solo cuando la config lo dice.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig, type MarcaConfig } from "@/lib/catalogo/marcas";
import { getEnvioActivo, switchLockResponse } from "@/lib/catalogo/switch-lock";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";

/**
 * Re-escribe `<marca>_orders.total` desde los items que quedaron en la base,
 * con el MISMO criterio del PUT (categoría de la marca + piezas por bulto del
 * estilo). Sin esto, agregar una línea acá dejaba la columna con el total
 * VIEJO hasta que el autoguardado mandara un PUT — y con el botón "Guardar"
 * retirado, ese PUT ya no depende de que nadie lo toque.
 *
 * Es best-effort a propósito: el item YA se guardó y todo lo que se muestra
 * (detalle, lista, PDF, correo, Switch) recalcula el total desde los items. Si
 * esto falla, la columna queda vieja como antes — nunca se pierde el item.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalcularTotal(cfg: MarcaConfig, db: any, orderId: string): Promise<void> {
  const { data: filas, error } = await db
    .from(cfg.itemsRelation)
    .select("product_id, quantity, unit_price")
    .eq("order_id", orderId);
  if (error || !filas) return;
  const items = filas as { product_id: string; quantity: number; unit_price: number }[];
  const ids = items.map((i) => i.product_id);
  const categoryMap = cfg.categoryLookup ? await cfg.categoryLookup(ids) : new Map<string, string>();
  const { bultoPzasByProduct } = await leerCategoriaYBulto(db as never, cfg.productsTable, ids);
  const total = cfg.calcTotal(
    items.map((i) => ({
      quantity: i.quantity || 1,
      unit_price: Number(i.unit_price) || 0,
      category: categoryMap.get(i.product_id) || cfg.fallbackCategory || undefined,
      bulto_pzas: bultoPzasByProduct.get(i.product_id) ?? null,
    })),
  );
  await db
    .from(cfg.ordersTable)
    .update({ total, updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

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

  try {
    await recalcularTotal(cfg, db, params.id);
  } catch {
    /* el item ya se guardó; la columna `total` queda vieja como antes */
  }

  return NextResponse.json({ ok: true });
}
