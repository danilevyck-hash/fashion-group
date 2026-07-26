// Export Excel de la lista de Proveedores (CxP) — construido con el helper
// estándar src/lib/excel-export.ts (hallazgo I11). Mismas columnas, subtítulo
// y totales que el generador manual anterior; moneda MONEY_FMT como números
// reales.

import {
  buildReportSheet,
  workbookFromSheets,
  downloadWorkbook,
  MONEY_FMT,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
// Solo el TIPO: el valor XLSX vive dentro de @/lib/excel-export. Un import de
// valor acá volvería a anclar la librería al grafo de quien importe este módulo.
import type XLSX from "xlsx-js-style";

export interface ProveedorExportRow {
  nombre: string;
  comprado_ytd: number;
  aging_current: number;
  aging_watch: number;
  aging_overdue: number;
  saldo_total: number;
  ultimo_pago_dias: number | null;
  empresas_count: number;
}

const COLUMNS: ReportColumn[] = [
  { header: "Proveedor", wch: 34 },
  { header: "Comprado YTD", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "0-90d", wch: 12, align: "right", fmt: MONEY_FMT },
  { header: "91-120d", wch: 12, align: "right", fmt: MONEY_FMT },
  { header: "121d+", wch: 12, align: "right", fmt: MONEY_FMT },
  { header: "Por pagar", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "Último pago", wch: 12, align: "right" },
  { header: "Empresas", wch: 10, align: "right" },
];

/** Construcción pura de la hoja (sin DOM) — testeable. */
export function buildProveedoresSheet(rows: ProveedorExportRow[], subtitle?: string): XLSX.WorkSheet {
  const data: ReportCell[][] = rows.map((p) => [
    { v: p.nombre, bold: p.saldo_total > 0 },
    p.comprado_ytd,
    p.aging_current,
    { v: p.aging_watch, ...(p.aging_watch > 0 ? { fg: "B45309" } : {}) },
    { v: p.aging_overdue, ...(p.aging_overdue > 0 ? { fg: "B91C1C" } : {}) },
    { v: p.saldo_total, bold: true, ...(p.saldo_total < 0 ? { fg: "2563EB" } : {}) },
    { v: p.ultimo_pago_dias != null ? `hace ${p.ultimo_pago_dias}d` : "—", fg: "555555" },
    { v: p.empresas_count, fg: "555555" },
  ]);

  const tot = rows.reduce(
    (acc, p) => ({
      comprado: acc.comprado + p.comprado_ytd,
      current: acc.current + p.aging_current,
      watch: acc.watch + p.aging_watch,
      overdue: acc.overdue + p.aging_overdue,
      saldo: acc.saldo + p.saldo_total,
    }),
    { comprado: 0, current: 0, watch: 0, overdue: 0, saldo: 0 }
  );

  return buildReportSheet({
    title: "FASHION GROUP — Proveedores (Cuentas por Pagar)",
    subtitle: subtitle || "Todo el grupo",
    columns: COLUMNS,
    rows: data,
    totals: [`${rows.length} proveedores`, tot.comprado, tot.current, tot.watch, tot.overdue, tot.saldo, null, null],
  });
}

export function exportProveedoresExcel(rows: ProveedorExportRow[], subtitle?: string, fileLabel?: string) {
  const wb = workbookFromSheets([{ name: "Proveedores", ws: buildProveedoresSheet(rows, subtitle) }]);
  const date = new Date().toISOString().slice(0, 10);
  const suffix = fileLabel ? `_${fileLabel.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}` : "";
  downloadWorkbook(wb, `Proveedores${suffix}_${date}.xlsx`);
}
