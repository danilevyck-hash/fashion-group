// ─────────────────────────────────────────────────────────────────────────────
// LOS TRES BOTONES DE DESCARGA DE VENTAS (11-sep-2026).
// (módulo PURO salvo `anotarDescarga`, que manda un POST y nunca falla hacia
// afuera)
//
// 🔴 DICEN «Descargar en Excel», los tres. Decían «Excel» a secas; el
// diccionario de la casa dice «Descargar» (medido: el sistema lo decía bien 23
// veces contra 5 formas raras; Daniel, 6-sep-2026: *«descargar, no bajar, como
// esté en todos los módulos»*).
//
// 🔴 BAJAN LO QUE ESTÁ EN PANTALLA. El del Resumen bajaba SIEMPRE la matriz de
// Ventas mensual, estuvieras en Utilidad, Margen %, Trimestral o Anual. Ahora
// baja la vista y el modo elegidos (`excel.ts` recibe el modo). Clientes y
// Productos ya lo hacían.
//
// 🔴 Y DEJAN RASTRO en `activity_logs` (`descarga_excel`, módulo `ventas`), como
// ya lo hacen Tallas y Fotos a mi Excel de Plantilla Switch. Medido el
// 11-sep-2026: de Ventas no había NI UNA fila en 90 días — el módulo no
// anotaba nada, así que no se podía saber qué pestaña se usa. Daniel: «sí».
// ─────────────────────────────────────────────────────────────────────────────

import { logActivityClient } from "@/lib/logActivityClient";

export const ROTULO_DESCARGAR_EXCEL = "Descargar en Excel";

/** La acción que se anota. Una sola para las tres pestañas; el detalle dice cuál. */
export const ACCION_DESCARGA_EXCEL = "descarga_excel";
export const MODULO_ACTIVIDAD_VENTAS = "ventas";

export type PestanaDescarga = "resumen" | "clientes" | "productos";

/**
 * Anota la descarga. Nunca frena la descarga: `logActivityClient` traga el
 * error de red por diseño.
 */
export function anotarDescarga(
  pestana: PestanaDescarga,
  detalle: Record<string, string | number | boolean | null | undefined> = {},
): void {
  logActivityClient({
    action: ACCION_DESCARGA_EXCEL,
    module: MODULO_ACTIVIDAD_VENTAS,
    details: { pestana, ...detalle },
  });
}
