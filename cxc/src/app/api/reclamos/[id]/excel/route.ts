import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import * as XLSX from "xlsx";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function buildSheet(rec: Record<string, unknown>, items: Record<string, unknown>[]) {
  const rows: unknown[][] = [];

  rows.push(["FASHION GROUP"]);
  rows.push([]);
  rows.push(["Reclamo N°", rec.nro_reclamo]);
  rows.push(["Empresa", rec.empresa]);
  rows.push(["Proveedor", rec.proveedor]);
  rows.push(["Marca", rec.marca]);
  rows.push(["N° Factura", rec.nro_factura]);
  rows.push(["N° Orden de Compra", rec.nro_orden_compra || ""]);
  rows.push(["Fecha de Reclamo", fmtDate(rec.fecha_reclamo as string)]);
  rows.push(["Estado", rec.estado]);
  rows.push([]);
  rows.push(["Código", "Descripción", "Talla", "Cant.", "Precio Unit.", "Subtotal", "Motivo", "N° Factura", "N° PO"]);

  let subtotal = 0;
  for (const item of items) {
    const cant = Number(item.cantidad) || 0;
    const precio = Number(item.precio_unitario) || 0;
    const sub = cant * precio;
    subtotal += sub;
    rows.push([item.referencia, item.descripcion, item.talla, cant, precio, sub, item.motivo, item.nro_factura || "", item.nro_orden_compra || ""]);
  }

  rows.push([]);
  rows.push([null, null, null, null, null, "Subtotal:", subtotal]);
  rows.push([null, null, null, null, null, "Importación (10%):", subtotal * 0.10]);
  rows.push([null, null, null, null, null, "ITBMS (7%):", subtotal * 0.07]);
  rows.push([null, null, null, null, null, "TOTAL:", subtotal * 1.17]);

  return rows;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Not found" }, { status: 500 });

  const items = (data.reclamo_items || []) as Record<string, unknown>[];
  const rows = buildSheet(data, items);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Merge A1:I1 for title
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

  // Column widths
  ws["!cols"] = [
    { wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reclamo");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Reclamo-${data.nro_reclamo}.xlsx"`,
    },
  });
}
