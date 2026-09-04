// ─────────────────────────────────────────────────────────────────────────────
// ¿VAMOS ARRIBA O ABAJO DEL RITMO DE LA META? — la cuenta de la línea «🎯 Meta»
// del resumen diario de ACS que sale por Telegram. Módulo PURO: no toca base,
// ni red, ni `new Date()`; todo entra como parámetro.
//
// Daniel, textual (3-sep-2026): *«el mensaje de telegram igual que hoy en día
// solo que diciéndome si están qué porcentaje arriba o abajo para la meta, pero
// tienes que calcular bien cómo hacerlo para hacerlo accurate»* y, al confirmar
// el cálculo: *«es calcular 23% arriba del mismo día año anterior sumando todos
// los días pasados?»* → sí.
//
// ── LA CUENTA ────────────────────────────────────────────────────────────────
// La meta real (sep–dic 2026, $420.000) es un 23% arriba de lo que ESE MISMO
// período vendió el año pasado ($340.698,55). Entonces «ir al ritmo» es llevar
// vendido, día a día, un 23% más que los mismos días del año pasado:
//
//     factor = objetivo ÷ venta del rango COMPLETO un año antes    (1,2328)
//     ritmo  = venta del año pasado desde el inicio hasta corte−1 año × factor
//     %      = vendido ÷ ritmo − 1
//
// El «mismo día» es la MISMA fecha de calendario un año antes (`unAnioAntes`,
// 29-feb → 28-feb), igual que las líneas Mes/Año del mismo mensaje y que todas
// las comparaciones «vs año pasado» del sistema. Como el año pasado ya trae
// adentro que diciembre pesa el 58,8% de la temporada, este ritmo NO es la
// regla de tres por días que la pantalla de Metas rechaza a propósito (ver la
// cabecera de `metas-avance.ts`): es la misma idea de temporada, medida día a
// día en vez de mes a mes.
//
// ── CUÁNDO NO SE OPINA ───────────────────────────────────────────────────────
// · Sin venta del año pasado en el rango completo → no hay factor → `null`.
// · Con ritmo por debajo de la base mínima comparable (`variacionPct`, $100)
//   → `null`. Es el primer día sin comparable: un % contra $0 no dice nada.
// Quien llama, ante `null`, NO pone la línea. El resumen sale igual sin ella.
// ─────────────────────────────────────────────────────────────────────────────

import { variacionPct } from "@/lib/variacion";

export interface EntradaRitmo {
  /** El monto de la meta. */
  objetivo: number;
  /** Vendido desde el inicio de la meta hasta el corte del resumen (inclusive). */
  vendido: number;
  /** Venta del rango COMPLETO de la meta, un año antes (`desde−1a .. hasta−1a`). */
  ventaPrevRango: number;
  /** Venta del año pasado desde `desde−1a` hasta `corte−1a` (inclusive). */
  ventaPrevHastaCorte: number;
}

export interface RitmoMeta {
  vendido: number;
  /** objetivo ÷ ventaPrevRango. */
  factor: number;
  /** Lo que habría que llevar vendido hoy para ir al ritmo de la meta. */
  ritmo: number;
  /** vendido ÷ ritmo − 1, como ratio (0,13 = +13%). */
  pct: number;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** `null` = no hay con qué comparar; la línea no se muestra. */
export function ritmoMeta(e: EntradaRitmo): RitmoMeta | null {
  const objetivo = Number(e.objetivo) || 0;
  const prevRango = Number(e.ventaPrevRango) || 0;
  if (objetivo <= 0 || prevRango <= 0) return null;

  const factor = objetivo / prevRango;
  const ritmo = centavos((Number(e.ventaPrevHastaCorte) || 0) * factor);
  const vendido = centavos(Number(e.vendido) || 0);

  // La MISMA regla de «hay comparativo» que el resto de la app: base < $100 →
  // no hay porcentaje. Cubre el primer día sin comparable y un ritmo en cero.
  const pct = variacionPct(vendido, ritmo);
  if (pct == null) return null;

  return { vendido, factor, ritmo, pct };
}
