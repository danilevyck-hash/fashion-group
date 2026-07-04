// Export Excel de Cheques — extraído de ChequesClient.tsx y construido con el
// helper estándar src/lib/excel-export.ts (hallazgo I11). Mismas columnas y
// datos que el export inline anterior; gana subtítulo en banda MID + separador
// y la fila de totales pasa a banda navy (estilo de la casa).

import {
  buildReportSheet,
  workbookFromSheets,
  downloadWorkbook,
  exportFilename,
  MONEY_FMT,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
import XLSX from "xlsx-js-style";
import { fmtDate } from "@/lib/format";

export interface ChequeExportRow {
  cliente: string;
  numero_cheque: string;
  monto: number;
  fecha_deposito: string;
  vendedor?: string;
}

const COLUMNS: ReportColumn[] = [
  { header: "Cliente", wch: 28 },
  { header: "Nº Cheque", wch: 16 },
  { header: "Monto", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "Fecha Depósito", wch: 16 },
  { header: "Vendedor", wch: 18 },
];

/** Construcción pura de la hoja (sin DOM) — testeable. */
export function buildChequesSheet(data: ChequeExportRow[], label: string): { ws: XLSX.WorkSheet; sheetName: string } {
  const sheetName = label.charAt(0).toUpperCase() + label.slice(1);

  const rows: ReportCell[][] = data.map((ch) => [
    { v: ch.cliente, fg: "111111" },
    { v: ch.numero_cheque, sz: 9 },
    Number(ch.monto) || 0,
    { v: fmtDate(ch.fecha_deposito), fg: "555555", sz: 9 },
    { v: ch.vendedor || "", fg: "555555", sz: 9 },
  ]);

  const totalMonto = data.reduce((s, c) => s + (Number(c.monto) || 0), 0);

  const ws = buildReportSheet({
    title: "FASHION GROUP — Cheques",
    subtitle: sheetName,
    columns: COLUMNS,
    rows,
    totals: [`${data.length} cheques`, null, totalMonto, null, null],
  });
  return { ws, sheetName };
}

/** label = filtro en texto ("pendientes", "vencen hoy", "todos", ...). */
export function exportChequesExcel(data: ChequeExportRow[], label: string) {
  const { ws, sheetName } = buildChequesSheet(data, label);
  const wb = workbookFromSheets([{ name: sheetName, ws }]);
  downloadWorkbook(wb, exportFilename(`cheques-${label.replace(/ /g, "-")}`));
}
