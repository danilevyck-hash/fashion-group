// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DEL RANKING DE VENDEDORAS (23-sep-2026) — solo en MES CERRADO.
//
// Daniel aprobó el botón «Excel · al cerrar el mes» en el mockup. Sale por el
// camino de la casa: `buildReportSheet` (encabezados en la fila 1, filtro desde
// A1) y `workbookBytes`/`workbookBlob` (panel fijo). Un ranking de un mes que
// no cerró cambia mañana: no se baja.
//
// Las columnas son las de la tabla, con la Δ ya como fracción para que Excel la
// muestre en %.
//
// 🔁 1-oct-2026 (Daniel, «sí» al mockup del total con bonos): columna «Bono» y
// «Total a pagar» por vendedora o gerente, y la fila final «Total a pagar» =
// comisión + bono, con la MISMA función que la barra de la pantalla
// (`totalAPagarMultifashion`). Solo Multifashion.
// ─────────────────────────────────────────────────────────────────────────────

import type { BonosMultifashion, VendedoraDetalle } from "@/components/ventas/types";
import { bonoDeFila, totalAPagarMultifashion, totalDeFila } from "./bono-linea";
import {
  MONEY_FMT, PCT_FMT, buildReportSheet, exportFilename, filtroDesdeA1, workbookFromSheets,
} from "@/lib/excel-export";
import { variacionPctDesdeRatio } from "@/lib/variacion";
import { nombreEnPantalla } from "./nombres";
import type { DeltaAnioPasado } from "./vendedoras-vs-anio";

export interface EntradaExcelVendedoras {
  filas: readonly VendedoraDetalle[];
  /** «Agosto 2026» — el período, con todas las letras. */
  periodo: string;
  /** El rótulo de la columna Δ («Δ vs julio 2026»). */
  rotuloDelta: string;
  /** Los bonos del mes (`multifashion_bonos_v5`); `null` = sin bonos. */
  bonos?: BonosMultifashion | null;
  /** 🔴 2-oct-2026: la Δ contra el MISMO MES DEL AÑO PASADO, la misma de la
   *  pantalla («Nueva» = no vendió ese mes). Sin esto, la Δ de la RPC. */
  deltas?: ReadonlyMap<string, DeltaAnioPasado>;
}

const COLUMNAS = (rotuloDelta: string) => [
  { header: "#", wch: 5, align: "right" as const },
  { header: "Vendedora", wch: 28 },
  { header: "Tickets", wch: 10, align: "right" as const },
  { header: "Ventas", wch: 14, align: "right" as const, fmt: MONEY_FMT },
  { header: "Ticket promedio", wch: 13, align: "right" as const, fmt: MONEY_FMT },
  { header: rotuloDelta, wch: 16, align: "right" as const, fmt: PCT_FMT },
  { header: "Comisión", wch: 12, align: "right" as const, fmt: MONEY_FMT },
  { header: "Bono", wch: 10, align: "right" as const, fmt: MONEY_FMT },
  { header: "Total a pagar", wch: 14, align: "right" as const, fmt: MONEY_FMT },
];

function deltaDeFila(v: VendedoraDetalle, deltas?: ReadonlyMap<string, DeltaAnioPasado>): string | number | null {
  const d = deltas?.get(v.nombre);
  if (!d) return variacionPctDesdeRatio(v.ventas, v.delta_ventas_pct);
  return d.tipo === "nueva" ? "Nueva" : d.ratio;
}

/** Las filas del Excel, en el MISMO orden en que se ven. Puro. */
export function filasExcelVendedoras(
  filas: readonly VendedoraDetalle[],
  bonos: BonosMultifashion | null = null,
  deltas?: ReadonlyMap<string, DeltaAnioPasado>,
): (string | number | null)[][] {
  return filas.map((v, i) => {
    const bono = bonoDeFila(v, bonos);
    return [
      i + 1,
      nombreEnPantalla(v.nombre) + (v.manager ? " (gerente)" : ""),
      v.tickets,
      v.ventas,
      v.ticket_promedio,
      deltaDeFila(v, deltas),
      v.comision,
      bono,
      totalDeFila(v, bonos),
    ];
  });
}

export function libroVendedoras(e: EntradaExcelVendedoras) {
  const columns = COLUMNAS(e.rotuloDelta);
  const rows = filasExcelVendedoras(e.filas, e.bonos ?? null, e.deltas);
  const pagar = totalAPagarMultifashion(e.filas, e.bonos);
  const ws = buildReportSheet({
    columns,
    rows,
    totals: [
      null, "Total a pagar",
      e.filas.reduce((s, v) => s + v.tickets, 0),
      e.filas.reduce((s, v) => s + v.ventas, 0),
      null, null,
      pagar.comisiones,
      pagar.bonos,
      pagar.total,
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
