import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";
import XLSX from "xlsx-js-style";

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

function addr(r: number, c: number) {
  return XLSX.utils.encode_cell({ r, c });
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const B = {
  top: { style: "thin", color: { rgb: "E8E8E8" } },
  bottom: { style: "thin", color: { rgb: "E8E8E8" } },
  left: { style: "thin", color: { rgb: "E8E8E8" } },
  right: { style: "thin", color: { rgb: "E8E8E8" } },
};

function band(v: string, bg: string, fg: string, sz: number, bold: boolean, italic = false) {
  return { v, t: "s", s: { font: { bold, sz, color: { rgb: fg }, italic, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "left", vertical: "center" } } };
}
function hdr(v: string, right = false) {
  return { v, t: "s", s: { font: { bold: true, sz: 9, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: "1A2656" } }, alignment: { horizontal: right ? "right" : "left", vertical: "center" }, border: B } };
}
function td(v: string, alt: boolean, opts: { sz?: number; fg?: string; italic?: boolean } = {}) {
  return { v, t: "s", s: { font: { sz: opts.sz || 10, color: { rgb: opts.fg || "333333" }, italic: opts.italic, name: "Calibri" }, fill: { fgColor: { rgb: alt ? "FAFAFA" : "FFFFFF" } }, alignment: { horizontal: "left" }, border: B } };
}
function tdInt(v: number, alt: boolean) {
  return { v, t: "n", z: "0", s: { font: { sz: 10, color: { rgb: "333333" }, name: "Calibri" }, fill: { fgColor: { rgb: alt ? "FAFAFA" : "FFFFFF" } }, alignment: { horizontal: "right" }, border: B } };
}
function tdMoney(v: number, alt: boolean, bold = false) {
  return { v, t: "n", z: '"$"#,##0.00', s: { font: { sz: 10, bold, color: { rgb: "111111" }, name: "Calibri" }, fill: { fgColor: { rgb: alt ? "FAFAFA" : "FFFFFF" } }, alignment: { horizontal: "right" }, border: B } };
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
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[joybees/pedidos-export] Error:", error);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const rows = (data || []) as OrderRow[];

    const pedidos = rows.map((r) => {
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

    const ws: XLSX.WorkSheet = {};
    const heights: number[] = [];
    let r = 0;

    // Título
    for (let c = 0; c <= 3; c++) ws[addr(r, c)] = band(c === 0 ? "JOYBEES — Pedidos" : "", "1A2656", "FFFFFF", 14, true);
    heights[r] = 30; r++;
    for (let c = 0; c <= 3; c++) ws[addr(r, c)] = band(c === 0 ? `${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""}  ·  ${fmtDate(new Date().toISOString())}` : "", "2A3666", "AAB0CC", 10, false, true);
    heights[r] = 18; r++;
    heights[r] = 6; r++;

    // Encabezados (Items y Total alineados a la derecha)
    const cols = ["Cliente", "Vendedor", "Items", "Total", "Fecha"];
    cols.forEach((h, i) => { ws[addr(r, i)] = hdr(h, i === 2 || i === 3); });
    heights[r] = 20; r++;

    let grandTotal = 0;
    pedidos.forEach((p, i) => {
      const alt = i % 2 === 0;
      ws[addr(r, 0)] = td(p.cliente || "Sin nombre", alt, { fg: "111111", italic: !p.cliente });
      ws[addr(r, 1)] = td(p.vendor || "", alt, { sz: 9, fg: "666666" });
      ws[addr(r, 2)] = tdInt(p.item_count, alt);
      ws[addr(r, 3)] = tdMoney(p.total, alt, true);
      ws[addr(r, 4)] = td(fmtDate(p.created_at), alt, { sz: 9, fg: "555555" });
      grandTotal += p.total;
      heights[r] = 18; r++;
    });

    heights[r] = 6; r++;

    // Totales
    for (let c = 0; c <= 2; c++) ws[addr(r, c)] = { v: c === 2 ? "TOTAL" : "", t: "s", s: { font: { bold: true, sz: 9, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, alignment: { horizontal: c === 2 ? "right" : "left" }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
    ws[addr(r, 3)] = { v: grandTotal, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 11, color: { rgb: "111111" }, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, alignment: { horizontal: "right" }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
    ws[addr(r, 4)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: "F0F0F0" } }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
    heights[r] = 22; r++;

    ws["!ref"] = `A1:E${r}`;
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    ];
    ws["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 8 }, { wch: 13 }, { wch: 12 }];
    ws["!rows"] = heights.map((h) => ({ hpt: h || 16 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const fecha = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Pedidos-Joybees-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("[joybees/pedidos-export] Error:", err);
    return NextResponse.json({ error: "Error al generar el Excel. Intenta de nuevo." }, { status: 500 });
  }
}
