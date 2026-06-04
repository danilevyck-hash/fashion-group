import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { getSession } from "@/lib/require-auth";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";

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

  const { client_name, vendor_name, client_email, items } = await req.json();
  if (!client_name) return NextResponse.json({ error: "client_name required" }, { status: 400 });
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "El pedido debe tener al menos un producto" }, { status: 400 });

  const { data: maxRow } = await reebokServer
    .from("reebok_orders").select("order_number").like("order_number", "PED-%").order("created_at", { ascending: false }).limit(1);
  let nextNum = 1;
  if (maxRow?.[0]?.order_number) {
    const match = maxRow[0].order_number.match(/PED-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  const order_number = `PED-${String(nextNum).padStart(3, "0")}`;

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
  const itemsForTotal = typedItems.map((i) => ({
    quantity: i.quantity,
    unit_price: Number(i.unit_price) || 0,
    category: categoryMap.get(i.product_id) || i.category || FALLBACK_CATEGORY,
  }));
  const total = calculateReebokOrderTotal(itemsForTotal);

  const { data: order, error } = await reebokServer
    .from("reebok_orders")
    .insert({ order_number, client_name, vendor_name: vendor_name || session.userName || null, client_email: client_email || null, total, status: "borrador" })
    .select().single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  if (typedItems.length) {
    const rows = typedItems.map((i) => ({
      order_id: order.id, product_id: i.product_id, sku: i.sku || null, name: i.name || null,
      image_url: i.image_url || null, quantity: i.quantity || 1, unit_price: Number(i.unit_price) || 0,
      is_preorder: i.is_preorder === true,
    }));
    await reebokServer.from("reebok_order_items").insert(rows);
  }

  return NextResponse.json(order);
}
