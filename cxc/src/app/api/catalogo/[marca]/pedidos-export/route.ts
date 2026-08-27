import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { workbookBuffer, exportFilename, XLSX_MIME } from "@/lib/excel-export";
import { buildPedidosWorkbook, type PedidoExportRow } from "@/lib/catalogos/pedidos-excel";
import { normalizarDocumento, type DocumentoSwitch } from "@/lib/catalogo/documento-switch";

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
  // 25-ago-2026: hacen falta para los DOS números. `id_natural` es la llave con
  // la que se piden los envíos y los `order_number`; `fuente` dice si la fila es
  // un pedido interno o uno del link sin convertir.
  id_natural?: string;
  fuente?: "orders" | "publicos";
}

/**
 * Exporta la lista unificada completa de pedidos (Míos + Del link) a Excel,
 * con columna Origen. El total se recalcula igual que /pedidos-unificado con
 * la fórmula de la marca (nunca el guardado).
 *
 * 🔴 EL EXCEL LLEVA LOS MISMOS DOS NÚMEROS QUE LA PANTALLA (25-ago-2026).
 * La lista del admin muestra desde el #593 el número de la casa (PED-018) y el
 * de Switch (16-000000506, diciendo si fue pedido o COTIZACIÓN), y el Excel que
 * se baja de esa MISMA lista no los llevaba. Se resuelven con las MISMAS dos
 * consultas que `pedidos-unificado` —envío activo + `order_number`— y los
 * textos los arma `numeros-pedido.ts`, no este archivo.
 */
export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = await cfg.publicosDb();
    // Escalón tolerante: si la vista de la marca no expusiera `id_natural` o
    // `fuente`, el Excel sale como salía —sin los dos números— en vez de
    // caerse. Un export que no baja es peor que un export sin dos columnas.
    let { data, error } = await db
      .from(cfg.unificadoView)
      .select(`${cfg.exportCols}, id_natural, fuente`)
      .order("created_at", { ascending: false });
    let conNumeros = !error;
    if (error) {
      const retry = await db
        .from(cfg.unificadoView)
        .select(cfg.exportCols)
        .order("created_at", { ascending: false });
      data = retry.data as typeof data;
      error = retry.error;
      conNumeros = false;
    }

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

    // ── Los dos números, con las MISMAS consultas que /pedidos-unificado ──────
    // Solo las filas 'orders' pueden tener envío y `order_number`; la del link
    // sin convertir recibe su número al convertirse y así lo dice el Excel.
    const switchNumeros = new Map<string, string>();
    const switchDocumentos = new Map<string, DocumentoSwitch>();
    const numerosPedido = new Map<string, string>();
    const fuenteDe = (r: UnifiedRow): "orders" | "publicos" =>
      r.fuente ?? (r.origen === "link" ? "publicos" : "orders");
    const orderIds = conNumeros
      ? rows.filter((r) => fuenteDe(r) === "orders").map((r) => r.id_natural!).filter(Boolean)
      : [];
    if (orderIds.length > 0) {
      const marcaDb = await cfg.db();
      // Escalón tolerante por la DDL 20260824160000 (`documento`): si la columna
      // no existe se relee sin ella y todo queda como antes — pedido.
      for (const cols of [
        "order_id, numero_interno, pedido_switch_id, documento",
        "order_id, numero_interno, pedido_switch_id",
      ]) {
        const { data: envios, error: enviosError } = await marcaDb
          .from(cfg.enviosTable)
          .select(cols)
          .in("order_id", orderIds)
          .in("estado", ["enviado", "verificado"]);
        if (enviosError) continue;
        for (const e of (envios || []) as unknown as Record<string, unknown>[]) {
          const id = String(e.order_id);
          switchNumeros.set(id, String(e.numero_interno || e.pedido_switch_id || "?"));
          switchDocumentos.set(id, normalizarDocumento(e.documento));
        }
        break;
      }
      const { data: ords, error: ordsError } = await marcaDb
        .from(cfg.ordersTable)
        .select("id, order_number")
        .in("id", orderIds);
      if (!ordsError) {
        for (const o of (ords || []) as unknown as Record<string, unknown>[]) {
          if (o.order_number) numerosPedido.set(String(o.id), String(o.order_number));
        }
      }
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
      const id = r.id_natural ?? "";
      return {
        origen: r.origen,
        cliente: r.cliente,
        vendor: r.vendor,
        item_count: items.length,
        total: cfg.calcTotal(itemsForTotal),
        created_at: r.created_at,
        numero_pedido: numerosPedido.get(id) ?? null,
        switch_numero: switchNumeros.get(id) ?? null,
        switch_documento: switchDocumentos.get(id) ?? null,
        fuente: fuenteDe(r),
      };
    });

    const wb = buildPedidosWorkbook({ marca: cfg.marca, conOrigen: true, conNumeros, pedidos });
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
