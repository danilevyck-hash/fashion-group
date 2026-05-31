import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";

export const dynamic = "force-dynamic";

const FALLBACK_CATEGORY = "apparel";

interface PublicItem {
  product_id?: string;
  sku?: string;
  name?: string;
  image_url?: string;
  quantity?: number;
  unit_price?: number;
  category?: string;
  is_preorder?: boolean;
}

/**
 * Convierte un pedido del link (reebok_pedidos_publicos) en un reebok_orders vía
 * la RPC atómica convert_reebok_pedido_publico. Idempotente: si ya fue convertido
 * devuelve el PED-XXX existente sin crear otro.
 *
 * El total se calcula AQUÍ con los helpers JS (decisión confirmada) y se pasa a
 * la RPC; la RPC sólo hace el insert atómico.
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

  const { data: pub, error: fetchErr } = await supabaseServer
    .from("reebok_pedidos_publicos")
    .select("short_id, items, convertida, ped_order_number")
    .eq("short_id", shortId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[reebok/convertir] fetch error:", fetchErr);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!pub) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const items = (Array.isArray(pub.items) ? pub.items : []) as PublicItem[];

  // Total con los helpers JS. Categoría via products; fallback apparel (bulto=6)
  // para no inflar el monto. La RPC ignora p_total si el pedido ya está convertido.
  const categoryMap = await fetchReebokCategoryMap(items.map((i) => i.product_id));
  const itemsForTotal = items.map((i) => ({
    quantity: Number(i.quantity) || 0,
    unit_price: Number(i.unit_price) || 0,
    category: (i.product_id && categoryMap.get(i.product_id)) || i.category || FALLBACK_CATEGORY,
  }));
  const total = calculateReebokOrderTotal(itemsForTotal);

  const { data, error } = await supabaseServer.rpc("convert_reebok_pedido_publico", {
    p_short_id: shortId,
    p_total: total,
    p_items: items,
  });

  if (error) {
    console.error("[reebok/convertir] rpc error:", error);
    return NextResponse.json(
      { error: "No se pudo convertir el pedido. Intenta de nuevo." },
      { status: 500 },
    );
  }

  // data = { order_number, order_id, already_converted }
  return NextResponse.json(data);
}
