// ─────────────────────────────────────────────────────────────────────────────
// VENTAS «COMO LO HARÍA APPLE» (4-oct-2026, propuesta). Módulo PURO.
//
// Daniel aprobó rediseñar todo el sistema módulo por módulo. En Ventas son
// tres cambios, encima del Resumen por mes ya publicado (RESUMEN_MES_2026_10):
//   1 · Resumen: UN número grande (la venta del período) con su ▲/▼, y
//       utilidad · margen · proyección en una línea gris debajo. Celular y
//       computadora dicen lo mismo, con las MISMAS cifras de la tira de hoy.
//   2 · Computadora: el selector de Comisiones también en el Resumen (año,
//       «Todo el año» o un mes), igual que en el celular.
//   3 · Una sola línea de frescura (la común, `FrescuraVentasCel`): en el
//       Resumen va junto al número grande, y Clientes deja de repetir la hora
//       con «datos de hoy …».
//
// 🔴 NINGÚN NÚMERO CAMBIA: las cifras salen de `numerosDelResumen`, que es la
// misma cuenta que la tira de cuatro del celular (movida aquí, sin tocarla).
//
// Interruptor `VENTAS_APPLE_2026_10`, PRENDIDO el 4-oct-2026 con el «sí» de
// Daniel; `false` = todo como antes. Candado `ventas-apple.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 PRENDIDO el 4-oct-2026: Daniel aprobó el mockup («aprobado»). `false` = como antes. */
export const VENTAS_APPLE_2026_10 = true;

/** «Utilidad $2.03M · Margen 29% · Proyección $9.10M»: lo que va bajo el número grande. */
export function lineaBajoElNumero(resto: readonly { rotulo: string; valor: string }[]): string {
  return resto.map((n) => `${n.rotulo} ${n.valor}`).join(" · ");
}
