import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";

export const dynamic = "force-dynamic";

interface PublicItem {
  product_id?: string;
  sku?: string;
  name?: string;
  image_url?: string;
  quantity?: number;
  unit_price?: number;
}

/**
 * Convierte un pedido del link (joybees_pedidos_publicos) en un joybees_orders vía
 * la RPC atómica convert_joybees_pedido_publico. Idempotente: si ya fue convertido
 * devuelve el JBP-XXX existente sin crear otro. Espejo de reebok/convertir.
 *
 * El total se calcula AQUÍ (bulto 12, calculateJoybeesOrderTotal) y se pasa a la
 * RPC; la RPC sólo hace el insert atómico (ignora p_total si ya está convertido).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { short_id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const shortId = params.short_id;
  if (!shortId) {
    return NextResponse.json({ error: "short_id requerido" }, { status: 400 });
  }

  const { data: pub, error: fetchErr } = await joybeesServer
    .from("joybees_pedidos_publicos")
    .select("short_id, items, convertida, ped_order_number")
    .eq("short_id", shortId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[joybees/convertir] fetch error:", fetchErr);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!pub) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const items = (Array.isArray(pub.items) ? pub.items : []) as PublicItem[];

  const total = calculateJoybeesOrderTotal(
    items.map((i) => ({ quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 })),
  );

  const { data, error } = await joybeesServer.rpc("convert_joybees_pedido_publico", {
    p_short_id: shortId,
    p_total: total,
    p_items: items,
  });

  if (error) {
    console.error("[joybees/convertir] rpc error:", error);
    return NextResponse.json(
      { error: "No se pudo convertir el pedido. Intenta de nuevo." },
      { status: 500 },
    );
  }

  // data = { order_number, order_id, already_converted }
  return NextResponse.json(data);
}
