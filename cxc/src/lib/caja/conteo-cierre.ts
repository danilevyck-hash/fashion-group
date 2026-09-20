/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — CONTAR LA PLATA AL CERRAR (20-sep-2026).
 *
 * 🩸 Por qué existe. El cierre sumaba los recibos, los restaba del fondo y
 * escribía «Queda en caja $36.72». **Nunca preguntaba cuánta plata hay de
 * verdad.** Medido contra producción: los DOS cierres de toda la historia
 * dieron exactamente $0.00, y en los dos el último recibo cargado —7 y 10
 * segundos antes de cerrar— es exactamente lo que faltaba para llegar a $200.
 * O sea: el sistema no tiene cómo distinguir «cuadró» de «le puse lo que
 * faltaba».
 *
 * 🔴 EL DESCUADRE NO FRENA EL CIERRE. Se dice con claridad («Faltan $2.00» /
 * «Sobran $1.50»), se guarda con el período y se sigue. Un faltante es un
 * hecho, no un error de la persona que cierra: frenarla la empuja justo a lo
 * que este módulo viene a cerrar — inventar un recibo para cuadrar.
 *
 * Módulo PURO: sin I/O, sin fechas, sin React. La plata pasa siempre por
 * `centavos()`, como manda `dinero.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { centavos, montoEnPantalla } from "./dinero";

/** La diferencia entre lo que se contó y lo que el sistema dice que debería haber. */
export function diferenciaDeCaja(
  contado: number | string | null | undefined,
  esperado: number | string | null | undefined,
): number {
  return centavos(centavos(contado) - centavos(esperado));
}

/**
 * Lo que la persona tecleó, convertido a plata. `null` cuando no hay un número
 * que valga: vacío, letras, o un negativo (en una caja no hay menos de $0).
 *
 * 🔑 El cero SÍ vale: una caja vacía es un conteo legítimo, y es justo el que
 * más se necesita decir.
 */
export function leerConteo(texto: string | null | undefined): number | null {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  if (!/^\d*\.?\d*$/.test(t) || t === ".") return null;
  const n = parseFloat(t);
  if (!isFinite(n) || n < 0) return null;
  return centavos(n);
}

/** ¿La caja contada no coincide con la cuenta del sistema? */
export function hayDescuadre(diferencia: number | string | null | undefined): boolean {
  return centavos(diferencia) !== 0;
}

/**
 * Cómo se lee el descuadre en pantalla. Se dice en plata y en palabras de la
 * casa: nunca «diferencia: −2.00».
 */
export function mensajeDeDiferencia(diferencia: number | string | null | undefined): string {
  const d = centavos(diferencia);
  if (d === 0) return "Cuadra con la cuenta del sistema.";
  const monto = montoEnPantalla(Math.abs(d));
  return d < 0 ? `Faltan ${monto}` : `Sobran ${monto}`;
}
