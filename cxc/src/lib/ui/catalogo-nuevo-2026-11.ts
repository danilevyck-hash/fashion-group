// ─────────────────────────────────────────────────────────────────────────────
// Catálogos › distintivo «Nuevo» (22-nov-2026, aprobado por Daniel sobre el
// mockup «HOY vs RECOMENDACIÓN»). Calculado, no a mano: el artículo cuya PRIMERA
// llegada (switch_ingresos_mercancia) fue hace 30 días o menos. Regla en
// `lib/catalogo/distintivo-nuevo.ts`. `false` = el catálogo de antes.
// 🔴 Mismo día, Daniel: «quita lo de nuevo, mejor deja una bolita para yo saber,
// que el cliente no lo sepa» → SOLO el catálogo interno, con una bolita sin
// texto; el público no recibe el dato ni el filtro.
// ─────────────────────────────────────────────────────────────────────────────

export const DISTINTIVO_NUEVO = true;

/**
 * El filtro «Nuevo» de Catálogos (mismo día, Daniel): una opción más junto a
 * «2+ bultos». `hay` = el catálogo tiene al menos uno (sin eso la opción no se
 * dibuja; Joybees hoy no tiene); `activo` = el filtro corta de verdad.
 */
export function filtroNuevo(products: readonly { nuevo?: boolean }[], puesto: boolean) {
  const hay = DISTINTIVO_NUEVO && products.some((p) => p.nuevo === true);
  return { hay, activo: puesto && hay };
}
