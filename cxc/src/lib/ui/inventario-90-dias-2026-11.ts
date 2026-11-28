// ─────────────────────────────────────────────────────────────────────────────
// INVENTARIO POR ANTIGÜEDAD (27-nov-2026, aprobado por Daniel). La tarjeta
// Inventario de la Vista general se parte en «Hasta 90 días» / «Más de 90 días»,
// como Por cobrar con sus 120 días. Primero entra, primero sale: lo que llegó en
// los últimos 90 días (fecha de Panamá, `switch_ingresos_mercancia`), con tope la
// existencia de hoy, es «hasta 90»; el resto, «más de 90»; un artículo con stock
// sin ninguna llegada registrada va a «Sin fecha de llegada» (solo si pasa de 0).
// Al MISMO costo de la tarjeta. Multifashion entra: su llegada se sincroniza desde
// el 27-nov-2026 (los traspasos del grupo cuentan como llegada a la tienda).
// La suma: `inventario_antiguedad_v1` (migración 20270202120000, aplicada).
// `false` = la tarjeta de antes (total y unidades).
// ─────────────────────────────────────────────────────────────────────────────
export const INVENTARIO_90_DIAS_2026_11 = true;

/** El corte de «nuevo». Daniel: 90 días. */
export const DIAS_INVENTARIO_NUEVO = 90;
