/**
 * Piezas por bulto de Tommy Hilfiger.
 *
 * 🩸 ANTES ERA 12 FIJO PARA TODO, Y NO ES CIERTO. Daniel: *"hay aveces que los
 * bultos son de 8 y otros de 12, la mayorria son de 12"*, con un ejemplo suyo:
 * `FM0FM05637YBS` es de 8. Con 12 fijo, el cliente pedía "1 bulto" creyendo que
 * recibía 12 pares y el pedido salía a Switch con 12 piezas cuando eran 8 —
 * plata mal contada en las dos puntas.
 *
 * ⚠️ NO SE PUEDE DEDUCIR: el dato no existe en ninguna fuente. Medido contra
 * producción el 6-ago-2026, las cuatro que podían tenerlo están vacías —
 * `cantidadPorCaja` en 0.0000 en los 650 artículos, `talla`/`color` vacíos en
 * los 650, `/apiarticulos/tallacolor` devuelve `[]`, y `packing_lists` tiene 0
 * filas. Y Daniel confirmó que es **estilo por estilo**, sin regla por género
 * ni por categoría. Por eso se guarda: no hay de dónde calcularlo.
 *
 * El default sigue siendo 12 y eso importa: la columna nace vacía, así que
 * mientras nadie marque nada el catálogo se comporta exactamente igual que
 * antes. Solo hay que tocar los de 8.
 */

export const BULTO_TOMMY_DEFAULT = 12;

/** Tope del CHECK de `tommy_products.bulto_pzas` (migración 20260806120000). */
export const BULTO_TOMMY_MAX = 99;

/**
 * Piezas por bulto de un producto.
 *
 * @param _category  se ignora — en Tommy todo es calzado. Se conserva por la
 *                   firma común de las 3 marcas (Reebok sí ramifica por acá).
 * @param bultoPzas  lo guardado en `tommy_products.bulto_pzas`. Vacío = 12.
 */
export function getBultoSize(_category?: string | null, bultoPzas?: number | null): number {
  return normalizarBultoPzas(bultoPzas) ?? BULTO_TOMMY_DEFAULT;
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
  if (entero < 1 || entero > BULTO_TOMMY_MAX) return null;
  return entero;
}
