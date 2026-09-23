// Utilidad real por cliente (tab Ventas). Fuente: switch_factura_utilidad
// (reporte web, la misma que Comisiones). Las NC se guardan negativas → un
// cliente puede tener utilidad/ventas netas NEGATIVAS (devoluciones > ventas):
// es un dato válido, no un error — la UI lo muestra en rojo con nota.
//
// 🔴 EL ALCANCE NO SE ESCRIBE A MANO. Cuántas empresas se están mirando llega
// en `empresas` (lo manda el route, derivado de `empresasConUtilidad()`), y de
// ahí salen el título del Excel y el ⓘ de la pantalla. Antes decía "5 empresas
// B2B" como texto fijo mientras la RPC llevaba las cinco escritas adentro del
// SQL, con `joystep` afuera: dos copias de la misma lista, y las dos mintiendo
// juntas. Ese olvido ya costó 15.262,00 de cobros invisibles.

import { EMPRESA_KEY_TO_NAME, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { fmtPorcentaje } from "@/lib/ventas/format";
import type { CuadreUtilidad } from "@/lib/ventas/una-sola-venta";

/** Las cinco que `utilidad_por_cliente(p_anio)` (v1) lleva escritas en su WHERE.
 *  Solo se usa para rotular la respuesta cuando la migración de la v2 todavía
 *  no corrió — NO es la lista del sistema: ésa se deriva y le falta `joystep`. */
export const EMPRESAS_UTILIDAD_V1: readonly string[] = [
  "vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear",
] as const;

/** "6 empresas B2B" / "1 empresa B2B" — el alcance dicho con el número REAL. */
export function alcanceEmpresas(empresas: readonly string[] | undefined): string {
  const n = empresas?.length ?? 0;
  return n === 1 ? "1 empresa B2B" : `${n} empresas B2B`;
}

export interface UtilidadClienteRow {
  clienteSwitchId: number | null;
  cliente: string;
  empresaKey: string;
  empresa: string;
  nDocs: number;
  /** 🔴 UNA SOLA VENTA (23-sep-2026): la venta ENTERA del cliente, la misma
   *  definición que el Resumen (el contado incluido). Antes era solo lo que el
   *  reporte de utilidad traía. */
  ventas: number;
  costo: number;        // Σ costo (neto)
  utilidad: number;     // Σ utilidad (neto)
  /** fracción utilidad ÷ ventas CON costo; null si no hay base. El contado no
   *  lo diluye: no se le conoce el costo. */
  margen: number | null;
  /** La parte de `ventas` que el reporte de utilidad cubre (con costo). */
  ventasConCosto?: number;
  /** La parte sin costo por cliente: el contado. */
  ventasSinCosto?: number;
  /** El código del cliente en Switch, si se supo. */
  codigo?: string | null;
  /** El mostrador (`TCKCTA`): se marca, y SUMA en el total (el Resumen lo suma). */
  mostrador?: boolean;
}

export interface UtilidadClienteResponse {
  year: number;
  /** Las empresas que la consulta miró de verdad. Derivada de
   *  `empresasConUtilidad()`; cae a las 5 de la v1 mientras la migración
   *  20260824180000 no esté corrida. */
  empresas: string[];
  totales: { ventas: number; costo: number; utilidad: number; margen: number | null };
  rows: UtilidadClienteRow[];
  /** 🔴 UNA SOLA VENTA: el cuadre contra el Resumen del mismo año y las mismas
   *  empresas, y cuánto del total es contado sin costo. `null` si el Resumen no
   *  se pudo leer. Ausente con el interruptor apagado. */
  cuadre?: CuadreUtilidad | null;
  /** Cuando el año pedido es anterior a la historia del reporte de utilidad
   *  (`switch_factura_utilidad` arranca en ene-2026): desde cuándo hay datos. */
  datosDesde?: string;
}

export function empresaNombre(key: string): string {
  return EMPRESA_KEY_TO_NAME[key] ?? key;
}

/**
 * Margen como fracción → "29%" / "−12%" / "—" si null.
 *
 * 🔴 SIN DECIMAL, y por `fmtPorcentaje` (diccionario § 0, #5, decidido por
 * Daniel el 5-sep-2026). Se llamaba `fmtMargen` y escribía su propio
 * `.toFixed(1)`; el módulo tenía DOS funciones con ese nombre —ésta y la de
 * `productos.ts`— que además redondeaban distinto del Resumen. El nombre
 * cambió a propósito: `fmtMargen` a secas es lo que hacía que las dos
 * convivieran sin que nadie lo notara.
 *
 * ⚠️ El Excel NO usa esto: ahí el margen viaja como NÚMERO real con formato
 * de celda (`PCT_FMT`), que es lo que permite ordenarlo y promediarlo en la
 * planilla. Un texto ya redondeado en un Excel es un número que no se puede
 * volver a sumar.
 */
export function fmtMargenPantalla(d: number | null | undefined): string {
  return fmtPorcentaje(d);
}

/** Dinero con signo claro: "$1,234.00" / "−$1,234.00". */
export function fmtMoneySigned(n: number): string {
  const sign = n < 0 ? "−" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Export Excel — todas las filas (no solo las visibles). Estilo de la casa
// (src/lib/excel-export.ts, hallazgo I11): encabezados navy en la fila 1 con
// filtro, zebra, fila TOTAL en banda PRI. Montos MONEY_FMT y margen PCT_FMT
// como números reales.

/**
 * Construcción pura del sheet (sin DOM) — testeable.
 *
 * 🔴 `filas` ES LO QUE SE ESTÁ VIENDO (5-sep-2026): con la búsqueda o una
 * empresa puestas, el archivo trae ESAS filas y su TOTAL, no las 209 de la
 * respuesta completa. Un Excel que ignora los filtros de la pantalla es un
 * archivo que no cuadra con lo que se acaba de mirar. Sin `filas` baja todo,
 * que es como se comportaba antes.
 */
export async function buildUtilidadSheet(
  resp: UtilidadClienteResponse,
  filas?: readonly UtilidadClienteRow[],
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");

  const usadas = filas ?? resp.rows;
  const completo = usadas.length === resp.rows.length;
  const totalDocs = usadas.reduce((s, r) => s + r.nDocs, 0);
  // Los totales se recalculan sobre lo exportado; con la lista completa se
  // usan los del servidor, que son la fuente de verdad y no se re-suman.
  const totVentas = completo ? resp.totales.ventas : usadas.reduce((s, r) => s + r.ventas, 0);
  const totCosto = completo ? resp.totales.costo : usadas.reduce((s, r) => s + r.costo, 0);
  const totUtil = completo ? resp.totales.utilidad : usadas.reduce((s, r) => s + r.utilidad, 0);
  const totMargen = completo ? resp.totales.margen : (totVentas > 0 ? totUtil / totVentas : null);

  return buildReportSheet({
    columns: [
      { header: "Cliente", wch: 34 },
      { header: "Empresa", wch: 20 },
      { header: "# Docs", wch: 8, align: "right", fmt: "#,##0" },
      { header: "Ventas", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Costo", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Utilidad", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Margen%", wch: 10, align: "right", fmt: PCT_FMT },
    ],
    // 🔴 `r.margen` VA TAL CUAL, sin `?? 0`. En pantalla un margen que no se
    // puede calcular (venta ≤ 0) se lee "—"; escribir 0,0% en el Excel lo
    // convierte en un margen REAL que se suma y se promedia con los demás y
    // baja el promedio sin que nadie lo note. `null` = celda VACÍA (lo soporta
    // `buildReportSheet`), que es lo que "—" significa.
    rows: usadas.map(r => [r.cliente, nombreCortoEmpresa(r.empresaKey), r.nDocs, r.ventas, r.costo, r.utilidad, r.margen]),
    totals: ["TOTAL", null, totalDocs, totVentas, totCosto, totUtil, totMargen],
  });
}

export async function exportUtilidadToExcel(
  resp: UtilidadClienteResponse,
  filas?: readonly UtilidadClienteRow[],
): Promise<void> {
  const ws = await buildUtilidadSheet(resp, filas);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([{ name: "Utilidad por cliente", ws }]),
    `utilidad-por-cliente-${resp.year}.xlsx`,
  );
}
