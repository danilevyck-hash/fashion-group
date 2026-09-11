// ─────────────────────────────────────────────────────────────────────────────
// QUIEN ENTRA (O SALE) A MITAD DE LA QUINCENA COBRA LOS DÍAS TRABAJADOS
// (10-sep-2026). Módulo PURO.
//
// Daniel, textual, sobre el backtest contra los Excel de la contable: *«c, se
// paga días trabajados»*. Hasta ese día esa persona salía en «Tú decides» sin
// número (la regla del 25-ago: ni completo ni prorrateado). Ahora:
//
//     días hábiles trabajados × (sueldo mensual ÷ 26)
//
// 🔴 EL DÍA VALE SUELDO MENSUAL ÷ 26 (10-sep-2026, Daniel eligió «a»: es la
// costumbre de Panamá y lo que la contable ya paga). «Hábil» es lunes a viernes
// (`esHabil`, la misma regla del Reporte): los días desde `fecha_ingreso` (o
// hasta `fecha_salida`), acotados al período. Caso de control: Yeritza (51),
// entró el 27-jul-2026, 5 días → 5 × (600 ÷ 26) = **$115,38**.
//
// 🩸 La primera versión (esa misma tarde) dividía el quincenal entre los hábiles
// de la QUINCENA (5 de 12 → $125,00). Como el motor prorratea con un FACTOR
// sobre el quincenal (mensual ÷ 2), el factor es `días × 2 ÷ 26 = días ÷ 13`.
//
// 🔴 El factor multiplica al `factorBase` del período (que ya prorratea un
// rango libre): las dos cosas se componen, no se pisan.
// ─────────────────────────────────────────────────────────────────────────────
import { esHabil } from "./reporte";
import { esFechaValida, motivoPeriodoParcial, type Vigencia } from "./vigencia";

export interface Prorrateo {
  /** Los días hábiles (L–V) del período entero. */
  habilesPeriodo: number;
  /** Los días hábiles del período en que la persona ya estaba (o todavía estaba). */
  habilesTrabajados: number;
  /** Lo que multiplica al quincenal: `habilesTrabajados × 2 ÷ 26`. */
  factor: number;
  /** «entró el 27 de julio de 2026: 5 de 12 días hábiles». */
  texto: string;
}

const DIA_MS = 86_400_000;

/** 🔴 Los días pagados de un mes, la costumbre de Panamá: el día vale sueldo ÷ 26. */
export const DIAS_PAGADOS_POR_MES = 26;

/** Los días hábiles (lunes a viernes) entre dos fechas, ambas incluidas. */
export function diasHabilesEntre(desde: string, hasta: string): number {
  if (!esFechaValida(desde) || !esFechaValida(hasta) || hasta < desde) return 0;
  let n = 0;
  for (let t = Date.parse(`${desde}T12:00:00Z`); t <= Date.parse(`${hasta}T12:00:00Z`); t += DIA_MS) {
    if (esHabil(new Date(t).toISOString().slice(0, 10))) n += 1;
  }
  return n;
}

/**
 * El prorrateo de quien entró o salió DENTRO del período. `null` = trabajó el
 * período entero (o no hay ficha): se le paga como siempre.
 */
export function prorrateoPorVigencia(
  v: Vigencia | null | undefined,
  desde: string,
  hasta: string,
): Prorrateo | null {
  const motivo = motivoPeriodoParcial(v, desde, hasta);
  if (!motivo || !v) return null;
  const inicio = esFechaValida(v.fechaIngreso) && v.fechaIngreso! > desde ? v.fechaIngreso! : desde;
  const fin = esFechaValida(v.fechaSalida) && v.fechaSalida! < hasta ? v.fechaSalida! : hasta;
  const habilesPeriodo = diasHabilesEntre(desde, hasta);
  const habilesTrabajados = fin < inicio ? 0 : diasHabilesEntre(inicio, fin);
  // quincenal × factor = días × (mensual ÷ 26)  ⇔  factor = días ÷ 13
  const factor = habilesTrabajados / DIAS_PAGADOS_POR_MES * 2;
  return {
    habilesPeriodo,
    habilesTrabajados,
    factor,
    texto: `${motivo}: ${habilesTrabajados} ${habilesTrabajados === 1 ? "día hábil" : "días hábiles"} (sueldo ÷ 26 por día)`,
  };
}
