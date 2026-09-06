// ─────────────────────────────────────────────────────────────────────────────
// EL PERÍODO DE COMISIONES — un mes, o TODO EL AÑO. (módulo PURO)
//
// 🔴 «TODO EL AÑO» (6-sep-2026). Daniel rechazó una columna fija de «2026» en la
// matriz —*«lo verán todo el tiempo»*— y pidió esto en su lugar: que el selector
// de período ofrezca el año completo, para ver lo que va de 2026 y también 2025
// o 2024.
//
// 🩸 POR QUÉ. Para saber cuánto lleva alguien en el año había que abrir los 9
// meses UNO POR UNO y sumar a mano. Medido contra producción el 6-sep-2026, los
// 9 meses de 2026 en las 6 empresas: Edwin **$9.037,17** · Reynaldo
// **$58.544,09** · Rodrigo **$234,49** = **$67.815,75**.
//
// 🔴 EL AÑO ES LA SUMA DE SUS MESES, NO OTRA CUENTA. `mesesDelPeriodo` dice
// cuáles meses se piden y la suma la hace `acumular-anio.ts` sobre lo que ya
// devolvió la RPC, mes a mes, con sus descuentos ya restados por
// `netearComisiones` — el único restador del sistema. No hay una segunda
// fórmula del año, que es la forma conocida de que dos pantallas digan cifras
// distintas para lo mismo.
//
// ⚠️ EL AÑO EN CURSO SE CORTA EN EL MES EN CURSO, en hora de PANAMÁ. Pedirle a
// la RPC noviembre de 2026 en septiembre no es un error, pero son 6 llamadas por
// mes vacío y la regla de la casa ya es que un mes futuro no se puede elegir.
// ─────────────────────────────────────────────────────────────────────────────

import { mesEnCurso } from "./mes-inicial";

/** El valor de `mes` que significa «todo el año». No es un mes: es su ausencia. */
export const MES_TODO_EL_ANIO = 0;

/** Rótulo del botón en el selector de período. */
export const ROTULO_TODO_EL_ANIO = "Todo el año";

export const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

export const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

/** ¿El período pedido es el año entero? */
export function esTodoElAnio(mes: number): boolean {
  return mes === MES_TODO_EL_ANIO;
}

/**
 * Qué meses hay que pedir para armar este período.
 *
 * Un mes → ese mes. Todo el año → de enero hasta el mes EN CURSO si el año es
 * el de hoy (Panamá), y los 12 si ya pasó. Un año futuro no tiene meses.
 */
export function mesesDelPeriodo(year: number, mes: number, hoyYmd: string): number[] {
  if (!esTodoElAnio(mes)) return [mes];
  const hoy = mesEnCurso(hoyYmd);
  const hasta = year < hoy.year ? 12 : year === hoy.year ? hoy.mes : 0;
  return Array.from({ length: Math.max(0, hasta) }, (_, i) => i + 1);
}

/** «Agosto 2026» · «Todo 2026». Lo que dice el control de período abierto. */
export function etiquetaPeriodo(year: number, mes: number): string {
  return esTodoElAnio(mes) ? `Todo ${year}` : `${MESES_LARGOS[mes - 1]} ${year}`;
}

/** «Ago 2026» · «Todo 2026». La misma decisión, en el ancho fijo del iPhone. */
export function etiquetaPeriodoCorta(year: number, mes: number): string {
  return esTodoElAnio(mes) ? `Todo ${year}` : `${MESES_CORTOS[mes - 1]} ${year}`;
}

/**
 * El botón de Excel DICE QUÉ TRAE (Daniel, 6-sep-2026: *«a, pero descargar, no
 * bajar, como esté en todos los módulos»*). Medido: el sistema dice
 * **«Descargar»** 23 veces contra 5 formas raras.
 */
export function rotuloDescargarPeriodo(mes: number): string {
  return esTodoElAnio(mes) ? "Descargar el año" : "Descargar el mes";
}

/** El trozo de fecha del nombre de archivo: `2026-08` · `2026`. */
export function sufijoArchivoPeriodo(year: number, mes: number): string {
  return esTodoElAnio(mes) ? String(year) : `${year}-${String(mes).padStart(2, "0")}`;
}
