/**
 * Qué es GASTO y cómo se lee un código de cuenta. Reglas de negocio, no de
 * formato — por eso no están en `./csv.ts`.
 *
 * 🩸 POR QUÉ VIVE ACÁ. `esGasto` (el grupo 6) era de `lib/mayor/gastos.ts` y
 * `egresos/reglas.ts` lo importaba **a propósito**, con un comentario que decía
 * que el criterio de gasto tenía que ser EL MISMO en las dos fuentes. Retirado
 * el mayor, la regla no se va con él: es la definición de gasto de la empresa.
 *
 * ⚠️ Cuerpos movidos tal cual. Lo que NO se mudó —el ISR, las cuentas sin salida
 * de caja, los salarios, `EstadoMes`— era del MAYOR y se retiró con él: Egresos
 * Varios no tiene asientos de cierre ni desglosa ISR.
 */

/** Prefijo del único grupo que es gasto. */
export const GRUPO_GASTOS = "6.";

/** `"6.03.07.00.00"` → `"6.03.07"` (los 3 segmentos que identifican la cuenta). */
export function cuentaCorta(cuenta: string): string {
  return cuenta.split(".").slice(0, 3).join(".");
}

export const esGasto = (cuenta: string): boolean => cuenta.startsWith(GRUPO_GASTOS);

/** Centavos enteros → dólares. Convertir es cosa de quien PINTA: sumar floats
 *  por el camino es la forma clásica de perder el centavo. */
export function centAUsd(cent: number): number {
  return Math.round(cent) / 100;
}
