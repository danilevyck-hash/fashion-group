// Excel export para el tab Resumen de /ventas.
// Portado del antiguo VentasClient.tsx; adaptado al shape VentasResumen del rediseño.
//
// Output: una hoja con título + nota de "Data actualizada al X" (cuando aplica),
// headers (Empresa | meses con data | Total | Margen% | YTD prev recortado |
// Δ vs prev %), una fila por empresa, y fila TOTAL al final con bold +
// formato moneda/%.
// Solo incluye meses con data en el año actual (drops futuros nulls).

import type { VentasResumen } from "@/components/ventas/types";
import { MONTHS } from "./format";

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatFechaPA(iso: string): string {
  const d = parseIsoDate(iso);
  const weekday = new Intl.DateTimeFormat("es-PA", { weekday: "long" }).format(d);
  const month = new Intl.DateTimeFormat("es-PA", { month: "long" }).format(d);
  return `${weekday} ${d.getDate()} de ${month} ${d.getFullYear()}`;
}

// Etiqueta para el header de la columna prev YTD (refleja el corte aplicado).
function prevYtdColumnLabel(data: VentasResumen, prevYear: number): string {
  if (!data.dia_corte_anio_anterior) return `YTD ${prevYear}`;
  const d = parseIsoDate(data.dia_corte_anio_anterior);
  return `YTD ${prevYear} (1 ene – ${d.getDate()} ${MES_FULL[d.getMonth()].toLowerCase().slice(0, 3)})`;
}

export async function exportResumenToExcel(data: VentasResumen): Promise<void> {
  const XLSX = (await import("xlsx-js-style")).default;
  const prevYear = data.year - 1;

  // Solo meses con data en al menos una empresa
  const monthsWithData: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (data.empresas.some(e => e.ventas2026[i] != null)) monthsWithData.push(i);
  }
  if (monthsWithData.length === 0) {
    for (let i = 0; i < 12; i++) monthsWithData.push(i);
  }

  const periodLabels = monthsWithData.map(i => `${MONTHS[i]} ${data.year}`);
  const prevYtdLabel = prevYtdColumnLabel(data, prevYear);
  const deltaLabel = `Δ vs ${prevYear} %`;
  const dataNote = data.fecha_corte
    ? `Data actualizada al ${formatFechaPA(data.fecha_corte)}`
    : "";

  // ── Rows ─────────────────────────────────────────────────────────────────
  // [0] título
  // [1] nota de fecha (vacío si no aplica)
  // [2] vacío
  // [3] headers
  // [4..] data
  // [last] TOTAL
  const rows: (string | number)[][] = [
    [`FASHION GROUP — Ventas ${data.year}`],
    [dataNote],
    [],
    ["Empresa", ...periodLabels, "Total", "Margen%", prevYtdLabel, deltaLabel],
  ];

  // Filas de empresa — incluye la nueva columna prev YTD + Δ
  for (const e of data.empresas) {
    const monthValues = monthsWithData.map(i => Number(e.ventas2026[i] ?? 0));
    const total = monthValues.reduce((s, v) => s + v, 0);
    if (total === 0) continue;
    // Prev YTD recortado per-empresa: la RPC ya devolvió ventas2025[mes] con
    // el cutoff aplicado y null para meses posteriores al en curso. Summing
    // con null→0 da el YTD ajustado.
    const prevYtd = e.ventas2025.reduce<number>((s, v) => s + (v ?? 0), 0);
    const delta = prevYtd > 0 ? (total - prevYtd) / prevYtd : 0;
    rows.push([e.empresa.nombre, ...monthValues, total, e.margenPct, prevYtd, delta]);
  }

  // Fila TOTAL
  const totalsByMonth = monthsWithData.map(i =>
    data.empresas.reduce((s, e) => s + Number(e.ventas2026[i] ?? 0), 0)
  );
  const grandTotal = totalsByMonth.reduce((s, v) => s + v, 0);
  const grandUtilidad = data.empresas.reduce((s, e) => {
    const ytdEmp = e.ventas2026.reduce<number>((sum, v) => sum + (v ?? 0), 0);
    return s + ytdEmp * e.margenPct;
  }, 0);
  const grandMargen = grandTotal > 0 ? grandUtilidad / grandTotal : 0;
  const grandPrevYtd = data.empresas.reduce<number>((s, e) =>
    s + e.ventas2025.reduce<number>((ss, v) => ss + (v ?? 0), 0), 0);
  const grandDelta = grandPrevYtd > 0 ? (grandTotal - grandPrevYtd) / grandPrevYtd : 0;
  rows.push(["TOTAL", ...totalsByMonth, grandTotal, grandMargen, grandPrevYtd, grandDelta]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const numPeriods = periodLabels.length;
  // Empresa + N meses + Total + Margen% + PrevYTD + Δ
  const totalCols = 1 + numPeriods + 4;
  ws["!cols"] = [
    { wch: 24 },
    ...periodLabels.map(() => ({ wch: 14 })),
    { wch: 16 }, // Total
    { wch: 10 }, // Margen%
    { wch: 22 }, // YTD prev (largo por el rango entre paréntesis)
    { wch: 12 }, // Δ vs prev
  ];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }, // título merge
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } }, // nota merge
  ];

  const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };
  const noteCell = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
  if (noteCell) noteCell.s = { font: { italic: true, sz: 10, color: { rgb: "666666" } } };

  // Header row (r=3) bold
  for (let c = 0; c < totalCols; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 3, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const dataStartRow = 4;
  const lastDataRow = rows.length - 1;
  const currFmt = { numFmt: "$#,##0.00" };
  const pctFmt = { numFmt: "0.0%" };

  for (let r = dataStartRow; r <= lastDataRow; r++) {
    const isTotal = r === lastDataRow;
    const base = isTotal ? { font: { bold: true } } : {};
    // Cols 1..numPeriods+1 = meses + Total → moneda
    for (let c = 1; c <= numPeriods + 1; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = { ...base, ...currFmt };
    }
    // Margen% (col numPeriods+2)
    const mCell = ws[XLSX.utils.encode_cell({ r, c: numPeriods + 2 })];
    if (mCell) mCell.s = { ...base, ...pctFmt };
    // YTD prev (col numPeriods+3) → moneda
    const pyCell = ws[XLSX.utils.encode_cell({ r, c: numPeriods + 3 })];
    if (pyCell) pyCell.s = { ...base, ...currFmt };
    // Δ vs prev (col numPeriods+4) → pct
    const dCell = ws[XLSX.utils.encode_cell({ r, c: numPeriods + 4 })];
    if (dCell) dCell.s = { ...base, ...pctFmt };
    if (isTotal) {
      const nCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (nCell) nCell.s = { font: { bold: true } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ventas");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ventas-${data.year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
