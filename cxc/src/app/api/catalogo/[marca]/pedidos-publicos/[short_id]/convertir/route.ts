import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

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
 * Convierte un pedido del link (cfg.publicosTable) en un pedido interno vía la
 * RPC atómica cfg.convertRpc. Idempotente: si ya fue convertido devuelve el
 * número existente sin crear otro.
 *
 * El total se calcula AQUÍ con los helpers JS (decisión confirmada) y se pasa
 * a la RPC; la RPC sólo hace el insert atómico (ignora p_total si el pedido ya
 * está convertido). En Reebok la categoría se resuelve vía products con
 * fallback apparel (bulto=6) para no inflar el monto.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { marca: string; short_id: string } },
) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  // ── QUIÉN CONVIERTE: admin, secretaria y VENDEDOR (14-ago-2026) ──
  //
  // Daniel, preguntado explícitamente por los roles: *"los 3, bodega no"*.
  // El vendedor es quien comparte el link y a quien le llega el pedido por
  // WhatsApp; convertir es el ÚNICO paso que le faltaba para poder trabajarlo
  // (editar precio, agregar/quitar líneas, elegir cliente y mandarlo a Switch
  // ya eran suyos: orders PUT, item PATCH, clientes-switch y enviar-switch
  // aceptan 'vendedor' desde antes).
  //
  // 🔴 BODEGA NO. Conserva lo que tenía —ver el catálogo— y no gana nada acá:
  // `CATALOGO_ROLES` la incluye para VER, nunca para armar ni mover pedidos.
  //
  // Convertir NO es destructivo ni irreversible: la RPC es idempotente y lo
  // único que hace es numerar el pedido del link como <prefijo>-###. Borrar
  // (orders DELETE, pedidos-publicos DELETE, bulk-delete) y exportar siguen
  // siendo de admin/secretaria: no son parte de este flujo.
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const shortId = params.short_id;
  if (!shortId) {
    return NextResponse.json({ error: "short_id requerido" }, { status: 400 });
  }

  const db = await cfg.publicosDb();
  const { data: pub, error: fetchErr } = await db
    .from(cfg.publicosTable)
    .select("short_id, items, convertida, ped_order_number")
    .eq("short_id", shortId)
    .maybeSingle();

  if (fetchErr) {
    console.error(`[${cfg.marca}/convertir] fetch error:`, fetchErr);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!pub) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const items = (Array.isArray(pub.items) ? pub.items : []) as PublicItem[];

  let total: number;
  if (cfg.categoryLookup) {
    const categoryMap = await cfg.categoryLookup(items.map((i) => i.product_id));
    total = cfg.calcTotal(
      items.map((i) => ({
        quantity: Number(i.quantity) || 0,
        unit_price: Number(i.unit_price) || 0,
        category: (i.product_id && categoryMap.get(i.product_id)) || i.category || cfg.fallbackCategory || undefined,
      })),
    );
  } else {
    total = cfg.calcTotal(
      items.map((i) => ({ quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 })),
    );
  }

  const { data, error } = await db.rpc(cfg.convertRpc, {
    p_short_id: shortId,
    p_total: total,
    p_items: items,
  });

  if (error) {
    console.error(`[${cfg.marca}/convertir] rpc error:`, error);
    return NextResponse.json(
      { error: "No se pudo convertir el pedido. Intenta de nuevo." },
      { status: 500 },
    );
  }

  // data = { order_number, order_id, already_converted }
  return NextResponse.json(data);
}
