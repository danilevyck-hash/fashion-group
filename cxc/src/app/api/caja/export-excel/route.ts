import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import * as XLSX from "xlsx";

function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }

export async function POST(req: NextRequest) {
  const { periodo_id } = await req.json();
  if (!periodo_id) return NextResponse.json({ error: "No periodo_id" }, { status: 400 });

  const { data: periodo } = await supabaseServer.from("caja_periodos").select("*").eq("id", periodo_id).single();
  const { data: gastos } = await supabaseServer.from("caja_gastos").select("*").eq("periodo_id", periodo_id).order("fecha", { ascending: true });

  const rows: unknown[][] = [];
  rows.push(["FASHION GROUP — CAJA MENUDA"]);
  rows.push([`Período N° ${periodo?.numero || ""}`, `Apertura: ${fmtDate(periodo?.fecha_apertura || "")}`, "", "", "", "", `Fondo: $${(periodo?.fondo_inicial || 200).toFixed(2)}`]);
  rows.push([]);
  rows.push(["Fecha", "Descripción", "Proveedor", "Responsable", "Categoría", "N° Factura", "Sub-total", "ITBMS", "Total"]);

  let totalSub = 0, totalItbms = 0, totalTotal = 0;
  for (const g of gastos || []) {
    rows.push([fmtDate(g.fecha), g.descripcion || g.nombre || "", g.proveedor || "", g.responsable || "", g.categoria || "Varios", g.nro_factura || "", g.subtotal || 0, g.itbms || 0, g.total || 0]);
    totalSub += g.subtotal || 0; totalItbms += g.itbms || 0; totalTotal += g.total || 0;
  }

  rows.push([]);
  rows.push(["", "", "", "", "", "TOTALES", totalSub, totalItbms, totalTotal]);
  rows.push([]);
  rows.push(["", "", "", "", "", "Fondo inicial:", "", "", periodo?.fondo_inicial || 200]);
  rows.push(["", "", "", "", "", "Total gastado:", "", "", totalTotal]);
  rows.push(["", "", "", "", "", "Saldo disponible:", "", "", (periodo?.fondo_inicial || 200) - totalTotal]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 9 }, { wch: 11 }];
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="CajaMenuda-Periodo${periodo?.numero || ""}.xlsx"`,
    },
  });
}
