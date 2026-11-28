// ─────────────────────────────────────────────────────────────────────────────
// VISTA GENERAL › MARGEN Y COBROS MES A MES (27-nov-2026, Daniel). Mantener
// presionado «Margen del mes» o «Cobros del mes» abre la MISMA `TarjetaMesAMes`
// que Ventas, con la empresa elegida. Margen: % de cada mes vs el mismo mes del
// año pasado, en puntos (`margenMesAMes`). Cobros: SOLO el monto de cada mes,
// sin ▲▼ contra el año pasado (Daniel, 28-nov-2026: «b»), con la regla de la tarjeta (`leerRecibosQueCuentan`), por `/api/dashboard/vista-general/cobros-mes-a-mes`.
// `false` = solo Ventas tiene mes a mes.
// ─────────────────────────────────────────────────────────────────────────────
export const VG_MARGEN_COBROS_MES_A_MES_2026_11 = true;
