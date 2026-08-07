// ─────────────────────────────────────────────────────────────────────────────
// LA RATA POR HORA, TAL CUAL LA USA EL CÁLCULO
//
// 🔴 POR QUÉ EXISTE ESTE ARCHIVO (6-ago-2026).
//
// Había DOS ratas y no eran la misma:
//
//   · la que CALCULA la planilla  → `centavos(salario / divisor)`  = 3.02
//   · la que MOSTRABA Configuración → `rataPorHora(...)` a 4 decimales = 3.0201
//
// El cotejo contra el Excel de la contable dejó fijo que el cálculo va con la
// rata REDONDEADA A CENTAVOS (`planilla.ts`: «LA RATA TAMBIÉN VA A CENTAVOS.
// Su cuadro dice "3.27" y con eso multiplica»). O sea que la pantalla estaba
// enseñando un número con el que NADIE calcula nada.
//
// No es cosmético. La contable trabaja a dos decimales: ver `$3.0201` donde su
// planilla dice `$3.02` no se lee como "más precisión", se lee como "el sistema
// tiene otro número" — y a partir de ahí desconfía del cuadro entero. La regla
// es mostrar EXACTAMENTE el número con el que se multiplica.
//
// ⚠️ Y NO alcanza con formatear a 2 decimales lo que ya venía redondeado a 4:
// eso es redondear dos veces, y las dos vueltas no siempre caen en el mismo
// centavo. `salario/divisor = 3.024951` → a 4 da 3.0250 → a 2 da **3.03**,
// mientras el cálculo real hace `centavos(3.024951)` = **3.02**. Un centavo de
// diferencia contra su Excel es todo lo que hace falta para perder la confianza,
// que es justo lo que este archivo viene a evitar. Por eso se redondea UNA sola
// vez, desde el número largo, con la MISMA función que usa `calcularDinero`.
//
// Importar `centavos` desde `planilla.ts` (en vez de copiarlo) es a propósito:
// dos copias del mismo redondeo es una que se corrige y otra que se queda vieja.
// No hay ciclo — `planilla.ts` importa `config.ts`, y este archivo importa a los
// dos sin que nadie lo importe de vuelta.
// ─────────────────────────────────────────────────────────────────────────────

import { divisorDe, type ReglasAsistencia } from "./config";
import { centavos } from "./planilla";

/**
 * La rata por hora que se USA para calcular: salario mensual ÷ divisor de la
 * jornada, redondeada a centavos.
 *
 * Es la misma línea que `calcularDinero` (`planilla.ts`), no una aproximación:
 * lo que devuelve acá es literalmente el número por el que se multiplican las
 * horas extra, los domingos, los feriados y las ausencias.
 *
 * `null` cuando no se puede calcular (sin salario, salario ≤ 0, o un divisor
 * inservible). Nunca devuelve `Infinity` ni `NaN`: un número así se pagaría
 * igual que uno bueno.
 */
export function rataPorHoraCalculo(
  salarioMensual: number | null | undefined,
  jornadaSemanal: number,
  reglas: ReglasAsistencia,
): number | null {
  if (salarioMensual === null || salarioMensual === undefined) return null;
  if (!Number.isFinite(salarioMensual) || salarioMensual <= 0) return null;
  const divisor = divisorDe(jornadaSemanal, reglas);
  if (divisor === null) return null;
  return centavos(salarioMensual / divisor);
}
