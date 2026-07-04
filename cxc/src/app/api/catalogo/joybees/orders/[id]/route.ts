import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { getSession } from "@/lib/require-auth";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";

const EDIT_ROLES = ["admin", "secretaria", "vendedor"];
const DELETE_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await joybeesServer
    .from("joybees_orders")
    .select(
      "id, order_number, client_name, vendor_name, client_email, comment, total, created_at, updated_at, idempotency_key, status, joybees_order_items(id, order_id, product_id, sku, name, image_url, quantity, unit_price, created_at)",
    )
    .eq("id", params.id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const items = (data.joybees_order_items || []) as { quantity: number; unit_price: number }[];

  // Recalculamos el total desde los items (bulto 12) en vez de confiar en la
  // columna guardada, para que pedidos viejos nunca muestren un monto stale.
  const recalcTotal = calculateJoybeesOrderTotal(
    items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price })),
  );

  return NextResponse.json({
    ...data,
    total: recalcTotal,
  });
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
    type IncomingItem = {
      product_id: string;
      sku?: string;
      name?: string;
      image_url?: string;
      quantity: number;
      unit_price: number;
    };
    const typedItems = items as IncomingItem[];

    const total = calculateJoybeesOrderTotal(
      typedItems.map((i) => ({
        quantity: i.quantity || 1,
        unit_price: Number(i.unit_price) || 0,
      })),
    );

    // Reemplazo atómico de items + total vía RPC (delete+insert+update en UNA
    // transacción). Si el insert falla tras el delete, todo hace rollback y el
    // pedido nunca queda vacío.
    const { error: rpcErr } = await joybeesServer.rpc("joybees_order_replace_items", {
      p_order_id: params.id,
      p_total: total,
      p_items: typedItems.map((i) => ({
        product_id: i.product_id,
        sku: i.sku || null,
        name: i.name || null,
        image_url: i.image_url || null,
        quantity: i.quantity || 1,
        unit_price: Number(i.unit_price) || 0,
      })),
    });
    if (rpcErr) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Campos escalares (client_name, vendor_name, etc.): update seguro aparte.
  // El total y updated_at de los items ya los fijó la RPC.
  const { error } = await joybeesServer.from("joybees_orders").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session || !DELETE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Solo admin y secretaria pueden eliminar" }, { status: 403 });
  }

  const { error } = await joybeesServer.from("joybees_orders").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
