// Export Excel de la vista múltiple del tab "Referencia" (/ventas).
// Estilo de la casa: src/lib/excel-export.ts (regla del repo — exports nuevos
// van por ahí). Construcción del sheet PURA (sin DOM) — testeable.

import type { ReferenciaStats } from "./referencia";

/** Una fila de la vista múltiple ya calculada (o no encontrada: stats null). */
export interface FilaMultiExcel {
  codigo: string;
  descripcion: string;
  empresa: string;
  stats: ReferenciaStats | null;
  /** Existencia actual del catálogo (switch_articulo_info); null/ausente = sin dato. */
  existencia?: number | null;
}

export function estadoTexto(stats: ReferenciaStats | null): string {
  if (!stats || stats.mesesActivos === 0) return "NUNCA VENDIDO";
  if (stats.seAgoto) return `SE AGOTÓ hace ${stats.mesesDesdeUltimaVenta} m`;
  return "ACTIVO";
}

export async function buildReferenciasSheet(
  filas: FilaMultiExcel[],
  hoyMes: string,
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT } = await import("@/lib/excel-export");
  const encontradas = filas.filter((f) => f.stats && f.stats.mesesActivos > 0).length;
  return buildReportSheet({
    title: "FASHION GROUP — Ventas por Referencia",
    subtitle: `${filas.length} referencias · ${encontradas} con ventas · corte ${hoyMes} · NC ya restadas`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 30 },
      { header: "Empresa", wch: 16 },
      { header: "3 m", wch: 8, align: "right", fmt: "#,##0" },
      { header: "6 m", wch: 8, align: "right", fmt: "#,##0" },
      { header: "12 m", wch: 8, align: "right", fmt: "#,##0" },
      { header: "u/mes real", wch: 11, align: "right", fmt: "#,##0.0" },
      { header: "Precio real", wch: 12, align: "right", fmt: MONEY_FMT },
      { header: "Existencia", wch: 11, align: "right", fmt: "#,##0" },
      { header: "Estado", wch: 20 },
    ],
    rows: filas.map((f) => [
      f.codigo,
      f.descripcion || "—",
      f.empresa || "—",
      f.stats ? f.stats.m3.unidades : null,
      f.stats ? f.stats.m6.unidades : null,
      f.stats ? f.stats.m12.unidades : null,
      f.stats?.uMesReal != null ? Number(f.stats.uMesReal.toFixed(1)) : null,
      f.stats?.precioReal != null ? Number(f.stats.precioReal.toFixed(2)) : null,
      f.existencia ?? null,
      estadoTexto(f.stats),
    ]),
  });
}

export async function exportReferenciasToExcel(filas: FilaMultiExcel[], hoyMes: string): Promise<void> {
  const ws = await buildReferenciasSheet(filas, hoyMes);
  const { workbookFromSheets, downloadWorkbook, exportFilename } = await import("@/lib/excel-export");
  downloadWorkbook(workbookFromSheets([{ name: "Referencias", ws }]), exportFilename("ventas-referencias"));
}
