// ─────────────────────────────────────────────────────────────────────────────
// GASTOS Y CAJA MENUDA «COMO LO HARÍA APPLE» (6-oct-2026). APAGADO hasta que
// Daniel vea el mockup HOY vs RECOMENDACIÓN.
//
// La MISMA pantalla con las reglas de docs/diseno.md, como en Ventas, CxC,
// Guías, Reclamos y Clientes. Por pantalla:
//   · Gastos › lista: las tarjetas y la tabla con píldora → filas de dos
//     renglones con › (el monto a la derecha ya dice si hay dato); el mes, con
//     el panel de período compacto (‹ Octubre 2026 ⌄ ›). En el celular, «Gastos
//     ▾» es el selector de pestaña (la barra v3.3) y el mes va en su renglón.
//     🔴 SIN número grande arriba: los gastos de dos empresas NUNCA se suman.
//   · Gastos › empresa: «‹ Volver» en la línea del nombre; el Total egresos
//     grande con su línea gris («Gastos $X · Otros egresos $Y · 41 pagos»); se
//     va la caja de totales y el total repetido al pie.
//   · Saldos de banco: una fila por empresa con su saldo y su ›; el formulario
//     se abre en la fila tocada (un solo «Guardar» a la vista, no ocho).
//   · Caja menuda › períodos: el saldo del período ABIERTO grande con su línea
//     gris; los períodos en filas de dos renglones con › y «···»; la letra y
//     los colores del sistema (sin Playfair, Geist Mono ni teal).
//   · Caja menuda › período: «‹ Períodos» en la línea del título; el saldo
//     grande y UNA línea gris (sin las tres cajas ni la barra); «Nuevo gasto»
//     es la acción principal (fija abajo en el celular); Imprimir, Excel y
//     «Cerrar período» al «···» (2 cierres en toda la historia contra 77 recibos).
//   · Nuevo gasto (VentanaCentrada) NO se toca: Daniel ya la aprobó.
//
// 🔴 NO CAMBIA NINGÚN NÚMERO NI NINGÚN GUARDADO: los montos salen de
// `resumirMesEgresos`, `saldoDelPeriodo` y `totalGastado`; las rutas y los
// manejadores son los de siempre. Apagado = cada pantalla exactamente como
// estaba. Candado: `proveedores-gastos-apple-2026-10.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

/** `false` = como antes. */
export const GASTOS_APPLE_2026_10 = false;

/** Desde qué año se ofrece en el panel de período (los egresos llegan desde 2025). */
export const PRIMER_ANIO_GASTOS = 2025;

/** Los años del panel: del primero al del mes en curso, nunca uno futuro. */
export function aniosDeGastos(mesTope: string): number[] {
  const tope = Number(mesTope.slice(0, 4));
  const out: number[] = [];
  for (let a = Math.min(PRIMER_ANIO_GASTOS, tope); a <= tope; a++) out.push(a);
  return out;
}

/** Los meses de un año, sin pasar del mes en curso. */
export function mesesDeGastos(anio: number, mesTope: string): number[] {
  const [ta, tm] = mesTope.split("-").map(Number);
  const hasta = anio < ta ? 12 : anio === ta ? tm : 0;
  return Array.from({ length: hasta }, (_, i) => i + 1);
}

/**
 * La línea gris del período de caja: «Fondo $200.00 · Gastado $163.28 · 26
 * recibos». Los tres números son los de siempre; aquí solo se escriben.
 */
export function lineaPeriodoCaja(fondo: string, gastado: string, recibos: number): string {
  return `Fondo ${fondo} · Gastado ${gastado} · ${recibos} ${recibos === 1 ? "recibo" : "recibos"}`;
}
