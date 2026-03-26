import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import XLSX from "xlsx-js-style";

function addr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }); }

const PRI = "1B3A5C";
const MID = "2E5E8E";
const BRD = "D5DBDB";
const B = {
  top: { style: "thin", color: { rgb: BRD } },
  bottom: { style: "thin", color: { rgb: BRD } },
  left: { style: "thin", color: { rgb: BRD } },
  right: { style: "thin", color: { rgb: BRD } },
};

export async function GET(req: NextRequest) {
  const quincena = req.nextUrl.searchParams.get("quincena") || "1";
  const mes = req.nextUrl.searchParams.get("mes") || String(new Date().getMonth() + 1);
  const año = req.nextUrl.searchParams.get("año") || String(new Date().getFullYear());

  const meses = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const periodoLabel = `${quincena === "1" ? "1ra" : "2da"} Quincena de ${meses[Number(mes)]} ${año}`;

  // Get active employees with movements
  const { data, error } = await supabaseServer
    .from("prestamos_empleados")
    .select("*, prestamos_movimientos(*)")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter to employees with pending balance
  const empleados = (data || []).filter((emp) => {
    const movs = emp.prestamos_movimientos || [];
    const prestado = movs
      .filter((m: { concepto: string; estado: string }) => m.concepto === "Préstamo" && m.estado === "aprobado")
      .reduce((s: number, m: { monto: number }) => s + Number(m.monto), 0);
    const pagado = movs
      .filter((m: { concepto: string; estado: string }) => (m.concepto === "Pago" || m.concepto === "Abono extra") && m.estado === "aprobado")
      .reduce((s: number, m: { monto: number }) => s + Number(m.monto), 0);
    return prestado - pagado > 0;
  });

  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const colWidths = [{ wch: 30 }, { wch: 25 }, { wch: 20 }];
  let r = 0;

  // Title
  ws[addr(r, 0)] = { v: "FASHION GROUP", t: "s", s: { font: { bold: true, sz: 16, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "center", vertical: "center" } } };
  for (let c = 1; c <= 2; c++) ws[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: PRI } } } };
  merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
  r++;

  // Subtitle
  ws[addr(r, 0)] = { v: `Reporte de Deducciones Quincenales — ${periodoLabel}`, t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
  for (let c = 1; c <= 2; c++) ws[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: MID } } } };
  merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
  r++;

  // Blank row
  r++;

  // Headers
  const headers = ["Empleado", "Empresa", "Deducción Quincenal"];
  headers.forEach((h, i) => {
    ws[addr(r, i)] = { v: h, t: "s", s: { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: i === 2 ? "right" : "left", vertical: "center" }, border: B } };
  });
  r++;

  // Data rows
  let total = 0;
  for (const emp of empleados) {
    const bg = r % 2 === 0 ? "F8F9F9" : "FFFFFF";
    ws[addr(r, 0)] = { v: emp.nombre, t: "s", s: { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, border: B } };
    ws[addr(r, 1)] = { v: emp.empresa || "", t: "s", s: { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, border: B } };
    ws[addr(r, 2)] = { v: Number(emp.deduccion_quincenal), t: "n", z: '"$"#,##0.00', s: { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "right" }, border: B } };
    total += Number(emp.deduccion_quincenal);
    r++;
  }

  // Total row
  ws[addr(r, 0)] = { v: "TOTAL", t: "s", s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "E8E8E8" } }, border: B } };
  ws[addr(r, 1)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: "E8E8E8" } }, border: B } };
  ws[addr(r, 2)] = { v: total, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "E8E8E8" } }, alignment: { horizontal: "right" }, border: B } };

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 2 } });
  ws["!merges"] = merges;
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Deducciones");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = `reporte-deducciones-${quincena === "1" ? "1ra" : "2da"}-quincena-${meses[Number(mes)]?.toLowerCase()}-${año}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
