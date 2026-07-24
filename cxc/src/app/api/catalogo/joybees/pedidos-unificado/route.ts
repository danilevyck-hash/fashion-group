import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";

export const dynamic = "force-dynamic";

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
  // Tabla física de origen. 'orders' → joybees_orders (detalle interno),
  // 'publicos' → joybees_pedidos_publicos (detalle del link). Routing + borrado.
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
 * Lista unificada de pedidos Joybees (presenciales + del link) desde la vista
 * joybees_pedidos_unificado_vw. El total se RECALCULA siempre desde items con
 * calculateJoybeesOrderTotal (bulto 12) — nunca el guardado. Espejo de
 * reebok/pedidos-unificado, sin category (Joybees es todo footwear).
 */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  let { data, error } = await joybeesServer
    .from("joybees_pedidos_unificado_vw")
    .select(COLS_FULL)
    .order("created_at", { ascending: false });
  if (error) {
    // Vista sin la columna nueva (migración pendiente) → fallback.
    const retry = await joybeesServer
      .from("joybees_pedidos_unificado_vw")
      .select(COLS_BASE)
      .order("created_at", { ascending: false });
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) {
    console.error("Error fetching joybees pedidos unificado:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const rows = (data || []) as UnifiedRow[];

  const result = rows.map((r) => {
    const items = r.items || [];
    const itemsForTotal = items.map((i) => ({
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
    }));
    return {
      origen: r.origen,
      id_natural: r.id_natural,
      cliente: r.cliente,
      total: calculateJoybeesOrderTotal(itemsForTotal),
      created_at: r.created_at,
      vendor: r.vendor,
      item_count: items.length,
      fuente: r.fuente ?? (r.origen === "link" ? "publicos" : "orders"),
      confirmado_cliente_at: r.confirmado_cliente_at ?? null,
    };
  });

  return NextResponse.json(result);
}
