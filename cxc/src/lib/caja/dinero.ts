/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LA PLATA SE REDONDEA A CENTAVOS ANTES DE COMPARARLA (7-sep-2026).
 *
 * 🩸 El período Nº2 se veía EN ROJO con «−$0.00». Sus 26 recibos suman $200
 * exactos en la base, pero sumados uno a uno en el navegador dan
 * 200.00000000000003: el saldo quedaba en −0.00000000000003, `saldo < 0` daba
 * true y la pantalla lo pintaba como si Angela se hubiera pasado del fondo. El
 * mismo defecto salía en la lista de períodos, en el encabezado del detalle,
 * en el modal de cierre y en el papel impreso.
 *
 * La regla es una sola: **toda suma de plata pasa por `centavos()` antes de
 * compararse con cero, pintarse o mostrarse.** Un centavo es la unidad más
 * chica que existe en una caja menuda; por debajo de eso no hay dato, hay ruido
 * del punto flotante.
 *
 * Módulo PURO: sin I/O, sin fechas, sin React.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Redondea a centavos. `null`, `undefined` y lo que no es número valen 0. */
export function centavos(valor: number | string | null | undefined): number {
  const n = typeof valor === "number" ? valor : parseFloat(String(valor ?? ""));
  if (!isFinite(n)) return 0;
  // El +0 evita el «-0» que sale de redondear un negativo diminuto: -0 se
  // imprime como «-$0.00», que es exactamente el defecto que este módulo cierra.
  return Math.round(n * 100) / 100 + 0;
}

/** Suma una lista de montos y devuelve el resultado ya redondeado a centavos. */
export function sumaMontos(valores: Array<number | string | null | undefined>): number {
  let total = 0;
  for (const v of valores) total += centavos(v);
  return centavos(total);
}

/** Suma el total de una lista de gastos (cada uno con su campo `total`). */
export function totalGastado(gastos: Array<{ total?: number | string | null }>): number {
  return sumaMontos(gastos.map((g) => g.total));
}

/**
 * Lo que queda en la caja: fondo − gastado, redondeado. Es la ÚNICA cuenta de
 * saldo del módulo — la usan la lista, el encabezado, el modal de cierre, el
 * papel impreso, el Excel y el cierre del servidor.
 */
export function saldoDelPeriodo(
  fondo: number | string | null | undefined,
  gastos: Array<{ total?: number | string | null }> | number,
): number {
  const gastado = typeof gastos === "number" ? centavos(gastos) : totalGastado(gastos);
  return centavos(centavos(fondo) - gastado);
}

/**
 * Cuánta plata hay que reponer para que la caja vuelva a su fondo. Es
 * `fondo − saldo`, que con el saldo ya redondeado da exactamente lo gastado
 * (y nunca «$200.00 − $199.99999»).
 */
export function reposicionDelPeriodo(
  fondo: number | string | null | undefined,
  gastos: Array<{ total?: number | string | null }> | number,
): number {
  return centavos(centavos(fondo) - saldoDelPeriodo(fondo, gastos));
}

/**
 * ¿Se gastó más que el fondo? Se pregunta SIEMPRE por aquí y nunca con
 * `saldo < 0` a pelo: un residuo de una billonésima no es una caja pasada.
 */
export function saldoEsNegativo(saldo: number | string | null | undefined): boolean {
  return centavos(saldo) < 0;
}

/**
 * Cómo se escribe un monto en pantalla: con centavos, y la plata negativa con
 * el menos TIPOGRÁFICO delante del signo de peso (`−$36.50`), como manda el
 * diccionario de la casa.
 *
 * 🩸 La lista de períodos escribía `$-36.50` (el menos DENTRO del monto) y el
 * modal de cierre `-$36.50` (con guion): tres formas de decir lo mismo en la
 * misma pantalla. Ahora sale de una sola función.
 */
export function montoEnPantalla(valor: number | string | null | undefined): string {
  const n = centavos(valor);
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `\u2212$${abs}` : `$${abs}`;
}
