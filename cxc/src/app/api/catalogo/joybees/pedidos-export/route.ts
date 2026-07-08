import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";
import { workbookBuffer, exportFilename, XLSX_MIME } from "@/lib/excel-export";
import { buildPedidosWorkbook, type PedidoExportRow } from "@/lib/catalogos/pedidos-excel";

export const dynamic = "force-dynamic";

interface OrderItem {
  quantity: number | null;
  unit_price: number | null;
}

interface OrderRow {
  client_name: string | null;
  vendor_name: string | null;
  created_at: string;
  joybees_order_items: OrderItem[] | null;
}

/**
 * Exporta la lista completa de pedidos Joybees a Excel. El total se recalcula
 * desde los items (bulto 12), nunca el guardado.
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { data, error } = await joybeesServer
      .from("joybees_orders")
      .select("client_name, vendor_name, created_at, joybees_order_items(quantity, unit_price)")
      .eq("deleted", false) // soft-delete: los borrados no salen en el Excel
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[joybees/pedidos-export] Error:", error);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const rows = (data || []) as OrderRow[];

    const pedidos: PedidoExportRow[] = rows.map((r) => {
      const items = r.joybees_order_items || [];
      const total = calculateJoybeesOrderTotal(
        items.map((i) => ({ quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 })),
      );
      return {
        cliente: r.client_name,
        vendor: r.vendor_name,
        item_count: items.length,
        total,
        created_at: r.created_at,
      };
    });

    const wb = buildPedidosWorkbook({ titulo: "JOYBEES — Pedidos", conOrigen: false, pedidos });
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
