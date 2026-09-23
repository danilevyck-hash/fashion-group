// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION DENTRO DE COMISIONES ABRE EN EL MISMO MES QUE EL GRUPO. (PURO)
//
// 🩸 POR QUÉ (22-sep-2026). En la misma pantalla y con el mismo selector arriba,
// Fashion Group abría en «Agosto» (el último mes cerrado, decisión de Daniel del
// 6-sep) y la opción Multifashion abría en «Septiembre (en curso)»: la vista de
// Vendedoras venía montada TAL CUAL, con sus chips propios. Daniel: *«7. a)»*
// — que abra en el último mes cerrado, igual que el grupo.
//
// 🔴 SU CÁLCULO NO SE TOCA NI SE MEZCLA con el del grupo: Multifashion paga
// 0,5 % sobre TODA la venta, sin filtro de utilidad, y nunca se suman en un
// número. Lo único que cambia es CON QUÉ PERÍODO abre y que ese período lo
// manda el selector de Comisiones (`ComisionesPeriodo`), traducido al
// vocabulario del módulo Multifashion (`lib/multifashion/periodo.ts`).
//
// ⚠️ Con el interruptor en `false`, la vista vuelve a sus chips propios, como
// hasta el 22-sep-2026.
// ─────────────────────────────────────────────────────────────────────────────

import type { CortePeriodo, Periodo } from "@/lib/multifashion/periodo";
import { mesEnCurso } from "./mes-inicial";
import { esTodoElAnio } from "./periodo";

/** El interruptor: Multifashion abre y se mueve con el período de Comisiones. */
export const MULTIFASHION_CON_EL_PERIODO_DEL_GRUPO = true;

/**
 * El período del selector de Comisiones, dicho como lo entiende Multifashion:
 * un mes → ese mes; «Todo el año» (mes 0) → el año entero.
 */
export function periodoParaMultifashion(year: number, mes: number): Periodo {
  return esTodoElAnio(mes) ? { tipo: "anio", anio: year } : { tipo: "mes", anio: year, mes };
}

/**
 * El mes de corte: el que corre hoy en Panamá. Con él la vista sabe si el mes
 * elegido es «en curso» o «cerrado» — solo cambia el RÓTULO de la Δ.
 */
export function corteParaMultifashion(hoyYmd: string): CortePeriodo {
  const { year, mes } = mesEnCurso(hoyYmd);
  return { anio: year, mes };
}
