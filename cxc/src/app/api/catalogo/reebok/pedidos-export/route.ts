import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";
import { workbookBuffer, exportFilename, XLSX_MIME } from "@/lib/excel-export";
import { buildPedidosWorkbook, type PedidoExportRow } from "@/lib/catalogos/pedidos-excel";

export const dynamic = "force-dynamic";

const FALLBACK_CATEGORY = "apparel";

interface UnifiedItem {
  quantity: number | null;
  unit_price: number | null;
  product_id: string | null;
}

interface UnifiedRow {
  origen: "mio" | "link";
  id_natural: string;
  cliente: string;
  total: number;
  created_at: string;
  vendor: string | null;
  items: UnifiedItem[] | null;
}

/**
 * Exporta la lista unificada completa de pedidos Reebok a Excel. El total se
 * recalcula igual que el endpoint /pedidos-unificado (nunca el guardado).
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { data, error } = await supabaseServer
      .from("reebok_pedidos_unificado_vw")
      .select("origen, cliente, vendor, items, total, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[reebok/pedidos-export] Error:", error);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const rows = (data || []) as UnifiedRow[];
    const allProductIds = rows.flatMap((r) => (r.items || []).map((i) => i.product_id));
    const categoryMap = await fetchReebokCategoryMap(allProductIds);

    const pedidos: PedidoExportRow[] = rows.map((r) => {
      const items = r.items || [];
      const itemsForTotal = items.map((i) => ({
        quantity: Number(i.quantity) || 0,
        unit_price: Number(i.unit_price) || 0,
        category: (i.product_id && categoryMap.get(i.product_id)) || FALLBACK_CATEGORY,
      }));
      return {
        origen: r.origen,
        cliente: r.cliente,
        vendor: r.vendor,
        item_count: items.length,
        total: calculateReebokOrderTotal(itemsForTotal),
        created_at: r.created_at,
      };
    });

    const wb = buildPedidosWorkbook({ titulo: "REEBOK — Pedidos", conOrigen: true, pedidos });
    const buf = workbookBuffer(wb);

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${exportFilename("pedidos-reebok")}"`,
      },
    });
  } catch (err) {
    console.error("[reebok/pedidos-export] Error:", err);
    return NextResponse.json({ error: "Error al generar el Excel. Intenta de nuevo." }, { status: 500 });
  }
}
