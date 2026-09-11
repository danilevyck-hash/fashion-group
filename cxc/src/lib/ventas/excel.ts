// Excel export para el tab Resumen de /ventas.
// Estilo de la casa (src/lib/excel-export.ts): headers navy, zebra, fila TOTAL
// en banda PRI. Moneda MONEY_FMT y % PCT_FMT como números reales.
//
// 🔴 BAJA LO QUE ESTÁ EN PANTALLA (11-sep-2026). Recibe el MODO de la matriz:
//   · `ventas`   — Empresa | meses (venta) | Total | Margen% | YTD prev | Δ %.
//                  BYTE A BYTE el archivo de siempre.
//   · `utilidad` — Empresa | meses (utilidad) | Total utilidad | Margen% |
//                  Utilidad YTD prev | Δ %. Es lo que se ve en el modo Utilidad
//                  (la utilidad de cada mes con su margen).
// Antes bajaba SIEMPRE la matriz de ventas, estuvieras donde estuvieras.

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

export type ModoExcelResumen = "ventas" | "utilidad";

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildResumenSheet(data: VentasResumen, modo: ModoExcelResumen = "ventas"): Promise<WorkSheet> {
  if (modo === "utilidad") return buildUtilidadSheet(data);
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

/**
 * La matriz en modo UTILIDAD: la utilidad de cada mes (en el mes en curso, hasta
 * el último día con costo — la MISMA serie que la pantalla), el total del año,
 * el margen del año y el comparativo. Sin la fila de una empresa que no vendió.
 */
async function buildUtilidadSheet(data: VentasResumen): Promise<WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");
  const prevYear = data.year - 1;

  const monthsWithData: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (data.empresas.some(e => e.ventas2026[i] != null)) monthsWithData.push(i);
  }
  if (monthsWithData.length === 0) {
    for (let i = 0; i < 12; i++) monthsWithData.push(i);
  }

  const periodLabels = monthsWithData.map(i => `${MONTHS[i]} ${data.year}`);
  const sum = (a: readonly (number | null)[]) => a.reduce<number>((s, v) => s + (v ?? 0), 0);
  const rows: (string | number | null)[][] = [];
  for (const e of data.empresas) {
    if (sum(e.ventas2026) === 0) continue;
    const monthValues = monthsWithData.map(i => Number(e.utilidad2026[i] ?? 0));
    const total = monthValues.reduce((s, v) => s + v, 0);
    const prevYtd = sum(e.utilidad2025);
    rows.push([e.empresa.nombre, ...monthValues, total, e.margenPct, prevYtd, variacionPct(total, prevYtd)]);
  }

  const totalsByMonth = monthsWithData.map(i =>
    data.empresas.reduce((s, e) => s + Number(e.utilidad2026[i] ?? 0), 0)
  );
  const grandTotal = totalsByMonth.reduce((s, v) => s + v, 0);
  const grandPrev = data.empresas.reduce((s, e) => s + sum(e.utilidad2025), 0);

  return buildReportSheet({
    columns: [
      { header: "Empresa", wch: 24 },
      ...periodLabels.map(l => ({ header: l, wch: 14, align: "right" as const, fmt: MONEY_FMT })),
      { header: "Utilidad", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Margen%", wch: 10, align: "right", fmt: PCT_FMT },
      { header: `Utilidad ${prevYtdColumnLabel(data, prevYear)}`, wch: 26, align: "right", fmt: MONEY_FMT },
      { header: `Δ vs ${prevYear} %`, wch: 12, align: "right", fmt: PCT_FMT },
    ],
    rows,
    totals: ["TOTAL", ...totalsByMonth, grandTotal, data.kpis.margenYTD, grandPrev, variacionPct(grandTotal, grandPrev)],
  });
}

export async function exportResumenToExcel(data: VentasResumen, modo: ModoExcelResumen = "ventas"): Promise<void> {
  const ws = await buildResumenSheet(data, modo);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([{ name: modo === "utilidad" ? "Utilidad" : "Ventas", ws }]),
    `ventas-${modo === "utilidad" ? "utilidad-" : ""}${data.year}.xlsx`,
  );
}
