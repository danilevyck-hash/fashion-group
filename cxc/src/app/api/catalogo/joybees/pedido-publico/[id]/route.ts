import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";

export const dynamic = "force-dynamic";

/**
 * Ruta PÚBLICA (sin auth) para el link compartible de un pedido Joybees.
 * La consume la página pública /pedido-joybees/[id]. Columnas explícitas
 * (no select("*")) para no filtrar campos futuros por el link.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { data, error } = await joybeesServer
      .from("joybees_orders")
      .select(
        "id, client_name, created_at, joybees_order_items(product_id, sku, name, image_url, quantity, unit_price)",
      )
      .eq("id", params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const items = (data.joybees_order_items || []) as {
      product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number;
    }[];

    return NextResponse.json({
      id: data.id,
      client_name: data.client_name,
      created_at: data.created_at,
      total: calculateJoybeesOrderTotal(
        items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price })),
      ),
      items,
    });
  } catch (err) {
    console.error("[joybees/pedido-publico] Error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
