// Pedidos internos del catálogo (lista + creación), dirigido por MARCAS_CONFIG.
//
// QUIRKS heredados (unificar con OK de Daniel):
//   · QUIRK 1: la lista de Joybees filtra deleted=false; la de Reebok NO.
//   · QUIRK 2: Reebok aún acepta el rol legacy 'cliente' al crear.
// Reebok además resuelve category por producto (bulto 6/12) y maneja
// is_preorder; Joybees es bulto 12 fijo sin preventa.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { getMarcaConfig, type MarcaConfig } from "@/lib/catalogo/marcas";
import { sendTelegramAlert } from "@/lib/telegram";
import { avisoPedidoDeVendedor } from "@/lib/catalogo/telegram-pedido";
import { enviarNegocio } from "@/lib/alertas/canal";

const VIEW_ROLES = ["admin", "secretaria", "vendedor"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const session = getSession(req);
  if (!session || !VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const db = await cfg.db();
  let query = db
    .from(cfg.ordersTable)
    .select(
      `id, order_number, client_name, vendor_name, client_email, comment, total, created_at, updated_at, idempotency_key, status${cfg.ordersSelectExtra}, ${cfg.itemsRelation}(id, product_id, quantity, unit_price)`,
    );
  // QUIRK 1: solo Joybees filtra los soft-deleted en la query de la lista.
  if (cfg.listaFiltraDeleted) query = query.eq("deleted", false);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  // Reebok: una sola query batch para resolver category de todos los items.
  let categoryMap = new Map<string, string>();
  if (cfg.categoryLookup) {
    const allProductIds = (data || []).flatMap((o) =>
      ((o as unknown as Record<string, unknown>)[cfg.itemsRelation] as { product_id: string }[] | null || []).map((i) => i.product_id),
    );
    categoryMap = await cfg.categoryLookup(allProductIds);
  }

  const orders = (data || []).map((o) => {
    const row = o as unknown as Record<string, unknown>;
    const items = (row[cfg.itemsRelation] || []) as { product_id: string; quantity: number; unit_price: number }[];
    const itemsForTotal = items.map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      ...(cfg.categoryLookup
        ? { category: categoryMap.get(i.product_id) || cfg.fallbackCategory || undefined }
        : {}),
    }));
    return {
      ...row,
      item_count: items.length,
      total: cfg.calcTotal(itemsForTotal),
      [cfg.itemsRelation]: undefined,
    };
  });
  return NextResponse.json(orders);
}

interface IncomingItem {
  product_id: string;
  sku?: string;
  name?: string;
  image_url?: string;
  quantity: number;
  unit_price: number;
  category?: string;
  is_preorder?: boolean;
}

/** Total del pedido: con category real vía products (Reebok, respaldo el
 *  category del body y fallback apparel) o bulto fijo (Joybees). */
async function totalDePedido(cfg: MarcaConfig, items: IncomingItem[]): Promise<number> {
  if (cfg.categoryLookup) {
    const categoryMap = await cfg.categoryLookup(items.map((i) => i.product_id));
    return cfg.calcTotal(
      items.map((i) => ({
        quantity: i.quantity,
        unit_price: Number(i.unit_price) || 0,
        category: categoryMap.get(i.product_id) || i.category || cfg.fallbackCategory || undefined,
      })),
    );
  }
  return cfg.calcTotal(
    items.map((i) => ({ quantity: i.quantity, unit_price: Number(i.unit_price) || 0 })),
  );
}

export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const session = getSession(req);
  // QUIRK 2: los roles de creación vienen de la config (Reebok incluye 'cliente').
  if (!session || !cfg.createRoles.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { client_name, vendor_name, client_email, items, idempotency_key } = await req.json();
  if (!client_name) return NextResponse.json({ error: "client_name required" }, { status: 400 });
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "El pedido debe tener al menos un producto" }, { status: 400 });

  const typedItems = items as IncomingItem[];
  // Precio por unidad debe ser positivo: un negativo metería un total artificial.
  if (typedItems.some((i) => !(Number(i.unit_price) > 0))) {
    return NextResponse.json({ error: "El precio de cada producto debe ser mayor a cero" }, { status: 400 });
  }
  const total = await totalDePedido(cfg, typedItems);

  // Creación atómica e idempotente vía RPC: numera <prefijo>-### sin race
  // (advisory lock) e inserta pedido + items en una transacción. Si llega un
  // retry con el mismo idempotency_key, devuelve el pedido ya creado en vez de
  // duplicarlo.
  const db = await cfg.db();
  const { data: result, error } = await db.rpc(cfg.createOrderRpc, {
    p_client_name: client_name,
    p_vendor_name: vendor_name || session.userName || null,
    p_client_email: client_email || null,
    p_total: total,
    p_idempotency_key: idempotency_key || null,
    p_items: typedItems.map((i) => ({
      product_id: i.product_id,
      sku: i.sku || null,
      name: i.name || null,
      image_url: i.image_url || null,
      quantity: i.quantity || 1,
      unit_price: Number(i.unit_price) || 0,
      ...(cfg.itemsHasPreorder ? { is_preorder: i.is_preorder === true } : {}),
    })),
  });
  if (error || !result) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const { order_id, order_number, already_created } = result as {
    order_id: string; order_number: string; already_created: boolean;
  };

  // Telegram solo en creación real (un retry idempotente NO reenvía la alerta).
  // Este endpoint es SIEMPRE el camino del vendedor: la RPC de creación deja
  // origen_original en su default 'mio' (el 'link' solo lo escribe la RPC de
  // conversión del pedido público). Por eso el origen no se lee de la fila.
  if (!already_created) {
    await enviarNegocio(
      avisoPedidoDeVendedor({
        emoji: cfg.telegramEmoji,
        label: cfg.label,
        vendedor: vendor_name || session.userName || null,
        cliente: client_name,
        total,
        numero: order_number,
      }),
    );
  }

  // Respuesta compatible con el front (espera order.id para navegar al detalle).
  const { data: order } = await db.from(cfg.ordersTable).select("id, order_number").eq("id", order_id).single();
  return NextResponse.json(order ?? { id: order_id, order_number });
}
