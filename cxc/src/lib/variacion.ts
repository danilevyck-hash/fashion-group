// LA regla única del porcentaje de variación (Δ%) de toda la app.
//
// Por qué existe este archivo (27-jul-2026):
// Daniel vio "+363024750%" en el histórico de Multifashion. No era una división
// por cero: mayo 2024 de la tienda vale **$0,01** — trece facturas de prueba del
// arranque que se cancelan entre sí y dejan un centavo neto. El guard que había
// era `prev > 0`, así que el centavo lo pasaba y (36.302,49 − 0,01) / 0,01
// devolvía 3.630.247,5.
//
// El guard correcto ya estaba escrito en el repo —`calcDeltaPct` de
// MultifashionResumenView cortaba en `comp.ventas < 100`— pero la cuenta estaba
// copiada a mano en siete archivos y solo uno tenía el corte. Mientras esté
// copiada vuelve a divergir, así que la cuenta vive acá y nadie más la escribe.
// El test `pct-variacion-una-sola-fuente.test.ts` falla si alguien la reescribe.
//
// La regla, en una frase: **si la base comparativa no llega a $100, no hay
// porcentaje** — se devuelve `null` y la pantalla pinta "n/a".
//
// El umbral NO es para esconder crecimientos grandes. Un cliente que pasó de
// $200 a $2.000 creció +900% de verdad y se tiene que ver: $200 ≥ $100, pasa.
// Corta solo bases ridículas (centavos, decenas) donde el % no significa nada.

/**
 * Base mínima, en dólares, para que un porcentaje de variación sea informativo.
 *
 * $100 no es un número nuevo: es el que ya usaban `calcDeltaPct` (Multifashion)
 * y `MARGEN_VENTAS_MIN` (`celda.ts`) desde antes de este archivo.
 */
export const BASE_MIN_COMPARATIVO = 100;

/**
 * ¿La base del período previo alcanza para calcular un % honesto?
 *
 * Cubre de una vez los tres casos malos: sin base (`null`), base negativa
 * (una utilidad en rojo invierte el signo del ratio) y base microscópica.
 */
export function baseComparable(prev: number | null | undefined): boolean {
  return prev != null && Number.isFinite(prev) && prev >= BASE_MIN_COMPARATIVO;
}

/**
 * Variación relativa entre el período actual y su comparativo.
 *
 * @returns ratio decimal (0.12 = +12%), o `null` cuando no hay comparación
 *          posible. `null` NUNCA significa "no cambió": la pantalla tiene que
 *          pintar "n/a", no "0%".
 */
export function variacionPct(
  cur: number | null | undefined,
  prev: number | null | undefined,
): number | null {
  if (cur == null || !Number.isFinite(cur)) return null;
  if (!baseComparable(prev)) return null;
  return (cur - prev!) / prev!;
}

/**
 * Misma regla, para los callers que reciben el % YA CALCULADO por una RPC y no
 * tienen la base a mano (`delta_ventas_pct` de vendedoras, `vs2025` del
 * histórico de Multifashion…).
 *
 * Las RPC cortan en `ventas_prev > 0`, que es el guard débil que dejó pasar el
 * centavo. Como el ratio y el valor actual determinan la base
 * (`prev = cur / (1 + pct)`), se recupera la base y se le aplica la MISMA regla.
 * Así no hace falta un DDL para tapar el agujero, y sigue habiendo un solo
 * umbral en toda la app.
 *
 * @param cur Valor del período actual (el numerador que usó la RPC).
 * @param pct Ratio que devolvió la RPC (0.12 = +12%).
 */
export function variacionPctDesdeRatio(
  cur: number | null | undefined,
  pct: number | null | undefined,
): number | null {
  const prev = baseDesdeRatio(cur, pct);
  if (!baseComparable(prev)) return null;
  return pct!;
}

/**
 * La base que implica un par (valor actual, ratio): `prev = cur / (1 + pct)`.
 *
 * Se expone aparte porque el histórico de Multifashion pinta esa base como la
 * columna del año anterior, y tiene que seguir mostrando el $0,01 real: puesto
 * al lado de un "n/a" el centavo EXPLICA por qué no hay porcentaje, mientras
 * que al lado de "+363024750%" era lo que lo hacía incomprensible.
 *
 * @returns `null` si no se puede despejar (sin ratio, o pct = −100%).
 */
export function baseDesdeRatio(
  cur: number | null | undefined,
  pct: number | null | undefined,
): number | null {
  if (cur == null || pct == null) return null;
  if (!Number.isFinite(cur) || !Number.isFinite(pct)) return null;
  const denom = 1 + pct;
  if (denom === 0) return null;
  const prev = cur / denom;
  return Number.isFinite(prev) ? prev : null;
}

/**
 * Lo que se pinta cuando no hay porcentaje. Una sola forma en toda la app:
 *
 *   "n/a" → hay un valor actual, pero la base no sirve para compararlo.
 *   "—"   → no hay ni siquiera valor actual (mes futuro, fila vacía).
 *
 * La diferencia importa: "n/a" le dice a Daniel "esto creció o bajó, pero no
 * hay contra qué medirlo"; "—" le dice "acá no pasó nada todavía". Ninguno de
 * los dos se puede confundir con "la variación fue cero".
 */
export const SIN_COMPARATIVO = "n/a";
export const SIN_DATO = "—";

/**
 * Texto del Δ% listo para pintar, con la regla ya aplicada.
 *
 * @param hayValorActual false cuando la fila ni siquiera tiene valor del
 *        período actual → "—" en vez de "n/a".
 */
export function fmtVariacionPct(
  pct: number | null,
  hayValorActual = true,
  decimales = 0,
): string {
  if (pct == null) return hayValorActual ? SIN_COMPARATIVO : SIN_DATO;
  return `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(decimales)}%`;
}
