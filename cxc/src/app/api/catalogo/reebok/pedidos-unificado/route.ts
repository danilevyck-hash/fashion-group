import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { reebokServer } from "@/lib/reebok-supabase-server";
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
  // Migración 20260724120000: cuándo confirmó el CLIENTE desde el link (null si
  // no ha confirmado o el pedido es interno). Ausente si la vista es vieja.
  confirmado_cliente_at?: string | null;
}

// Columnas de la vista. confirmado_cliente_at es de la migración 20260724120000
// — si aún no corrió, se reintenta sin ella (tolerante).
const COLS_BASE = "origen, id_natural, cliente, total, created_at, vendor, items, fuente";
const COLS_FULL = `${COLS_BASE}, confirmado_cliente_at`;

/**
 * Lista unificada de pedidos Reebok (presenciales + del link) desde la vista
 * reebok_pedidos_unificado_vw. El total se RECALCULA siempre desde items con
 * calculateReebokOrderTotal + categoria via products — nunca el guardado, que
 * en pedidos viejos quedo subvaluado ~6x.
 */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  let { data, error } = await supabaseServer
    .from("reebok_pedidos_unificado_vw")
    .select(COLS_FULL)
    .order("created_at", { ascending: false });
  if (error) {
    // Vista sin la columna nueva (migración pendiente) → fallback.
    const retry = await supabaseServer
      .from("reebok_pedidos_unificado_vw")
      .select(COLS_BASE)
      .order("created_at", { ascending: false });
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) {
    console.error("Error fetching pedidos unificado:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const rows = (data || []) as UnifiedRow[];

  // Una sola query batch para resolver category de todos los items de todos
  // los pedidos.
  const allProductIds = rows.flatMap((r) => (r.items || []).map((i) => i.product_id));
  const categoryMap = await fetchReebokCategoryMap(allProductIds);

  // Números de Switch de los envíos ACTIVOS ('enviado'/'verificado', mismo
  // criterio que el candado #236/#237) — la eliminación masiva los muestra en
  // el modal ("siguen en Switch: anúlalos en el panel"). Solo filas 'orders'
  // pueden tener envío. Tolerante: si la tabla no responde, todo queda null.
  const orderIds = rows
    .filter((r) => (r.fuente ?? (r.origen === "link" ? "publicos" : "orders")) === "orders")
    .map((r) => r.id_natural);
  const switchNumeros = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: envios, error: enviosError } = await reebokServer
      .from("reebok_switch_envios")
      .select("order_id, numero_interno, pedido_switch_id")
      .in("order_id", orderIds)
      .in("estado", ["enviado", "verificado"]);
    if (!enviosError) {
      for (const e of envios || []) {
        switchNumeros.set(String(e.order_id), String(e.numero_interno || e.pedido_switch_id || "?"));
      }
    }
  }

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
      confirmado_cliente_at: r.confirmado_cliente_at ?? null,
      switch_numero: switchNumeros.get(r.id_natural) ?? null,
    };
  });

  return NextResponse.json(result);
}
