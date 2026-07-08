import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";
import { workbookBuffer, exportFilename, XLSX_MIME } from "@/lib/excel-export";
import { buildPedidosWorkbook, type PedidoExportRow } from "@/lib/catalogos/pedidos-excel";

export const dynamic = "force-dynamic";

interface UnifiedItem {
  quantity: number | null;
  unit_price: number | null;
}

interface UnifiedRow {
  origen: "mio" | "link";
  cliente: string;
  vendor: string | null;
  created_at: string;
  items: UnifiedItem[] | null;
}

/**
 * Exporta la lista unificada completa de pedidos Joybees (Míos + Del link) a
 * Excel, con columna Origen. El total se recalcula desde los items (bulto 12),
 * nunca el guardado. Espejo de reebok/pedidos-export.
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { data, error } = await joybeesServer
      .from("joybees_pedidos_unificado_vw")
      .select("origen, cliente, vendor, items, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[joybees/pedidos-export] Error:", error);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const rows = (data || []) as UnifiedRow[];

    const pedidos: PedidoExportRow[] = rows.map((r) => {
      const items = r.items || [];
      const total = calculateJoybeesOrderTotal(
        items.map((i) => ({ quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 })),
      );
      return {
        origen: r.origen,
        cliente: r.cliente,
        vendor: r.vendor,
        item_count: items.length,
        total,
        created_at: r.created_at,
      };
    });

    const wb = buildPedidosWorkbook({ titulo: "JOYBEES — Pedidos", conOrigen: true, pedidos });
    const buf = workbookBuffer(wb);

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${exportFilename("pedidos-joybees")}"`,
      },
    });
  } catch (err) {
    console.error("[joybees/pedidos-export] Error:", err);
    return NextResponse.json({ error: "Error al generar el Excel. Intenta de nuevo." }, { status: 500 });
  }
}
