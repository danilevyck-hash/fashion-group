// ─────────────────────────────────────────────────────────────────────────────
// SIETE MOCKUPS APROBADOS (Daniel, 27-nov-2026: «HOY vs RECOMENDACIÓN» 01 a 07).
// Un solo interruptor; `false` = lo de antes. Solo el teléfono, salvo donde se
// dice.
//
// 1. CxC: los tres tramos en DOS renglones (monto arriba, «0-90 días» abajo).
// 2. CxC, mantener presionado un cliente: sus PAGOS mes a mes contra el año
//    pasado (`switch_recibos`, sin retenciones ni recibos en cero, la regla de
//    «Últimos pagos»). Boston por su propia ruta, solo Boston.
// 3. Proveedores, mantener presionada una empresa: COMPRAS mes a mes
//    (`switch_ingresos_mercancia`, cantidad × costo CIF), flechas en GRIS.
// 4. Bodega: el número rojo en el ícono de la app con los pedidos Pendientes
//    que esa persona ve (`navigator.setAppBadge`; sin soporte, nada).
// 5. CxC, mantener presionado: debajo, Llamar · WhatsApp (solo celular de
//    Panamá) · Copiar código. Teléfonos del directorio (`clientes_master`).
// 6. Despachos › Pedidos (celular): el vendedor una vez, como subtítulo bajo
//    la empresa, y «Antigüedad: N días» completo.
// 7. CxC (celular): sin la rayita de color de cada cliente.
// Candado `mantener-presionado-2026-11.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export const MANTENER_PRESIONADO_2026_11 = true;
