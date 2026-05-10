// Excel export para el tab Resumen de /ventas.
// Portado del antiguo VentasClient.tsx; adaptado al shape VentasResumen del rediseño.
//
// Output: una hoja con título, headers (Empresa | 12 meses | Total | Margen%),
// una fila por empresa, y fila TOTAL al final con bold + formato moneda/%.
// Solo incluye meses con data en el año actual (drops futuros nulls).

import type { VentasResumen } from "@/components/ventas/types";
import { MONTHS } from "./format";

export async function exportResumenToExcel(data: VentasResumen): Promise<void> {
  const XLSX = (await import("xlsx-js-style")).default;

  // Solo meses con data en al menos una empresa
  const monthsWithData: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (data.empresas.some(e => e.ventas2026[i] != null)) monthsWithData.push(i);
  }
  if (monthsWithData.length === 0) {
    // No data — fallback: muestra todos los meses vacíos
    for (let i = 0; i < 12; i++) monthsWithData.push(i);
  }

  const periodLabels = monthsWithData.map(i => `${MONTHS[i]} ${data.year}`);

  const rows: (string | number)[][] = [
    [`FASHION GROUP — Ventas ${data.year}`],
    [],
    ["Empresa", ...periodLabels, "Total", "Margen%"],
  ];

  // Filas de empresa
  for (const e of data.empresas) {
    const monthValues = monthsWithData.map(i => Number(e.ventas2026[i] ?? 0));
    const total = monthValues.reduce((s, v) => s + v, 0);
    if (total === 0) continue; // skip empresas sin data
    rows.push([e.empresa.nombre, ...monthValues, total, e.margenPct]);
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
  rows.push(["TOTAL", ...totalsByMonth, grandTotal, grandMargen]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 24 },
    ...periodLabels.map(() => ({ wch: 14 })),
    { wch: 16 },
    { wch: 10 },
  ];
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: periodLabels.length + 2 } }];

  const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };

  // Header bold
  for (let c = 0; c < periodLabels.length + 3; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 2, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const dataStartRow = 3;
  const lastDataRow = rows.length - 1;
  const numPeriods = periodLabels.length;
  const currFmt = { numFmt: "$#,##0.00" };
  const pctFmt = { numFmt: "0.0%" };

  for (let r = dataStartRow; r <= lastDataRow; r++) {
    const isTotal = r === lastDataRow;
    const base = isTotal ? { font: { bold: true } } : {};
    for (let c = 1; c <= numPeriods + 1; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = { ...base, ...currFmt };
    }
    const mCell = ws[XLSX.utils.encode_cell({ r, c: numPeriods + 2 })];
    if (mCell) mCell.s = { ...base, ...pctFmt };
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
