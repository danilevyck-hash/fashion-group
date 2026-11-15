// ─────────────────────────────────────────────────────────────────────────────
// PIEZAS POR BULTO DE REEBOK.
//
// 🔴 ROPA EN BULTOS DE 12 (15-nov-2026, reebok-cat-05, interruptor
// `REEBOK_ROPA_EN_12_2026_11`). Daniel: toda la ropa —medias incluidas— va de
// 12; los accesorios (gorras, bolsos, todo «accessories») se quedan en 6.
//
// 💸 LO VIEJO NO SE MUEVE. Hasta hoy la regla era «calzado 12, todo lo demás
// 6», y con ella están pedidos 18 pedidos con ropa y accesorios por $42.360.
// Recalcularlos con la regla nueva los volvería $84.720. Por eso el bulto
// queda ESCRITO en cada renglón (`reebok_order_items.bulto_pzas`) desde que
// existe la columna, y un renglón SIN bulto escrito —todos los viejos— se
// lee con la regla VIEJA de `getBultoSize`. Mismo patrón que Tommy (TOM-003):
// lo que ya viene en el renglón manda.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 PRENDIDO. `false` = la ropa nueva sigue saliendo de 6, como antes. Solo
 *  actúa cuando la columna `bulto_pzas` existe (ver `bulto-renglon-reebok.ts`):
 *  sin la migración todo sigue exactamente como hoy. */
export const REEBOK_ROPA_EN_12_2026_11 = true;

/** Un número de piezas por bulto válido (1..99), o null. */
export function bultoValido(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  return n != null && Number.isInteger(v) && v >= 1 && v <= 99 ? v : null;
}

/**
 * Piezas por bulto de un renglón o un producto.
 *
 * `bultoPzas` (el escrito en el renglón, o el que el servidor le pone al
 * producto del catálogo) MANDA. Sin él, la regla HISTÓRICA: calzado 12, todo
 * lo demás 6 — la que valía cuando se pidió cada renglón viejo.
 */
export function getBultoSize(category: string, bultoPzas?: number | null): number {
  const escrito = bultoValido(bultoPzas);
  if (escrito != null) return escrito;
  return category === "footwear" ? 12 : 6;
}

/**
 * La regla de HOY, para renglones NUEVOS: calzado 12, ropa 12 (con el
 * interruptor), accesorios y lo que no tenga categoría conocida 6 — nunca se
 * infla el cobro adivinando.
 */
export function bultoReebokNuevo(category: string | null | undefined): number {
  if (category === "footwear") return 12;
  if (REEBOK_ROPA_EN_12_2026_11 && category === "apparel") return 12;
  return 6;
}
