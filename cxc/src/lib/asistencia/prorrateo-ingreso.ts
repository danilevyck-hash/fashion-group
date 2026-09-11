// ─────────────────────────────────────────────────────────────────────────────
// QUIEN ENTRA (O SALE) A MITAD DE LA QUINCENA COBRA LOS DÍAS TRABAJADOS
// (10-sep-2026). Módulo PURO.
//
// Daniel, textual, sobre el backtest contra los Excel de la contable: *«c, se
// paga días trabajados»*. Hasta ese día esa persona salía en «Tú decides» sin
// número (la regla del 25-ago: ni completo ni prorrateado). Ahora:
//
//     sueldo quincenal ÷ días hábiles de la quincena × días hábiles trabajados
//
// «Hábil» es lunes a viernes (`esHabil`, la misma regla del Reporte): los días
// desde `fecha_ingreso` (o hasta `fecha_salida`), acotados al período.
//
// ⚠️ La contable divide el sueldo MENSUAL entre 26 (los lunes-a-sábado del mes)
// y multiplica por los días: Yeritza (51), que entró el 27-jul-2026, cobró
// 5 × $23,08 = $115,38. Con esta fórmula —la que Daniel definió, sobre los
// hábiles de la QUINCENA— le tocan 5 de 12 hábiles: 300 ÷ 12 × 5 = $125,00.
// La diferencia ($9,62) es que ella cuenta los sábados como día pagado en el
// divisor (26) y acá el divisor son los hábiles de la quincena (12). Queda
// escrito en el candado; si Daniel prefiere el 26, es UN número acá.
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
  /** `habilesTrabajados ÷ habilesPeriodo`. 0 con un período sin hábiles. */
  factor: number;
  /** «entró el 27 de julio de 2026: 5 de 12 días hábiles». */
  texto: string;
}

const DIA_MS = 86_400_000;

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
  const factor = habilesPeriodo > 0 ? habilesTrabajados / habilesPeriodo : 0;
  return {
    habilesPeriodo,
    habilesTrabajados,
    factor,
    texto: `${motivo}: ${habilesTrabajados} de ${habilesPeriodo} días hábiles`,
  };
}
