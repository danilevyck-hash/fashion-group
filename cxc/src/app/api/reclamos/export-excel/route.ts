import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import * as XLSX from "xlsx";

function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }

export async function POST(req: NextRequest) {
  const { ids } = await req.json();
  if (!ids || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "No IDs" }, { status: 400 });

  const { data: reclamos, error } = await supabaseServer.from("reclamos").select("*, reclamo_items(*)").in("id", ids).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const wb = XLSX.utils.book_new();
  const cols = [{ wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 24 }];

  for (const rec of reclamos || []) {
    const items = (rec.reclamo_items || []) as Record<string, unknown>[];
    const rows: unknown[][] = [];
    rows.push(["FASHION GROUP"]);
    rows.push([]);
    rows.push(["Reclamo N°", rec.nro_reclamo]);
    rows.push(["Empresa", rec.empresa]);
    rows.push(["Proveedor", rec.proveedor]);
    rows.push(["Marca", rec.marca]);
    rows.push(["N° Factura", rec.nro_factura]);
    rows.push(["Fecha", fmtDate(rec.fecha_reclamo)]);
    rows.push(["Estado", rec.estado]);
    rows.push([]);
    rows.push(["Código", "Descripción", "Talla", "Cant.", "Precio Unit.", "Subtotal", "Motivo"]);
    let subtotal = 0;
    for (const item of items) {
      const cant = Number(item.cantidad) || 0;
      const precio = Number(item.precio_unitario) || 0;
      const sub = cant * precio;
      subtotal += sub;
      rows.push([item.referencia, item.descripcion, item.talla, cant, precio, sub, item.motivo]);
    }
    rows.push([]);
    rows.push([null, null, null, null, "Subtotal:", subtotal]);
    rows.push([null, null, null, null, "Importación (10%):", subtotal * 0.10]);
    rows.push([null, null, null, null, "ITBMS:", subtotal * 0.077]);
    rows.push([null, null, null, null, "TOTAL:", subtotal * 1.177]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = cols;
    const name = (rec.nro_reclamo || "Reclamo").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Reclamos-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
