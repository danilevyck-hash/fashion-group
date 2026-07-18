// ─────────────────────────────────────────────────────────────────────────────
// Cálculos puros del dashboard Vista General (ejecutivo).
// SIN imports de supabase-server ni I/O: funciones puras, unit-testeables
// (src/__tests__/vista-general-calc.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoSemaforo = "verde" | "ambar" | "rojo" | "sin_gastos";

/** Redondeo a centavos (2 decimales). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Prorratea un gasto compartido ('grupo') entre empresas según su % de ventas
 * del mes.
 *
 * Reglas:
 *   - Empresas con ventas <= 0 reciben 0 (no participan del reparto).
 *   - Si el total de ventas participantes es <= 0, todas reciben 0 (no hay
 *     base para prorratear).
 *   - CENT-EXACT: cada parte se redondea a centavos y el residuo del redondeo
 *     se asigna a la empresa con MÁS ventas, para que la suma de las partes sea
 *     EXACTAMENTE grupoTotal — sin esto los redondeos individuales derivan
 *     ±$0.01-0.04 y el total no cuadra al centavo.
 */
export function prorratearGrupo(
  grupoTotal: number,
  ventasPorEmpresa: { key: string; ventas: number }[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of ventasPorEmpresa) out.set(e.key, 0);

  const participantes = ventasPorEmpresa.filter((e) => e.ventas > 0);
  const totalVentas = participantes.reduce((s, e) => s + e.ventas, 0);
  if (totalVentas <= 0 || grupoTotal === 0) return out;

  let asignado = 0;
  let mayor = participantes[0];
  for (const e of participantes) {
    if (e.ventas > mayor.ventas) mayor = e;
    const parte = round2((grupoTotal * e.ventas) / totalVentas);
    out.set(e.key, parte);
    asignado = round2(asignado + parte);
  }
  // Residuo del redondeo → a la empresa más grande (mata el drift de centavos).
  const residuo = round2(grupoTotal - asignado);
  if (residuo !== 0) out.set(mayor.key, round2((out.get(mayor.key) ?? 0) + residuo));
  return out;
}

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

/**
 * Punto de equilibrio: ventas necesarias para cubrir los gastos fijos con el
 * margen bruto actual. null cuando no se puede calcular (margen desconocido o
 * <= 0, o sin gastos fijos cargados).
 */
export function puntoEquilibrio(
  gastosFijos: number,
  margenPct: number | null
): number | null {
  if (margenPct === null || margenPct <= 0 || gastosFijos <= 0) return null;
  return gastosFijos / margenPct;
}
