// Workbook del export "Excel sin foto" del admin del catálogo Reebok.
//
// DOS hojas, y el orden importa:
//   1. "DASHBOARD DE BUSQUEDA" — réplica de la plantilla del banco de fotos B2B
//      (códigos en la columna B, ordenados A-Z). Va PRIMERA porque es la que
//      Daniel usa: se abre el archivo y ya está listo para el portal.
//   2. "Sin foto" — el reporte con descripción/categoría/stock de siempre. NO
//      se quitó: sirve para trabajar la cola de fotos.
//
// Función pura para poder testearla sin browser.

import type XLSX from "xlsx-js-style";
import {
  buildReportSheet,
  workbookFromSheets,
  REEBOK_PALETTE,
  fmtFechaExcel,
} from "@/lib/excel-export";
import { buildDashBusquedaSheets } from "@/lib/catalogos/dash-busqueda-excel";

export interface SinFotoRow {
  sku: string;
  nombre: string;
  categoria: string;
  disponible: number | "";
  existencia: number | "";
}

/** Construye el workbook de productos sin foto (hoja "Sin foto"). */
export function buildReebokSinFotoWorkbook(rows: SinFotoRow[]): XLSX.WorkBook {
  const ws = buildReportSheet({
    title: "REEBOK — Productos sin foto",
    subtitle: `${rows.length} producto${rows.length !== 1 ? "s" : ""} sin foto  ·  ${fmtFechaExcel(new Date().toISOString())}`,
    columns: [
      { header: "Código", wch: 16 },
      { header: "Descripción", wch: 40 },
      { header: "Categoría", wch: 14 },
      { header: "Disponible", wch: 12, align: "right", fmt: "0" },
      { header: "Existencia", wch: 12, align: "right", fmt: "0" },
    ],
    rows: rows.map((r) => [r.sku, r.nombre, r.categoria, r.disponible, r.existencia]),
    palette: REEBOK_PALETTE,
  });
  return workbookFromSheets([
    ...buildDashBusquedaSheets(rows.map((r) => r.sku)),
    { name: "Sin foto", ws },
  ]);
}
