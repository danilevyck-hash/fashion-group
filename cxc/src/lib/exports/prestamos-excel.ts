// Builder puro del export Excel de Préstamos (I11 — estilo de la casa).
// La route solo hace auth + fetch + workbookBuffer; esto es testeable en vitest.

import XLSX from "xlsx-js-style";
import {
  MONEY_FMT,
  PCT_FMT,
  buildReportSheet,
  workbookFromSheets,
  type ReportCell,
} from "@/lib/excel-export";
import { fmtDate } from "@/lib/format";

export interface MovimientoRow {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  notas: string | null;
  estado: string;
  created_at: string;
  deleted?: boolean | null;
}

export interface EmpleadoRow {
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
  const aprobados = movs.filter((m) => m.estado === "aprobado");
  const prestado = aprobados.filter((m) => PRESTAMO_CONCEPTOS.includes(m.concepto)).reduce((s, m) => s + Number(m.monto), 0);
  const pagado = aprobados.filter((m) => PAGO_CONCEPTOS.includes(m.concepto)).reduce((s, m) => s + Number(m.monto), 0);
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

export function buildPrestamosWorkbook(empleados: EmpleadoRow[], empresaFilter: string | null): XLSX.WorkBook {
  const titleSuffix = empresaFilter ? ` — ${empresaFilter}` : " — Todas las empresas";

  // ─── Hoja 1: Resumen ───────────────────────────────────────────────────────
  let totPrestado = 0, totPagado = 0, totSaldo = 0;
  const resumenRows: ReportCell[][] = empleados.map((emp) => {
    const { prestado, pagado, saldo, pct } = calcSaldo(emp.prestamos_movimientos || []);
    totPrestado += prestado; totPagado += pagado; totSaldo += saldo;
    return [
      emp.nombre,
      emp.empresa || "",
      Number(emp.deduccion_quincenal),
      prestado,
      pagado,
      saldo,
      pct / 100,
    ];
  });

  const wsResumen = buildReportSheet({
    title: "FASHION GROUP",
    subtitle: `Historial de Préstamos${titleSuffix}`,
    columns: [
      { header: "Empleado", wch: 30 },
      { header: "Empresa", wch: 25 },
      { header: "Deducción Quincenal", wch: 18, align: "right", fmt: MONEY_FMT },
      { header: "Total Prestado", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Total Pagado", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Saldo Pendiente", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "% Progreso", wch: 12, align: "right", fmt: PCT_FMT },
    ],
    rows: resumenRows,
    totals: ["TOTALES", null, null, totPrestado, totPagado, totSaldo, null],
  });

  // ─── Hoja 2: Movimientos ───────────────────────────────────────────────────
  // Por empleado (ASC), luego movimientos (fecha DESC, created_at DESC).
  const movRows: ReportCell[][] = [];
  for (const emp of empleados) {
    const movs = [...(emp.prestamos_movimientos || [])].sort((a, b) => {
      const f = b.fecha.localeCompare(a.fecha);
      if (f !== 0) return f;
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    for (const m of movs) {
      movRows.push([
        emp.nombre,
        emp.empresa || "",
        fmtDate(m.fecha.slice(0, 10)),
        m.concepto,
        Number(m.monto),
        m.notas || "",
        estadoLabel(m.estado),
      ]);
    }
  }

  const wsMovs = buildReportSheet({
    title: "FASHION GROUP",
    subtitle: `Movimientos${titleSuffix}`,
    columns: [
      { header: "Empleado", wch: 30 },
      { header: "Empresa", wch: 25 },
      { header: "Fecha", wch: 12 },
      { header: "Concepto", wch: 26 },
      { header: "Monto", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Notas", wch: 40 },
      { header: "Estado", wch: 22 },
    ],
    rows: movRows,
  });

  return workbookFromSheets([
    { name: "Resumen", ws: wsResumen },
    { name: "Movimientos", ws: wsMovs },
  ]);
}
