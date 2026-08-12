/**
 * Piezas por bulto de Calvin Klein.
 *
 * Mismo caso que Tommy (las dos son marcas PVH y la mercancía viaja igual):
 * los bultos vienen de 8 o de 12, la mayoría de 12, y el dato NO se puede
 * deducir de ninguna fuente — medido contra producción el 12-ago-2026 sobre
 * los 616 artículos de vistana con marcaId 8 (CK FOOTWEAR): `cantidadPorCaja`
 * viene en 0.0000 en TODOS. Por eso se guarda por producto
 * (`calvin_products.bulto_pzas`) y se marca a mano desde administrar,
 * exactamente como `tommy_products.bulto_pzas`.
 *
 * El default es 12 y eso importa: la columna nace vacía, así que mientras
 * nadie marque nada el catálogo se comporta como si todo fuera de 12
 * (decisión de Daniel, textual: "8 o 12 como tommy pero 12 por default").
 * Solo hay que tocar los de 8.
 */

export const BULTO_CALVIN_DEFAULT = 12;

/** Tope del CHECK de `calvin_products.bulto_pzas` (migración 20260812150000). */
export const BULTO_CALVIN_MAX = 99;

/**
 * Piezas por bulto de un producto.
 *
 * @param _category  se ignora — en Calvin todo es calzado. Se conserva por la
 *                   firma común de las marcas (Reebok sí ramifica por acá).
 * @param bultoPzas  lo guardado en `calvin_products.bulto_pzas`. Vacío = 12.
 */
export function getBultoSize(_category?: string | null, bultoPzas?: number | null): number {
  return normalizarBultoPzas(bultoPzas) ?? BULTO_CALVIN_DEFAULT;
}

/**
 * Deja pasar solo un entero 1..99; cualquier otra cosa vuelve `null` (= usar el
 * default).
 *
 * 🩸 Es la misma trampa que costó el divisor del depurador: si el llamador hace
 * `Number(body.x)` antes de validar, `null`, `""` y `[]` llegan convertidos en
 * **0** y un 0 dividiendo revienta el cálculo del pedido. Por eso la conversión
 * la hace esta función y no quien la llama.
 */
export function normalizarBultoPzas(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  const entero = Math.trunc(n);
  if (entero !== n) return null;
  if (entero < 1 || entero > BULTO_CALVIN_MAX) return null;
  return entero;
}
