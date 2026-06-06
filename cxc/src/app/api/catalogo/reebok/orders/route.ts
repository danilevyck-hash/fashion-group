import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { getSession } from "@/lib/require-auth";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";
import { sendTelegramAlert } from "@/lib/telegram";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const VIEW_ROLES = ["admin", "secretaria", "vendedor"];
const CREATE_ROLES = ["admin", "secretaria", "vendedor", "cliente"];

// Fallback category cuando un product_id no resuelve en `products`
// (producto borrado, sku huerfano). Usamos "apparel" (bulto=6) para que el
// monto cobrado NUNCA quede inflado por asumir footwear=12 a ciegas.
const FALLBACK_CATEGORY = "apparel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { data, error } = await reebokServer
    .from("reebok_orders")
    .select("*, reebok_order_items(id, product_id, quantity, unit_price)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const allProductIds = (data || []).flatMap(
    (o) => (o.reebok_order_items || []).map((i: { product_id: string }) => i.product_id),
  );
  const categoryMap = await fetchReebokCategoryMap(allProductIds);

  const orders = (data || []).map((o) => {
    const items = (o.reebok_order_items || []) as { product_id: string; quantity: number; unit_price: number }[];
    const itemsWithCategory = items.map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      category: categoryMap.get(i.product_id) || FALLBACK_CATEGORY,
    }));
    return {
      ...o,
      item_count: items.length,
      total: calculateReebokOrderTotal(itemsWithCategory),
      reebok_order_items: undefined,
    };
  });
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session || !CREATE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { client_name, vendor_name, client_email, items, idempotency_key } = await req.json();
  if (!client_name) return NextResponse.json({ error: "client_name required" }, { status: 400 });
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "El pedido debe tener al menos un producto" }, { status: 400 });

  // Resuelve category via products. Si el frontend manda category en el
  // CartItem la usamos como respaldo, pero priorizamos la DB para evitar
  // discrepancias.
  type IncomingItem = {
    product_id: string;
    sku?: string;
    name?: string;
    image_url?: string;
    quantity: number;
    unit_price: number;
    category?: string;
    is_preorder?: boolean;
  };
  const typedItems = items as IncomingItem[];
  const categoryMap = await fetchReebokCategoryMap(typedItems.map((i) => i.product_id));
  const total = calculateReebokOrderTotal(
    typedItems.map((i) => ({
      quantity: i.quantity,
      unit_price: Number(i.unit_price) || 0,
      category: categoryMap.get(i.product_id) || i.category || FALLBACK_CATEGORY,
    })),
  );

  // Creación atómica e idempotente vía RPC: numera PED-### sin race (advisory
  // lock) e inserta pedido + items en una transacción. Si llega un retry con el
  // mismo idempotency_key, devuelve el pedido ya creado en vez de duplicarlo.
  const { data: result, error } = await reebokServer.rpc("reebok_create_order", {
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
      is_preorder: i.is_preorder === true,
    })),
  });
  if (error || !result) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const { order_id, order_number, already_created } = result as {
    order_id: string; order_number: string; already_created: boolean;
  };

  // Telegram solo en creación real (un retry idempotente NO reenvía la alerta).
  if (!already_created) {
    await sendTelegramAlert(`🛒 Nuevo pedido Reebok — ${client_name} — ${money(total)} (${order_number})`);
  }

  // Respuesta compatible con el front (espera order.id para navegar al detalle).
  const { data: order } = await reebokServer.from("reebok_orders").select("*").eq("id", order_id).single();
  return NextResponse.json(order ?? { id: order_id, order_number });
}
