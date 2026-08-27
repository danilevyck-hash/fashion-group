// Builder puro del export Excel de Caja Menuda (I11 — estilo de la casa).
// La route solo hace auth + fetch + workbookBuffer; esto es testeable en vitest.

import XLSX from "xlsx-js-style";
import {
  CASA_PALETTE,
  MONEY_FMT,
  PCT_FMT,
  addr,
  fmtFechaExcel,
  buildReportSheet,
  makeCellStyles,
  workbookFromSheets,
  type ReportCell,
} from "@/lib/excel-export";

export interface CajaPeriodo {
  numero?: number | string | null;
  fecha_apertura?: string | null;
  fondo_inicial?: number | null;
}

export interface CajaGasto {
  fecha: string;
  descripcion?: string | null;
  nombre?: string | null;
  proveedor?: string | null;
  categoria?: string | null;
  nro_factura?: string | null;
  responsable?: string | null;
  subtotal?: number | null;
  itbms?: number | null;
  total?: number | null;
}

const SALDO_POSITIVO = { fg: "15803D", bg: "F0FDF4" };
const SALDO_NEGATIVO = { fg: "DC2626", bg: "FEF2F2" };

export function buildCajaWorkbook(periodo: CajaPeriodo, gastos: CajaGasto[]): XLSX.WorkBook {
  const fondo = periodo?.fondo_inicial || 200;

  let totalSub = 0, totalItbms = 0, totalTotal = 0;
  const rows: ReportCell[][] = gastos.map((g) => {
    totalSub += g.subtotal || 0;
    totalItbms += g.itbms || 0;
    totalTotal += g.total || 0;
    return [
      fmtFechaExcel(g.fecha),
      { v: g.descripcion || g.nombre || "", fg: "111111" },
      { v: g.proveedor || "", fg: "666666", sz: 9 },
      g.categoria || "Varios",
      { v: g.nro_factura || "", fg: "999999", sz: 9 },
      g.subtotal || 0,
      g.itbms || 0,
      { v: g.total || 0, bold: true },
    ];
  });

  // ─── Hoja 1: Gastos ────────────────────────────────────────────────────────
  const ws = buildReportSheet({
    columns: [
      { header: "Fecha", wch: 11 },
      { header: "Descripción", wch: 26 },
      { header: "Proveedor", wch: 16 },
      { header: "Categoría", wch: 14 },
      { header: "N° Factura", wch: 14 },
      { header: "Sub-total", wch: 11, align: "right", fmt: MONEY_FMT },
      { header: "ITBMS", wch: 9, align: "right", fmt: MONEY_FMT },
      { header: "Total", wch: 11, align: "right", fmt: MONEY_FMT },
    ],
    rows,
    totals: [null, null, null, null, "TOTALES", totalSub, totalItbms, totalTotal],
  });

  // Resumen de saldo (layout propio bajo la tabla) con la misma paleta.
  appendSaldoSummary(ws, fondo, totalTotal);

  // ─── Hoja 2: Por Categoría ─────────────────────────────────────────────────
  const byCategory: Record<string, number> = {};
  for (const g of gastos) {
    const cat = g.categoria || "Varios";
    byCategory[cat] = (byCategory[cat] || 0) + (g.total || 0);
  }
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  const ws2 = buildReportSheet({
    columns: [
      { header: "Categoría", wch: 22 },
      { header: "Total", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "% del total", wch: 12, align: "right", fmt: PCT_FMT },
    ],
    rows: sorted.map(([cat, total], i) => [
      i === 0 ? { v: cat, bold: true } : cat, // categoría top destacada
      i === 0 ? { v: total, bold: true } : total,
      totalTotal > 0 ? total / totalTotal : 0,
    ]),
    totals: ["TOTAL", totalTotal, { v: 1, fmt: "0%" }],
  });

  return workbookFromSheets([
    { name: "Gastos", ws },
    { name: "Por Categoría", ws: ws2 },
  ]);
}

/** Bloque "Fondo inicial / Total gastado / Saldo disponible" bajo la tabla. */
function appendSaldoSummary(ws: XLSX.WorkSheet, fondo: number, totalTotal: number) {
  const { B } = makeCellStyles(CASA_PALETTE);
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  const lastCol = range.e.c;
  const heights = (ws["!rows"] || []).map((row) => (row as { hpt?: number }).hpt || 16);
  let r = range.e.r + 1;

  const lbl = (v: string, bold = false) => ({
    v, t: "s" as const, s: {
      font: { sz: bold ? 10 : 9, bold, color: { rgb: bold ? "333333" : "888888" }, name: "Calibri" },
      alignment: { horizontal: "right" },
    },
  });
  const num = (v: number, opts: { bold?: boolean; fg?: string } = {}) => ({
    v, t: "n" as const, z: MONEY_FMT, s: {
      font: { sz: 10, bold: opts.bold || false, color: { rgb: opts.fg || "333333" }, name: "Calibri" },
      alignment: { horizontal: "right" },
    },
  });

  heights[r] = 6; r++; // espaciador

  ws[addr(r, lastCol - 2)] = lbl("Fondo inicial:");
  ws[addr(r, lastCol)] = num(fondo);
  heights[r] = 18; r++;

  ws[addr(r, lastCol - 2)] = lbl("Total gastado:");
  ws[addr(r, lastCol)] = num(totalTotal, totalTotal > fondo * 0.8 ? { fg: SALDO_NEGATIVO.fg } : {});
  heights[r] = 18; r++;

  const saldo = fondo - totalTotal;
  const saldoColor = saldo > 0 ? SALDO_POSITIVO : SALDO_NEGATIVO;
  ws[addr(r, lastCol - 2)] = lbl("Saldo disponible:", true);
  ws[addr(r, lastCol)] = {
    v: saldo, t: "n", z: MONEY_FMT, s: {
      font: { bold: true, sz: 11, color: { rgb: saldoColor.fg }, name: "Calibri" },
      fill: { fgColor: { rgb: saldoColor.bg } },
      alignment: { horizontal: "right" },
      border: B,
    },
  };
  heights[r] = 20;

  ws["!ref"] = `A1:${addr(r, lastCol)}`;
  ws["!rows"] = heights.map((h) => ({ hpt: h || 16 }));
}
