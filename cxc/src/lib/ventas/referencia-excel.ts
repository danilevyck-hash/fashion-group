// Export Excel de la vista múltiple del tab "Referencia" (/ventas).
// Estilo de la casa: src/lib/excel-export.ts (regla del repo — exports nuevos
// van por ahí). Construcción del sheet PURA (sin DOM) — testeable.
//
// 🔴 Costos: el CIF es dato REAL (el `costo` de la API, identificado 3/3);
// el FOB va SIEMPRE como "FOB est." (CIF ÷ 1+%imp) y el margen como
// "Margen s/FOB est." — las etiquetas viajan al Excel igual que a la pantalla.

import type { ReferenciaStats } from "./referencia";
import { fobEstimado, margenSobreFob, PCT_IMPORTACION_DEFAULT } from "./referencia-info";

/** Una fila de la vista múltiple ya calculada (o no encontrada: stats null). */
export interface FilaMultiExcel {
  codigo: string;
  descripcion: string;
  empresa: string;
  stats: ReferenciaStats | null;
  /** Existencia actual del catálogo (switch_articulo_info); null/ausente = sin dato. */
  existencia?: number | null;
  /** Costo CIF real del catálogo (costo_api). */
  costoCif?: number | null;
  /** Precio de etiqueta — respaldo del margen cuando no hubo ventas. */
  precioEtiqueta?: number | null;
  /** Cuántas tandas (períodos de venta continua) tuvo la referencia. */
  tandas?: number | null;
  /** u/mes de la ÚLTIMA tanda — el ritmo más reciente con mercancía. */
  uMesUltimaTanda?: number | null;
}

export function estadoTexto(stats: ReferenciaStats | null): string {
  if (!stats || stats.mesesActivos === 0) return "NUNCA VENDIDO";
  // Va ANTES del agotado: son excluyentes, y el descontinuado no se recompra.
  if (stats.descontinuado) return `DESCONTINUADO hace ${stats.mesesDesdeUltimaVenta} m`;
  if (stats.seAgoto) return `SE AGOTÓ hace ${stats.mesesDesdeUltimaVenta} m`;
  return "ACTIVO";
}

export async function buildReferenciasSheet(
  filas: FilaMultiExcel[],
  hoyMes: string,
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");
  const encontradas = filas.filter((f) => f.stats && f.stats.mesesActivos > 0).length;
  return buildReportSheet({
    title: "FASHION GROUP — Ventas por Referencia",
    subtitle: `${filas.length} referencias · ${encontradas} con ventas · corte ${hoyMes} · NC ya restadas · FOB y margen ESTIMADOS (CIF ÷ ${(1 + PCT_IMPORTACION_DEFAULT).toFixed(2)})`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 30 },
      { header: "Empresa", wch: 16 },
      { header: "Total vida", wch: 11, align: "right", fmt: "#,##0" },
      { header: "Tandas", wch: 8, align: "right", fmt: "#,##0" },
      { header: "u/mes últ. tanda", wch: 15, align: "right", fmt: "#,##0.0" },
      { header: "3 m", wch: 8, align: "right", fmt: "#,##0" },
      { header: "6 m", wch: 8, align: "right", fmt: "#,##0" },
      { header: "12 m", wch: 8, align: "right", fmt: "#,##0" },
      { header: "u/mes real", wch: 11, align: "right", fmt: "#,##0.0" },
      { header: "Precio real", wch: 12, align: "right", fmt: MONEY_FMT },
      { header: "Existencia", wch: 11, align: "right", fmt: "#,##0" },
      { header: "Costo CIF", wch: 11, align: "right", fmt: MONEY_FMT },
      { header: "FOB est.", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "Margen s/FOB est.", wch: 17, align: "right", fmt: PCT_FMT },
      { header: "Estado", wch: 24 },
    ],
    rows: filas.map((f) => {
      const fobEst = fobEstimado(f.costoCif ?? null);
      const margen = margenSobreFob(f.stats?.precioReal ?? f.precioEtiqueta ?? null, fobEst);
      return [
        f.codigo,
        f.descripcion || "—",
        f.empresa || "—",
        f.stats ? f.stats.unidadesNetas : null,
        f.tandas ?? null,
        f.uMesUltimaTanda != null ? Number(f.uMesUltimaTanda.toFixed(1)) : null,
        f.stats ? f.stats.m3.unidades : null,
        f.stats ? f.stats.m6.unidades : null,
        f.stats ? f.stats.m12.unidades : null,
        f.stats?.uMesReal != null ? Number(f.stats.uMesReal.toFixed(1)) : null,
        f.stats?.precioReal != null ? Number(f.stats.precioReal.toFixed(2)) : null,
        f.existencia ?? null,
        f.costoCif ?? null,
        fobEst != null ? Number(fobEst.toFixed(2)) : null,
        margen != null ? Number(margen.toFixed(4)) : null,
        estadoTexto(f.stats),
      ];
    }),
  });
}

export async function exportReferenciasToExcel(filas: FilaMultiExcel[], hoyMes: string): Promise<void> {
  const ws = await buildReferenciasSheet(filas, hoyMes);
  const { workbookFromSheets, downloadWorkbook, exportFilename } = await import("@/lib/excel-export");
  downloadWorkbook(workbookFromSheets([{ name: "Referencias", ws }]), exportFilename("ventas-referencias"));
}
