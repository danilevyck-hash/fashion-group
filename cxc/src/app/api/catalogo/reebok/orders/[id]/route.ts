import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";

const PIEZAS = 12;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await reebokServer
    .from("reebok_orders")
    .select("*, reebok_order_items(*)")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { client_name, vendor_name, comment, items } = await req.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (client_name !== undefined) update.client_name = client_name;
  if (vendor_name !== undefined) update.vendor_name = vendor_name;
  if (comment !== undefined) update.comment = comment;

  // Replace items
  if (items && Array.isArray(items)) {
    await reebokServer.from("reebok_order_items").delete().eq("order_id", params.id);
    if (items.length > 0) {
      await reebokServer.from("reebok_order_items").insert(
        items.map((i: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }) => ({
          order_id: params.id,
          product_id: i.product_id,
          sku: i.sku || null,
          name: i.name || null,
          image_url: i.image_url || null,
          quantity: i.quantity || 1,
          unit_price: Number(i.unit_price) || 0,
        }))
      );
    }
    update.total = items.reduce(
      (s: number, i: { quantity: number; unit_price: number }) => s + (i.quantity || 1) * PIEZAS * Number(i.unit_price || 0),
      0
    );
  }

  const { error } = await reebokServer.from("reebok_orders").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await reebokServer.from("reebok_orders").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
