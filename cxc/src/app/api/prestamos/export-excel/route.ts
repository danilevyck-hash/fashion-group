import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { filterEmpleadosMovimientos } from "@/lib/prestamos-helpers";
import { fmtDate } from "@/lib/format";
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

interface MovimientoRow {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  notas: string | null;
  estado: string;
  created_at: string;
  deleted?: boolean | null;
}

interface EmpleadoRow {
  id: string;
  nombre: string;
  empresa: string | null;
  deduccion_quincenal: number;
  activo: boolean;
  prestamos_movimientos: MovimientoRow[];
}

const PRESTAMO_CONCEPTOS = ["Préstamo", "Responsabilidad por daño"];
const PAGO_CONCEPTOS = ["Pago", "Abono extra", "Pago de responsabilidad"];

function calcSaldo(movs: MovimientoRow[]) {
  const aprobados = movs.filter(m => m.estado === "aprobado");
  const prestado = aprobados.filter(m => PRESTAMO_CONCEPTOS.includes(m.concepto)).reduce((s, m) => s + Number(m.monto), 0);
  const pagado = aprobados.filter(m => PAGO_CONCEPTOS.includes(m.concepto)).reduce((s, m) => s + Number(m.monto), 0);
  const saldo = prestado - pagado;
  const pct = prestado > 0 ? (pagado / prestado) * 100 : 0;
  return { prestado, pagado, saldo, pct };
}

