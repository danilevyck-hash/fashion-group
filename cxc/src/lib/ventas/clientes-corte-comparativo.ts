// ─────────────────────────────────────────────────────────────────────────────
// Ventas › Clientes — hasta qué día se suma el AÑO ANTERIOR en «vs 2025».
//
// Espejo en TS de la regla que vive en SQL (`clientes_empresa_12m_vw` y
// `clientes_anio()`, migración `20260909120000_clientes_vs_anio_anterior_
// mismos_dias.sql`). jsdom no ejecuta Postgres: esta función es la referencia
// con la que el candado fija la regla con fechas fijas, y la que usa el script
// de medición contra producción. Si el SQL y esto dicen cosas distintas, el que
// está mal es el que se apartó de la regla.
//
// 🩸 LA REGLA: **un período empezado se compara contra los MISMOS DÍAS del año
// pasado.** Es la de Multifashion (`rangoComparativo`), la de Ventas ›
// Productos (`productosRangoComparativo`) y la del resumen diario de ACS
// (`ventanasResumen`). La vista de Clientes cortaba el año anterior por MES
// (`mes <= max_mes` = hasta FIN del mes en curso): el 2-sep-2026 comparaba ocho
// meses y dos días contra nueve, y Multi Fashion Holding se veía +3% cuando
// crecía +36%.
//
//   corte      = el último día con ventas cargadas del año en curso,
//                nunca después de HOY en Panamá
//   cortePrev  = la misma fecha, un año antes (29-feb → 28-feb)
//
// · «Último día cargado» y no «hoy» porque la vista es MATERIALIZADA y se
//   refresca a las 02:35 de Panamá: a esa hora el año en curso llega hasta ayer,
//   y cortar el año pasado en «hoy» le regalaría un día. Si el sync se atrasa,
//   las dos ventanas se acortan JUNTAS. Es el mismo criterio de Resumen en esta
//   misma pantalla (`fecha_corte` = MAX(fecha) del mes en curso).
// · Con tope en HOY para que una factura con fecha futura no corra el corte.
// · HOY es el día de PANAMÁ (UTC−5 fijo): entre las 7 p.m. y la medianoche el
//   reloj UTC ya está en mañana.
// ─────────────────────────────────────────────────────────────────────────────

import { hoyPanama } from "@/lib/fecha-panama";
import { unAnioAntes } from "@/lib/multifashion/productos-ranking";

export interface CorteComparativo {
  /** Último día que entra en «Compras <año>» (YYYY-MM-DD, día de Panamá). */
  corte: string;
  /** Hasta dónde se suma el año anterior: la misma fecha, un año antes. */
  cortePrev: string;
}

/**
 * @param ultimaVentaCargada  MAX(fecha) del año en curso ya en día de Panamá
 *                            (`fechaPanamaDe`), o null si todavía no hay ventas.
 * @param ahora               El instante del refresh. Nunca `new Date()` adentro.
 */
export function corteVsAnioAnterior(ultimaVentaCargada: string | null, ahora: Date): CorteComparativo {
  const hoy = hoyPanama(ahora);
  const corte = ultimaVentaCargada && ultimaVentaCargada < hoy ? ultimaVentaCargada : hoy;
  return { corte, cortePrev: unAnioAntes(corte) };
}
