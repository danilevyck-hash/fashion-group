// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DEL RANKING DE VENDEDORAS (23-sep-2026) — solo en MES CERRADO.
//
// Daniel aprobó el botón «Excel · al cerrar el mes» en el mockup. Sale por el
// camino de la casa: `buildReportSheet` (encabezados en la fila 1, filtro desde
// A1) y `workbookBytes`/`workbookBlob` (panel fijo). Un ranking de un mes que
// no cerró cambia mañana: no se baja.
//
// Las columnas son las de la tabla, sin «Bono» (que es una línea aparte) y con
// la Δ ya como fracción para que Excel la muestre en %.
// ─────────────────────────────────────────────────────────────────────────────

import type { VendedoraDetalle } from "@/components/ventas/types";
import {
  MONEY_FMT, PCT_FMT, buildReportSheet, exportFilename, filtroDesdeA1, workbookFromSheets,
} from "@/lib/excel-export";
import { variacionPctDesdeRatio } from "@/lib/variacion";
import { nombreEnPantalla } from "./nombres";

export interface EntradaExcelVendedoras {
  filas: readonly VendedoraDetalle[];
  /** «Agosto 2026» — el período, con todas las letras. */
  periodo: string;
  /** El rótulo de la columna Δ («Δ vs julio 2026»). */
  rotuloDelta: string;
}

const COLUMNAS = (rotuloDelta: string) => [
  { header: "#", wch: 5, align: "right" as const },
  { header: "Vendedora", wch: 28 },
  { header: "Tickets", wch: 10, align: "right" as const },
  { header: "Ventas", wch: 14, align: "right" as const, fmt: MONEY_FMT },
  { header: "Ticket prom.", wch: 13, align: "right" as const, fmt: MONEY_FMT },
  { header: rotuloDelta, wch: 16, align: "right" as const, fmt: PCT_FMT },
  { header: "Comisión", wch: 12, align: "right" as const, fmt: MONEY_FMT },
];

/** Las filas del Excel, en el MISMO orden en que se ven. Puro. */
export function filasExcelVendedoras(filas: readonly VendedoraDetalle[]): (string | number | null)[][] {
  return filas.map((v, i) => [
    i + 1,
    nombreEnPantalla(v.nombre) + (v.manager ? " (gerente)" : ""),
    v.tickets,
    v.ventas,
    v.ticket_promedio,
    variacionPctDesdeRatio(v.ventas, v.delta_ventas_pct),
    v.comision,
  ]);
}

export function libroVendedoras(e: EntradaExcelVendedoras) {
  const columns = COLUMNAS(e.rotuloDelta);
  const rows = filasExcelVendedoras(e.filas);
  const ws = buildReportSheet({
    columns,
    rows,
    totals: [
      null, "Total",
      e.filas.reduce((s, v) => s + v.tickets, 0),
      e.filas.reduce((s, v) => s + v.ventas, 0),
      null, null,
      e.filas.reduce((s, v) => s + v.comision, 0),
    ],
  });
  // El filtro desde A1 es la regla de la casa; `buildReportSheet` ya lo pone y
  // aquí se reafirma sobre la misma tabla (encabezados + filas).
  ws["!autofilter"] = { ref: filtroDesdeA1([columns.map((c) => c.header), ...rows]) };
  return workbookFromSheets([{ name: "Vendedoras", ws }]);
}

/** «vendedoras-multifashion-agosto-2026-2026-09-23.xlsx». */
export function nombreArchivoVendedoras(periodo: string): string {
  const slug = periodo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
  return exportFilename(`vendedoras-multifashion-${slug}`);
}