function estadoLabel(estado: string) {
  if (estado === "pendiente_aprobacion") return "Pendiente de aprobación";
  if (estado === "aprobado") return "Aprobado";
  if (estado === "rechazado") return "Rechazado";
  return estado;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const empresaParam = req.nextUrl.searchParams.get("empresa");
  const empresaFilter = empresaParam && empresaParam !== "all" ? empresaParam : null;

  let query = supabaseServer
    .from("prestamos_empleados")
    .select("*, prestamos_movimientos(*)")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (empresaFilter) query = query.eq("empresa", empresaFilter);

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const empleados = filterEmpleadosMovimientos(data) as EmpleadoRow[];

  // ─── Sheet 1: Resumen ───────────────────────────────────────
  const wsResumen: XLSX.WorkSheet = {};
  const mergesResumen: XLSX.Range[] = [];
  let r = 0;

  const titleSuffix = empresaFilter ? ` — ${empresaFilter}` : " — Todas las empresas";

  wsResumen[addr(r, 0)] = { v: "FASHION GROUP", t: "s", s: { font: { bold: true, sz: 16, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "center", vertical: "center" } } };
  for (let c = 1; c <= 6; c++) wsResumen[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: PRI } } } };
  mergesResumen.push({ s: { r, c: 0 }, e: { r, c: 6 } });
  r++;

  wsResumen[addr(r, 0)] = { v: `Historial de Préstamos${titleSuffix}`, t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
  for (let c = 1; c <= 6; c++) wsResumen[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: MID } } } };
  mergesResumen.push({ s: { r, c: 0 }, e: { r, c: 6 } });
  r++;

  r++; // blank row

  const headersResumen = ["Empleado", "Empresa", "Deducción Quincenal", "Total Prestado", "Total Pagado", "Saldo Pendiente", "% Progreso"];
  headersResumen.forEach((h, i) => {
    wsResumen[addr(r, i)] = { v: h, t: "s", s: { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: i >= 2 ? "right" : "left", vertical: "center" }, border: B } };
  });
  r++;

  let totPrestado = 0, totPagado = 0, totSaldo = 0;
  for (const emp of empleados) {
    const { prestado, pagado, saldo, pct } = calcSaldo(emp.prestamos_movimientos || []);
    totPrestado += prestado; totPagado += pagado; totSaldo += saldo;
    const bg = r % 2 === 0 ? "F8F9F9" : "FFFFFF";
    const baseStyle = { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, border: B };
    wsResumen[addr(r, 0)] = { v: emp.nombre, t: "s", s: baseStyle };
    wsResumen[addr(r, 1)] = { v: emp.empresa || "", t: "s", s: baseStyle };
    wsResumen[addr(r, 2)] = { v: Number(emp.deduccion_quincenal), t: "n", z: '"$"#,##0.00', s: { ...baseStyle, alignment: { horizontal: "right" } } };
    wsResumen[addr(r, 3)] = { v: prestado, t: "n", z: '"$"#,##0.00', s: { ...baseStyle, alignment: { horizontal: "right" } } };
    wsResumen[addr(r, 4)] = { v: pagado, t: "n", z: '"$"#,##0.00', s: { ...baseStyle, alignment: { horizontal: "right" } } };
    wsResumen[addr(r, 5)] = { v: saldo, t: "n", z: '"$"#,##0.00', s: { ...baseStyle, alignment: { horizontal: "right" } } };
    wsResumen[addr(r, 6)] = { v: pct / 100, t: "n", z: "0.0%", s: { ...baseStyle, alignment: { horizontal: "right" } } };
    r++;
  }

  // Totals row
  const totalStyle = { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "E8E8E8" } }, border: B };
  wsResumen[addr(r, 0)] = { v: "TOTALES", t: "s", s: totalStyle };
  wsResumen[addr(r, 1)] = { v: "", t: "s", s: totalStyle };
  wsResumen[addr(r, 2)] = { v: "", t: "s", s: totalStyle };
  wsResumen[addr(r, 3)] = { v: totPrestado, t: "n", z: '"$"#,##0.00', s: { ...totalStyle, alignment: { horizontal: "right" } } };
  wsResumen[addr(r, 4)] = { v: totPagado, t: "n", z: '"$"#,##0.00', s: { ...totalStyle, alignment: { horizontal: "right" } } };
  wsResumen[addr(r, 5)] = { v: totSaldo, t: "n", z: '"$"#,##0.00', s: { ...totalStyle, alignment: { horizontal: "right" } } };
  wsResumen[addr(r, 6)] = { v: "", t: "s", s: totalStyle };

  wsResumen["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 6 } });
  wsResumen["!merges"] = mergesResumen;
  wsResumen["!cols"] = [{ wch: 30 }, { wch: 25 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];

  // ─── Sheet 2: Movimientos ───────────────────────────────────
  const wsMovs: XLSX.WorkSheet = {};
  const mergesMovs: XLSX.Range[] = [];
  r = 0;

  wsMovs[addr(r, 0)] = { v: "FASHION GROUP", t: "s", s: { font: { bold: true, sz: 16, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "center", vertical: "center" } } };
  for (let c = 1; c <= 6; c++) wsMovs[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: PRI } } } };
  mergesMovs.push({ s: { r, c: 0 }, e: { r, c: 6 } });
  r++;

  wsMovs[addr(r, 0)] = { v: `Movimientos${titleSuffix}`, t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
  for (let c = 1; c <= 6; c++) wsMovs[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: MID } } } };
  mergesMovs.push({ s: { r, c: 0 }, e: { r, c: 6 } });
  r++;

  r++; // blank row

  const headersMovs = ["Empleado", "Empresa", "Fecha", "Concepto", "Monto", "Notas", "Estado"];
  headersMovs.forEach((h, i) => {
    wsMovs[addr(r, i)] = { v: h, t: "s", s: { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: i === 4 ? "right" : "left", vertical: "center" }, border: B } };
  });
  r++;

  // Build rows: per employee (ASC), then movs (fecha DESC, created_at DESC)
  for (const emp of empleados) {
    const movs = [...(emp.prestamos_movimientos || [])].sort((a, b) => {
      const f = b.fecha.localeCompare(a.fecha);
      if (f !== 0) return f;
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    for (const m of movs) {
      const bg = r % 2 === 0 ? "F8F9F9" : "FFFFFF";
      const baseStyle = { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, border: B };
      wsMovs[addr(r, 0)] = { v: emp.nombre, t: "s", s: baseStyle };
      wsMovs[addr(r, 1)] = { v: emp.empresa || "", t: "s", s: baseStyle };
      wsMovs[addr(r, 2)] = { v: fmtDate(m.fecha.slice(0, 10)), t: "s", s: baseStyle };
      wsMovs[addr(r, 3)] = { v: m.concepto, t: "s", s: baseStyle };
      wsMovs[addr(r, 4)] = { v: Number(m.monto), t: "n", z: '"$"#,##0.00', s: { ...baseStyle, alignment: { horizontal: "right" } } };
      wsMovs[addr(r, 5)] = { v: m.notas || "", t: "s", s: baseStyle };
      wsMovs[addr(r, 6)] = { v: estadoLabel(m.estado), t: "s", s: baseStyle };
      r++;
    }
  }

  wsMovs["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 4), c: 6 } });
  wsMovs["!merges"] = mergesMovs;
  wsMovs["!cols"] = [{ wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 40 }, { wch: 22 }];

  // ─── Build workbook ─────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
  XLSX.utils.book_append_sheet(wb, wsMovs, "Movimientos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const slug = empresaFilter ? empresaFilter.toLowerCase().replace(/\s+/g, "_") : "todos";
  const filename = `historial_prestamos_${slug}_${ymd}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
