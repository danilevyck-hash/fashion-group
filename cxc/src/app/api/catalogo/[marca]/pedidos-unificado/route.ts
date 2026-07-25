import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

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
  // FASE 2: tabla física de origen. 'orders' → detalle interno, 'publicos' →
  // detalle del link. Ausente si la vista aún no fue migrada a FASE 2.
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
 * Lista unificada de pedidos (presenciales + del link) desde la vista
 * cfg.unificadoView. El total se RECALCULA siempre desde items con la fórmula
 * de la marca — nunca el guardado, que en pedidos viejos quedó subvaluado.
 * Topología heredada: la vista Reebok vive en el proyecto PRINCIPAL y los
 * envíos en el proyecto Reebok; en Joybees todo vive en su client.
 */
export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const viewDb = await cfg.publicosDb();
  let { data, error } = await viewDb
    .from(cfg.unificadoView)
    .select(COLS_FULL)
    .order("created_at", { ascending: false });
  if (error) {
    // Vista sin la columna nueva (migración pendiente) → fallback.
    const retry = await viewDb
      .from(cfg.unificadoView)
      .select(COLS_BASE)
      .order("created_at", { ascending: false });
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) {
    console.error(`Error fetching ${cfg.marca} pedidos unificado:`, error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const rows = (data || []) as unknown as UnifiedRow[];

  // Reebok: una sola query batch para resolver category de todos los items de
  // todos los pedidos (fallback apparel: nunca inflar a footwear=12 a ciegas).
  let categoryMap = new Map<string, string>();
  if (cfg.categoryLookup) {
    const allProductIds = rows.flatMap((r) => (r.items || []).map((i) => i.product_id));
    categoryMap = await cfg.categoryLookup(allProductIds);
  }

  // Números de Switch de los envíos ACTIVOS ('enviado'/'verificado', mismo
  // criterio que el candado #236/#237) — la eliminación masiva los muestra en
  // el modal ("siguen en Switch: anúlalos en el panel"). Solo filas 'orders'
  // pueden tener envío. Tolerante: si la tabla no responde, todo queda null.
  const orderIds = rows
    .filter((r) => (r.fuente ?? (r.origen === "link" ? "publicos" : "orders")) === "orders")
    .map((r) => r.id_natural);
  const switchNumeros = new Map<string, string>();
  if (orderIds.length > 0) {
    const enviosDb = await cfg.db();
    const { data: envios, error: enviosError } = await enviosDb
      .from(cfg.enviosTable)
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
      ...(cfg.categoryLookup
        ? { category: (i.product_id && categoryMap.get(i.product_id)) || cfg.fallbackCategory || undefined }
        : {}),
    }));
    return {
      origen: r.origen,
      id_natural: r.id_natural,
      cliente: r.cliente,
      total: cfg.calcTotal(itemsForTotal),
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
