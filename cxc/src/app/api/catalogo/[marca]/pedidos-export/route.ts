import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { workbookBuffer, exportFilename, XLSX_MIME } from "@/lib/excel-export";
import { buildPedidosWorkbook, type PedidoExportRow } from "@/lib/catalogos/pedidos-excel";

export const dynamic = "force-dynamic";

interface UnifiedItem {
  quantity: number | null;
  unit_price: number | null;
  product_id: string | null;
}

interface UnifiedRow {
  origen: "mio" | "link";
  cliente: string;
  vendor: string | null;
  items: UnifiedItem[] | null;
  created_at: string;
}

/**
 * Exporta la lista unificada completa de pedidos (Míos + Del link) a Excel,
 * con columna Origen. El total se recalcula igual que /pedidos-unificado con
 * la fórmula de la marca (nunca el guardado).
 */
export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = await cfg.publicosDb();
    const { data, error } = await db
      .from(cfg.unificadoView)
      .select(cfg.exportCols)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`[${cfg.marca}/pedidos-export] Error:`, error);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const rows = (data || []) as unknown as UnifiedRow[];

    let categoryMap = new Map<string, string>();
    if (cfg.categoryLookup) {
      const allProductIds = rows.flatMap((r) => (r.items || []).map((i) => i.product_id));
      categoryMap = await cfg.categoryLookup(allProductIds);
    }

    const pedidos: PedidoExportRow[] = rows.map((r) => {
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
        cliente: r.cliente,
        vendor: r.vendor,
        item_count: items.length,
        total: cfg.calcTotal(itemsForTotal),
        created_at: r.created_at,
      };
    });

    const wb = buildPedidosWorkbook({ marca: cfg.marca, titulo: cfg.exportTitulo, conOrigen: true, pedidos });
    const buf = workbookBuffer(wb);

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${exportFilename(`pedidos-${cfg.marca}`)}"`,
      },
    });
  } catch (err) {
    console.error(`[${params.marca}/pedidos-export] Error:`, err);
    return NextResponse.json({ error: "Error al generar el Excel. Intenta de nuevo." }, { status: 500 });
  }
}
