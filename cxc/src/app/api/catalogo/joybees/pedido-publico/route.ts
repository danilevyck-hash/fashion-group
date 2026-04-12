import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: CartItem[] = body.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "El carrito esta vacio" }, { status: 400 });
    }

    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const short_id = Math.random().toString(36).substring(2, 10);

    const { error } = await supabaseServer.from("joybees_pedidos_publicos").insert({
      short_id,
      items,
      total,
    });

    if (error) {
      console.error("Error saving joybees order:", error);
      return NextResponse.json({ error: "No se pudo guardar el pedido" }, { status: 500 });
    }

    return NextResponse.json({ short_id });
  } catch (err) {
    console.error("Error in joybees pedido-publico POST:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
