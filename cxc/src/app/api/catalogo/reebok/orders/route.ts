import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";

const PIEZAS = 12;

export async function GET() {
  const { data, error } = await reebokServer
    .from("reebok_orders")
    .select("*, reebok_order_items(id)")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const orders = (data || []).map((o) => ({
    ...o,
    item_count: (o.reebok_order_items || []).length,
    reebok_order_items: undefined,
  }));

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const { client_name, vendor_name, items } = await req.json();
  if (!client_name) return NextResponse.json({ error: "client_name required" }, { status: 400 });

  // Generate order number
  const { data: maxRow } = await reebokServer
    .from("reebok_orders")
    .select("order_number")
    .like("order_number", "PED-%")
    .order("created_at", { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (maxRow?.[0]?.order_number) {
    const match = maxRow[0].order_number.match(/PED-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  const order_number = `PED-${String(nextNum).padStart(3, "0")}`;

  // Calculate total
  const total = (items || []).reduce(
    (s: number, i: { quantity: number; unit_price: number }) => s + i.quantity * PIEZAS * Number(i.unit_price),
    0
  );

  const { data: order, error } = await reebokServer
    .from("reebok_orders")
    .insert({ order_number, client_name, vendor_name: vendor_name || null, total })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  // Insert items
  if (items?.length) {
    const rows = items.map((i: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }) => ({
      order_id: order.id,
      product_id: i.product_id,
      sku: i.sku || null,
      name: i.name || null,
      image_url: i.image_url || null,
      quantity: i.quantity || 1,
      unit_price: Number(i.unit_price) || 0,
    }));
    await reebokServer.from("reebok_order_items").insert(rows);
  }

  return NextResponse.json(order);
}
