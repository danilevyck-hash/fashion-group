// ─────────────────────────────────────────────────────────────────────────────
// Cálculos puros del dashboard Vista General (ejecutivo).
// SIN imports de supabase-server ni I/O: funciones puras, unit-testeables
// (src/__tests__/vista-general-calc.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoSemaforo = "verde" | "ambar" | "rojo" | "sin_gastos";

/**
 * Estado del semáforo de rentabilidad por empresa.
 *
 *   - rentabilidad null  → "sin_gastos" (la empresa no cargó gastos este mes;
 *     sin gastos el número saldría inflado, mejor no opinar).
 *   - rentabilidad < 0   → "rojo" (pierde plata).
 *   - margen neto < 5%   → "ambar" (incluye rentabilidad === 0: no pierde pero
 *     tampoco gana). Exactamente 5% → "verde".
 *   - resto              → "verde".
 *
 * Edge elegido a propósito: ventas <= 0 con rentabilidad >= 0 (dato raro —
 * hay gastos cargados pero cero ventas) → "ambar": no hay base para calcular
 * el %, y pintar verde sin ventas sería engañoso.
 */
export function estadoSemaforo(
  rentabilidad: number | null,
  ventas: number
): EstadoSemaforo {
  if (rentabilidad === null) return "sin_gastos";
  if (rentabilidad < 0) return "rojo";
  if (ventas <= 0) return "ambar";
  if (rentabilidad / ventas < 0.05) return "ambar";
  return "verde";
}

// ── Rentabilidad POR EMPRESA ─────────────────────────────────────────────────
//
// 🔴 LA REGLA DE DANIEL, textual (13-ago-2026):
//     "no quiero Rentabilidad del grupo, lo quiero por empresa"
//
// 🩸 Y ACÁ ESTABA `rentabilidadGrupo`, QUE SE BORRÓ ENTERA. Sumaba la utilidad y
// el gasto de todas las empresas con el mes utilizable y devolvía UN número. Se
// borró en vez de dejarla sin llamar: una función que calcula el número que
// Daniel pidió no tener es una función que alguien vuelve a enganchar. La
// pantalla ahora muestra una fila por empresa (`RentabilidadPorEmpresa.tsx`).
//
// ⚠️ Lo que sí se conserva es la LECCIÓN que aquella función encapsulaba: nunca
// mezclar los universos de dos empresas. Antes eso significaba "acumulá ventas,
// utilidad y gasto en el mismo bucle"; ahora significa algo más fuerte y más
// simple — esta función recibe UNA empresa y no tiene forma de ver las otras.

/** Las tres cifras de UNA empresa. */
export interface EmpresaConGasto {
  ventas: number;
  utilidad: number;
  /** `null` = el mes de ESA empresa no se puede mostrar (sin cerrar, sin planilla…). */
  gasto: number | null;
}

export interface RentabilidadEmpresa {
  /** `utilidad − gasto`, los dos de ESTA empresa. */
  monto: number;
  /** Sobre las ventas de ESTA empresa. `null` si no vendió nada. */
  pct: number | null;
}

/**
 * Rentabilidad de UNA empresa = su utilidad bruta − su gasto.
 *
 * 🔴 Devuelve `null` cuando a la empresa le FALTA el gasto, y eso es lo más
 * importante de la función. Tratar el gasto ausente como cero daría
 * `rentabilidad = utilidad bruta`: un número precioso, indistinguible del de una
 * empresa que de verdad gana plata. La contadora va meses atrasada de forma
 * distinta en cada empresa, así que ese caso no es raro — es el normal. Con
 * `null`, la pantalla está obligada a escribir el motivo en palabras.
 */
export function rentabilidadEmpresa(e: EmpresaConGasto): RentabilidadEmpresa | null {
  if (e.gasto === null) return null;
  const monto = e.utilidad - e.gasto;
  return { monto, pct: e.ventas > 0 ? monto / e.ventas : null };
}

// ── Lo que se retiró de este archivo (11-ago-2026) ───────────────────────────
//
// `prorratearGrupo` y `puntoEquilibrio` se borraron junto con la carga manual de
// gastos, su única fuente de datos:
//
//  · `prorratearGrupo` repartía el gasto de la fila `empresa_key = 'grupo'`.
//    El mayor contable NO tiene esa fila: cada gasto ya viene con la empresa que
//    lo pagó.
//  · `puntoEquilibrio` era `gastos fijos ÷ margen`, y "fijo" salía de
//    `gastos_categorias.es_fijo`. El mayor sólo trae el código de cuenta, sin
//    esa marca. Clasificar las ~60 cuentas del grupo 6 en fijo/variable es una
//    decisión de negocio de Daniel; hasta que exista, el punto de equilibrio no
//    se calcula (ver el encabezado de `api/dashboard/vista-general/route.ts`).
