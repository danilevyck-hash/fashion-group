// Excel export para el tab Resumen de /ventas.
// Migrado al estilo de la casa (src/lib/excel-export.ts, hallazgo I11):
// banda de título navy + subtítulo MID (nota "Data actualizada al ..."),
// headers navy, zebra, fila TOTAL en banda PRI. Moneda MONEY_FMT y % PCT_FMT
// como números reales. Mismas columnas y datos que la versión anterior:
// Empresa | meses con data | Total | Margen% | YTD prev recortado | Δ vs prev %.

import type { WorkSheet } from "xlsx-js-style";
import type { VentasResumen } from "@/components/ventas/types";
import { MONTHS } from "./format";
import { variacionPct } from "../variacion";

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Etiqueta para el header de la columna prev YTD (refleja el corte aplicado).
function prevYtdColumnLabel(data: VentasResumen, prevYear: number): string {
  if (!data.dia_corte_anio_anterior) return `YTD ${prevYear}`;
  const d = parseIsoDate(data.dia_corte_anio_anterior);
  return `YTD ${prevYear} (1 ene – ${d.getDate()} ${MES_FULL[d.getMonth()].toLowerCase().slice(0, 3)})`;
}

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildResumenSheet(data: VentasResumen): Promise<WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");
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
  // Filas de empresa — meses + Total + Margen% + prev YTD + Δ
  // `null` = celda VACÍA en el Excel (lo soporta ReportCell). Es lo que se usa
  // cuando no hay base comparable para el Δ%: una celda en blanco dice "no hay
  // comparación", un 0.0% diría "no creció", que es otra cosa.
  const rows: (string | number | null)[][] = [];
  for (const e of data.empresas) {
    const monthValues = monthsWithData.map(i => Number(e.ventas2026[i] ?? 0));
    const total = monthValues.reduce((s, v) => s + v, 0);
    if (total === 0) continue;
    // Prev YTD recortado per-empresa: la RPC ya devolvió ventas2025[mes] con
    // el cutoff aplicado y null para meses posteriores al en curso. Summing
    // con null→0 da el YTD ajustado.
    const prevYtd = e.ventas2025.reduce<number>((s, v) => s + (v ?? 0), 0);
    // null (no 0): sin base comparable la celda del Excel queda VACÍA. Un
    // "0.0%" ahí se lee como "no creció", que es una afirmación falsa.
    const delta = variacionPct(total, prevYtd);
    rows.push([e.empresa.nombre, ...monthValues, total, e.margenPct, prevYtd, delta]);
  }

  // Fila TOTAL (banda PRI)
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
  const grandDelta = variacionPct(grandTotal, grandPrevYtd);

  return buildReportSheet({
    columns: [
      { header: "Empresa", wch: 24 },
      ...periodLabels.map(l => ({ header: l, wch: 14, align: "right" as const, fmt: MONEY_FMT })),
      { header: "Total", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Margen%", wch: 10, align: "right", fmt: PCT_FMT },
      { header: prevYtdLabel, wch: 22, align: "right", fmt: MONEY_FMT },
      { header: deltaLabel, wch: 12, align: "right", fmt: PCT_FMT },
    ],
    rows,
    totals: ["TOTAL", ...totalsByMonth, grandTotal, grandMargen, grandPrevYtd, grandDelta],
  });
}

export async function exportResumenToExcel(data: VentasResumen): Promise<void> {
  const ws = await buildResumenSheet(data);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(workbookFromSheets([{ name: "Ventas", ws }]), `ventas-${data.year}.xlsx`);
}
