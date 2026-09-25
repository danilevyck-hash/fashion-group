// ─────────────────────────────────────────────────────────────────────────────
// EL REDISEÑO DE REFERENCIA (25-sep-2026) — el interruptor y sus palabras.
// Módulo PURO: sin React, sin Supabase, sin imports del resto del módulo (lo
// importa `referencia.ts`, así que nada de acá puede importar de allá).
//
// 🔴 QUÉ PRENDE `REFERENCIA_2026_09`:
//   1. Agrupar por modelo quitando los ÚLTIMOS 3 CARACTERES, sean letra o
//      número. Daniel, textual: *«los últimos 3 dígitos, letra o número, es el
//      color, pasa igual con las otras marcas»*. Apagado = los 3 DÍGITOS de
//      siempre, que es lo que hay hoy en producción.
//   2. La tarjeta del MODELO (la suma de sus colores), que hoy no existe: hoy
//      solo hay tarjeta por COLOR.
//   3. Un renglón por color debajo, ordenado por STOCK de mayor a menor, con
//      los que no tienen mercancía plegados al final.
//   4. El buscador corto y pegajoso, con «Actualizar datos de Switch» y
//      «Descargar Excel» adentro del «···».
//
// 🔴 NINGÚN NÚMERO CAMBIA DE CUENTA. Compré · Vendí · Stock · % vendido · FOB ·
// margen salen de los MISMOS módulos de siempre (`compras.ts`,
// `resumen-articulo.ts`, `referencia-info.ts`). Lo que cambia es dónde se ven,
// cómo se llaman y qué queda detrás de «Más info». Hay candado que compara las
// seis cifras de `NB2570001` con el interruptor prendido y apagado.
//
// ⚠️ LO MEDIDO ANTES DE TOCAR `modeloDe` (25-sep-2026, contra producción,
// `switch_articulo_info`, códigos distintos por empresa):
//
//   empresa         códigos   modelos hoy (3 dígitos)   modelos nuevos (3 car.)
//   vistana           8.309       5.335  (agrupa 36 %)      3.490  (agrupa 58 %)
//   fashion_wear      5.130       4.820  (agrupa  6 %)      2.573  (agrupa 50 %)
//   fashion_shoes       731         680  (agrupa  7 %)        455  (agrupa 38 %)
//   active_shoes      1.763         153  (agrupa 91 %)        153  (agrupa 91 %)
//   active_wear         597         251  (agrupa 58 %)        179  (agrupa 70 %)
//   joystep             207         207  (agrupa  0 %)         62  (agrupa 70 %)
//
// 🔑 Reebok (`active_shoes`) NO se mueve ni un modelo: sus códigos ya terminan
// en 3 dígitos. Joybees (`joystep`, códigos `PZ3PK.JOY.COOL`) pasa de 0 % a
// 70 % de agrupado y **no junta dos modelos distintos**: las descripciones que
// caen en un mismo grupo son colecciones del MISMO empaque (`POPINZ 3 PACK
// HAZY MAGIC` con `POPINZ 3 PACK HALLOWEEN COLLECTION`). Por eso NO se le
// escribió una regla propia por empresa: agrupa de menos, nunca de más.
// ─────────────────────────────────────────────────────────────────────────────

/** El interruptor. `false` = la pantalla de Referencia de hoy, intacta. */
export const REFERENCIA_2026_09 = true;

/** El color son los ÚLTIMOS 3 caracteres del código, letra o número. */
export const LARGO_COLOR = 3;

/**
 * Los rótulos del oficio. Daniel: *«los rótulos del oficio: Compré · Vendí ·
 * Stock · % vendido»*.
 *
 * 🔴 «Queda» NO aparece en ninguna cabecera de la pantalla: la palabra del
 * negocio es **Stock**, y la que dice cuánto se movió es **% vendido**.
 */
export const ROTULOS = {
  comprado: "Compré",
  vendido: "Vendí",
  stock: "Stock",
  pctVendido: "% vendido",
  llegada: "Llegada",
  piezas: "Piezas",
  ochenta: "El 80 % en",
  queda: "Queda",
  color: "Color",
  ultimaLlegada: "Última llegada",
} as const;

/** El buscador vacío: placeholder corto y UNA línea de ayuda. */
export const PLACEHOLDER_BUSCADOR = "Código o modelo";
export const AYUDA_BUSCADOR =
  "Un modelo trae todos sus colores; también puedes pegar varios códigos juntos.";

/** Qué se está mirando, decidido por lo que se buscó y por lo que volvió. */
export type ModoReferencia = "modelo" | "color" | "varios" | "nada";

/**
 * 🔴 LA PANTALLA DECIDE SOLA POR LO QUE SE BUSCÓ.
 *
 *   · 2 o más códigos pegados        → «varios» (el modo pedido de siempre).
 *   · lo buscado ES un código exacto → «color» (una fila y su tarjeta).
 *   · cualquier otra cosa con filas  → «modelo» (la tarjeta del modelo + sus
 *                                       colores).
 *
 * El pareo del código exacto es por IGUALDAD normalizada (mayúsculas, sin
 * espacios), nunca por parecido: `NB2570` y `NB2570001` son dos búsquedas
 * distintas y tienen que dibujar dos pantallas distintas.
 */
export function modoDeBusqueda(
  codigosPegados: readonly string[],
  codigosHallados: readonly string[],
): ModoReferencia {
  if (codigosHallados.length === 0) return "nada";
  if (codigosPegados.length >= 2) return "varios";
  const pedido = (codigosPegados[0] ?? "").trim().toUpperCase();
  if (!pedido) return "nada";
  return codigosHallados.some((c) => c.toUpperCase() === pedido) ? "color" : "modelo";
}
