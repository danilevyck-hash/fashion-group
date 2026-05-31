import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";

export const dynamic = "force-dynamic";

// Fallback cuando un product_id no resuelve en `products` (producto borrado,
// sku huerfano). Usamos "apparel" (bulto=6) para que el monto NUNCA quede
// inflado por asumir footwear=12 a ciegas. Misma regla que orders/route.ts.
const FALLBACK_CATEGORY = "apparel";

interface UnifiedItem {
  sku: string | null;
  name: string | null;
  quantity: number | null;
  image_url: string | null;
  product_id: string | null;
  unit_price: number | null;
}

interface UnifiedRow {
  origen: "mio" | "link";
  id_natural: string;
  cliente: string;
  total: number;
  created_at: string;
  vendor: string | null;
  items: UnifiedItem[] | null;
  // FASE 2: tabla física de origen. 'orders' → reebok_orders (detalle interno),
  // 'publicos' → reebok_pedidos_publicos (detalle del link). Ausente si la vista
  // aún no fue migrada a FASE 2.
  fuente?: "orders" | "publicos";
}

/**
 * Lista unificada de pedidos Reebok (presenciales + del link) desde la vista
 * reebok_pedidos_unificado_vw. El total se RECALCULA siempre desde items con
 * calculateReebokOrderTotal + categoria via products — nunca el guardado, que
 * en pedidos viejos quedo subvaluado ~6x.
 */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("reebok_pedidos_unificado_vw")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching pedidos unificado:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const rows = (data || []) as UnifiedRow[];

  // Una sola query batch para resolver category de todos los items de todos
  // los pedidos.
  const allProductIds = rows.flatMap((r) => (r.items || []).map((i) => i.product_id));
  const categoryMap = await fetchReebokCategoryMap(allProductIds);

  const result = rows.map((r) => {
    const items = r.items || [];
    const itemsForTotal = items.map((i) => ({
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      category: (i.product_id && categoryMap.get(i.product_id)) || FALLBACK_CATEGORY,
    }));
    return {
      origen: r.origen,
      id_natural: r.id_natural,
      cliente: r.cliente,
      total: calculateReebokOrderTotal(itemsForTotal),
      created_at: r.created_at,
      vendor: r.vendor,
      item_count: items.length,
      fuente: r.fuente ?? (r.origen === "link" ? "publicos" : "orders"),
    };
  });

  return NextResponse.json(result);
}
