import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { getSession } from "@/lib/require-auth";

const PIEZAS = 12;
const VIEW_ROLES = ["admin", "secretaria", "vendedor", "director"];
const CREATE_ROLES = ["admin", "secretaria", "vendedor", "cliente"];

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { data, error } = await reebokServer
    .from("reebok_orders").select("*, reebok_order_items(id)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const orders = (data || []).map((o) => ({
    ...o, item_count: (o.reebok_order_items || []).length, reebok_order_items: undefined,
  }));
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

  const total = (items || []).reduce(
    (s: number, i: { quantity: number; unit_price: number }) => s + i.quantity * PIEZAS * Number(i.unit_price), 0
  );

  const { data: order, error } = await reebokServer
    .from("reebok_orders")
    .insert({ order_number, client_name, vendor_name: vendor_name || session.userName || null, client_email: client_email || null, total, status: "borrador" })
    .select().single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  if (items?.length) {
    const rows = items.map((i: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }) => ({
      order_id: order.id, product_id: i.product_id, sku: i.sku || null, name: i.name || null,
      image_url: i.image_url || null, quantity: i.quantity || 1, unit_price: Number(i.unit_price) || 0,
    }));
    await reebokServer.from("reebok_order_items").insert(rows);
  }

  return NextResponse.json(order);
}
