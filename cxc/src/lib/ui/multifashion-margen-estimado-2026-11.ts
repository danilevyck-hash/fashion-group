// ─────────────────────────────────────────────────────────────────────────────
// Multifashion › la tarjeta del día — el margen de HOY, ESTIMADO (28-nov-2026,
// Daniel: «A»). Switch da el costo de ACS al día siguiente; mientras tanto la
// tarjeta de «Hoy» muestra el margen estimado con los artículos vendidos hoy
// (`/apireporte/ventasucursal`, API) × el costo actual de cada artículo
// (`switch_articulo_info.costo_api`), rotulado «estimado». No se guarda nada:
// al día siguiente el margen real (`switch_articulo_diario`) lo reemplaza solo.
// Cuentas en `lib/multifashion/margen-estimado.ts`; cuadre en
// `scripts/_verif-multifashion-margen-estimado.ts`.
// `false` = «mañana», como antes.
// ─────────────────────────────────────────────────────────────────────────────

export const MULTIFASHION_MARGEN_ESTIMADO_2026_11 = true;
