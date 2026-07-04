// Workbook del export "Excel sin foto" del admin del catálogo Reebok.
// Estructura estándar del helper (I11) con el navy de marca Reebok
// (REEBOK_PALETTE). Función pura para poder testearla sin browser.

import type XLSX from "xlsx-js-style";
import {
  buildReportSheet,
  workbookFromSheets,
  REEBOK_PALETTE,
  fmtFechaExcel,
} from "@/lib/excel-export";

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
  return workbookFromSheets([{ name: "Sin foto", ws }]);
}
