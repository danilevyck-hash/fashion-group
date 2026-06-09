import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { getSession } from "@/lib/require-auth";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";

const EDIT_ROLES = ["admin", "secretaria", "vendedor"];
const DELETE_ROLES = ["admin", "secretaria"];

// Fallback category cuando un product_id no resuelve en `products`. Usamos
// "apparel" (bulto=6) para nunca inflar el cobro asumiendo footwear=12.
const FALLBACK_CATEGORY = "apparel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await reebokServer
    .from("reebok_orders")
    .select(
      "id, order_number, client_name, vendor_name, client_email, comment, total, created_at, updated_at, idempotency_key, status, origen_original, origen_short_id, reebok_order_items(id, order_id, product_id, sku, name, image_url, quantity, unit_price, created_at, is_preorder)",
    )
    .eq("id", params.id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const items = (data.reebok_order_items || []) as { product_id: string; quantity: number; unit_price: number }[];
  const categoryMap = await fetchReebokCategoryMap(items.map((i) => i.product_id));

  // Pedidos viejos pueden tener total inflado en la columna (bulto 12 a
  // ciegas). Devolvemos items enriquecidos con category y total recalculado
  // con bulto correcto por categoria, sin tocar la DB.
  const enrichedItems = items.map((i) => ({
    ...i,
    category: categoryMap.get(i.product_id) || FALLBACK_CATEGORY,
  }));
  const recalcTotal = calculateReebokOrderTotal(
    enrichedItems.map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      category: i.category,
    })),
  );

  return NextResponse.json({
    ...data,
    reebok_order_items: enrichedItems,
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
      category?: string;
      is_preorder?: boolean;
    };
    const typedItems = items as IncomingItem[];

    const categoryMap = await fetchReebokCategoryMap(typedItems.map((i) => i.product_id));
    const total = calculateReebokOrderTotal(
      typedItems.map((i) => ({
        quantity: i.quantity || 1,
        unit_price: Number(i.unit_price) || 0,
        category: categoryMap.get(i.product_id) || i.category || FALLBACK_CATEGORY,
      })),
    );

    // Reemplazo atómico de items + total vía RPC (delete+insert+update en UNA
    // transacción). Si el insert falla tras el delete, todo hace rollback y el
    // pedido nunca queda vacío (antes era delete()+insert() sin transacción).
    const { error: rpcErr } = await reebokServer.rpc("reebok_order_replace_items", {
      p_order_id: params.id,
      p_total: total,
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
    if (rpcErr) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Campos escalares (client_name, vendor_name, etc.): update seguro aparte.
  // El total y updated_at de los items ya los fijó la RPC.
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
