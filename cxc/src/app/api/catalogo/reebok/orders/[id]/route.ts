import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { getSession } from "@/lib/require-auth";

const PIEZAS = 12;
const EDIT_ROLES = ["admin", "secretaria", "vendedor"];
const DELETE_ROLES = ["admin", "secretaria"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await reebokServer
    .from("reebok_orders").select("*, reebok_order_items(*)").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session || !EDIT_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso para editar" }, { status: 403 });
  }

  const { client_name, vendor_name, client_email, comment, items, status } = await req.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (client_name !== undefined) update.client_name = client_name;
  if (vendor_name !== undefined) update.vendor_name = vendor_name;
  if (client_email !== undefined) update.client_email = client_email;
  if (comment !== undefined) update.comment = comment;
  if (status !== undefined) update.status = status;

  if (items && Array.isArray(items)) {
    await reebokServer.from("reebok_order_items").delete().eq("order_id", params.id);
    if (items.length > 0) {
      await reebokServer.from("reebok_order_items").insert(
        items.map((i: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }) => ({
          order_id: params.id, product_id: i.product_id, sku: i.sku || null, name: i.name || null,
          image_url: i.image_url || null, quantity: i.quantity || 1, unit_price: Number(i.unit_price) || 0,
        }))
      );
    }
    update.total = items.reduce(
      (s: number, i: { quantity: number; unit_price: number }) => s + (i.quantity || 1) * PIEZAS * Number(i.unit_price || 0), 0
    );
  }

  const { error } = await reebokServer.from("reebok_orders").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  // Email is sent separately via /api/catalogo/reebok/send-order
  // to avoid duplicate emails when the frontend also calls send-order

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session || !DELETE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Solo admin y secretaria pueden eliminar" }, { status: 403 });
  }

  const { error } = await reebokServer.from("reebok_orders").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
