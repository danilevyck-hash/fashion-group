import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";

export const dynamic = "force-dynamic";

interface PedidoItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { short_id: string } },
) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const short_id = params.short_id;
  if (!short_id) {
    return NextResponse.json({ error: "short_id requerido" }, { status: 400 });
  }

  // Soft-delete (borrado VISUAL): queda recuperable en DB. La vista
  // joybees_pedidos_unificado_vw excluye deleted=true → sale de la lista.
  const { error } = await joybeesServer
    .from("joybees_pedidos_publicos")
    .update({ deleted: true, deleted_at: new Date().toISOString() })
    .eq("short_id", short_id);

  if (error) {
    console.error("Error deleting joybees pedido publico:", error);
    return NextResponse.json({ error: "No se pudo borrar el pedido" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { short_id: string } },
) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const short_id = params.short_id;
  if (!short_id) {
    return NextResponse.json({ error: "short_id requerido" }, { status: 400 });
  }

  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "El pedido debe tener al menos un item" }, { status: 400 });
  }

  const items = body.items as PedidoItem[];
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
    }
    // Precio por unidad debe ser positivo (un negativo metería un total artificial).
    if (!(Number(item.unit_price) > 0)) {
      return NextResponse.json({ error: "El precio de cada producto debe ser mayor a cero" }, { status: 400 });
    }
  }

  const total = calculateJoybeesOrderTotal(items);

  const { error } = await joybeesServer
    .from("joybees_pedidos_publicos")
    .update({ items, total })
    .eq("short_id", short_id);

  if (error) {
    console.error("Error updating joybees pedido publico:", error);
    return NextResponse.json({ error: "No se pudo actualizar el pedido" }, { status: 500 });
  }

  return NextResponse.json({ success: true, total });
}
