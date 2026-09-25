// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS TRES PESTAÑAS EN UN SOLO EXCEL — la «6a» (25-sep-2026).
//
// 🩸 POR QUÉ EXISTE, medido en `activity_logs`: las **tres** descargas de
// Ventas que hay en toda la historia de la tabla son del **20-sep-2026, entre
// las 08:35 y las 08:36**, todas de Daniel, **una por pestaña, en 90 segundos**
// —Resumen, Clientes y Productos del mismo año, uno detrás de otro—. Es la
// huella de querer UN archivo y tener que hacer tres viajes.
// (⚠️ El contador solo empezó a grabar el 18-sep-2026: lo medido son 3
// descargas en 7 días, no en 90.)
//
// 🔴 NO HAY UN GENERADOR NUEVO. Este módulo llama a los TRES que ya existen
// —`buildResumenSheet`, `buildClientesSheet`, `buildProductosSheet`— y pega sus
// hojas en un mismo libro. Si el Excel de una pestaña cambia, este archivo
// cambia con ella sin tocarse: no hay una segunda definición de ninguna
// columna.
//
// 🔴 Y SALE POR `workbookBytes`, como TODO el sistema: fila 1, encabezados
// fijos y el filtro desde A1 los pone esa puerta, no este archivo.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkSheet } from "xlsx-js-style";
import type { VentasResumen } from "@/components/ventas/types";
import type { ModoExcelResumen } from "./excel";
import type { ClientesExcelOpts } from "./clientes-excel";
import type { ProductosResponse } from "./productos";

/** Los nombres de las tres hojas, en el orden de las pestañas. */
export const HOJAS_DE_LAS_TRES = ["Resumen", "Clientes", "Productos"] as const;

export interface LasTresPestanas {
  resumen: { data: VentasResumen; modo: ModoExcelResumen };
  /** `null` = la pestaña no tenía nada que bajar; su hoja no se dibuja. */
  clientes: ClientesExcelOpts | null;
  productos: { resp: ProductosResponse; cliente?: string } | null;
}

/** «Ventas-2026.xlsx» — el archivo de las tres. */
export function nombreDeLasTres(year: number): string {
  return `ventas-${year}.xlsx`;
}

/**
 * Las tres hojas, en el orden de las pestañas. Una pestaña sin datos no deja
 * una hoja vacía: se salta y se dice cuáles entraron.
 */
export async function hojasDeLasTresPestanas(
  todo: LasTresPestanas,
): Promise<{ name: string; ws: WorkSheet }[]> {
  const { buildResumenSheet } = await import("./excel");
  const { buildClientesSheet } = await import("./clientes-excel");
  const { buildProductosSheet } = await import("./productos");

  const hojas: { name: string; ws: WorkSheet }[] = [
    { name: HOJAS_DE_LAS_TRES[0], ws: await buildResumenSheet(todo.resumen.data, todo.resumen.modo) },
  ];
  if (todo.clientes) {
    hojas.push({ name: HOJAS_DE_LAS_TRES[1], ws: await buildClientesSheet(todo.clientes) });
  }
  if (todo.productos) {
    hojas.push({
      name: HOJAS_DE_LAS_TRES[2],
      ws: await buildProductosSheet(todo.productos.resp, todo.productos.cliente),
    });
  }
  return hojas;
}

/** Baja el libro de las tres pestañas, una hoja por pestaña. */
export async function descargarLasTresPestanas(todo: LasTresPestanas): Promise<void> {
  const hojas = await hojasDeLasTresPestanas(todo);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(workbookFromSheets(hojas), nombreDeLasTres(todo.resumen.data.year));
}
