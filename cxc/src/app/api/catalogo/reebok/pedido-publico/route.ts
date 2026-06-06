import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { sendTelegramAlert } from "@/lib/telegram";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  category?: string;
  is_preorder?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: CartItem[] = body.items;
    const cliente_nombre = typeof body.cliente_nombre === "string" ? body.cliente_nombre.trim() : "";

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "El carrito está vacío" }, { status: 400 });
    }

    if (!cliente_nombre) {
      return NextResponse.json({ error: "Falta el nombre del cliente" }, { status: 400 });
    }

    const total = calculateReebokOrderTotal(items);
    const short_id = Math.random().toString(36).substring(2, 10);

    const { error } = await supabase.from("reebok_pedidos_publicos").insert({
      short_id,
      items,
      total,
      cliente_nombre,
    });

    if (error) {
      console.error("Error saving public order:", error);
      return NextResponse.json({ error: "No se pudo guardar el pedido" }, { status: 500 });
    }

    await sendTelegramAlert(`🛒 Nuevo pedido Reebok (público) — ${cliente_nombre} — ${money(total)}`);

    return NextResponse.json({ short_id });
  } catch (err) {
    console.error("Error in pedido-publico POST:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
