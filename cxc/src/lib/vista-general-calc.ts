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

// ── Rentabilidad del grupo ───────────────────────────────────────────────────

/** Una empresa con sus ventas, su utilidad bruta y su gasto del mes. */
export interface EmpresaConGasto {
  key: string;
  ventas: number;
  utilidad: number;
  /** `null` = el mes de ESA empresa no se puede mostrar (sin cerrar, sin planilla…). */
  gasto: number | null;
}

export interface RentabilidadGrupo {
  monto: number;
  pct: number | null;
  /** Ventas, utilidad y gasto SÓLO de las empresas contadas. */
  ventas: number;
  utilidad: number;
  gastos: number;
  empresasConGasto: number;
}

/**
 * Rentabilidad consolidada = utilidad bruta − gasto, **sobre las mismas
 * empresas**.
 *
 * 🩸 EL ERROR QUE ESTA FUNCIÓN EXISTE PARA IMPEDIR. Con 4 de 8 empresas con el
 * mes cerrado, restarle el gasto de esas 4 a la utilidad de las 8 da una
 * rentabilidad inflada que se ve perfectamente normal — nada en pantalla
 * delataría que la resta mezcló dos universos. Por eso las tres cifras
 * (`ventas`, `utilidad`, `gastos`) se acumulan en el MISMO bucle, y sólo entra
 * la empresa cuyo `gasto` no es `null`.
 *
 * Devuelve `null` si ninguna empresa tiene gasto utilizable: no hay nada honesto
 * que mostrar, y un $0 se leería como "no gasté nada".
 */
export function rentabilidadGrupo(rows: EmpresaConGasto[]): RentabilidadGrupo | null {
  let ventas = 0, utilidad = 0, gastos = 0, n = 0;
  for (const e of rows) {
    if (e.gasto === null) continue;
    ventas += e.ventas;
    utilidad += e.utilidad;
    gastos += e.gasto;
    n++;
  }
  if (n === 0) return null;
  const monto = utilidad - gastos;
  return {
    monto,
    pct: ventas > 0 ? monto / ventas : null,
    ventas,
    utilidad,
    gastos,
    empresasConGasto: n,
  };
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
