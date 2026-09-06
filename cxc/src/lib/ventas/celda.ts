// Matemática de una celda del heatmap de Ventas — pura y compartida.
//
// Vivía duplicada en ResumenView (desktop) y ResumenViewMobile (mobile), con
// dos implementaciones equivalentes pero separadas. Al mover el detalle de la
// celda del tooltip flotante al panel lateral, las dos vistas y el panel tienen
// que dar EXACTAMENTE el mismo número, así que la matemática vive acá.

import { fmtMoney, fmtMoneyCompact, fmtPorcentaje } from "./format";
import { formatDeltaRatio } from "./formatDelta";
import { baseComparable, variacionPct, BASE_MIN_COMPARATIVO, SIN_COMPARATIVO, SIN_DATO } from "../variacion";

export type ViewMode = "ventas" | "utilidad" | "margen";

/** Las 4 fuentes de una celda: período actual + mismo período del año previo. */
export interface CeldaBase {
  ventas: number | null;
  ventasPrev: number;
  utilidad: number | null;
  utilidadPrev: number;
}

// Por debajo de $100 de ventas el ratio utilidad/ventas no es informativo
// (mismo guard que Detalle Mensual). Es el mismo número que
// BASE_MIN_COMPARATIVO —la regla del Δ%— y se ata acá para que no diverjan.
export const MARGEN_VENTAS_MIN = BASE_MIN_COMPARATIVO;

export function marginRatio(ventas: number, utilidad: number): number | null {
  if (ventas < MARGEN_VENTAS_MIN) return null;
  return utilidad / ventas;
}

/** Valor de la celda en el modo activo. Margen: ratio 0..1, o null sin base. */
export function cellValue(c: Pick<CeldaBase, "ventas" | "utilidad">, mode: ViewMode): number | null {
  if (c.ventas == null || c.utilidad == null) {
    return mode === "margen" ? null : (mode === "utilidad" ? c.utilidad : c.ventas);
  }
  if (mode === "margen") return marginRatio(c.ventas, c.utilidad);
  if (mode === "utilidad") return c.utilidad;
  return c.ventas;
}

export function cellPrevValue(c: Pick<CeldaBase, "ventasPrev" | "utilidadPrev">, mode: ViewMode): number {
  if (mode === "margen") return marginRatio(c.ventasPrev, c.utilidadPrev) ?? 0;
  if (mode === "utilidad") return c.utilidadPrev;
  return c.ventasPrev;
}

/**
 * Delta cur vs prev en el modo activo:
 *   margen             → diferencia de ratios (−0.038 = −3.8 pts)
 *   ventas / utilidad  → ratio (cur−prev)/prev
 * null cuando no es comparable.
 */
export function cellDelta(c: CeldaBase, mode: ViewMode): number | null {
  const cur = cellValue(c, mode);
  if (cur == null) return null;
  if (mode === "margen") {
    const prevMargen = marginRatio(c.ventasPrev, c.utilidadPrev);
    if (prevMargen == null) return null;
    return cur - prevMargen;
  }
  // La regla del Δ% vive en variacion.ts — acá NO se escribe la división.
  // Con `prev <= 0` el mes de $0,01 de Multifashion (mayo 2024) pasaba y la
  // celda de mayo 2025 pintaba "+363024750%".
  return variacionPct(cur, cellPrevValue(c, mode));
}

/** Hay valor actual pero la base del año previo no sirve para comparar → "n/a". */
export function isNaComparison(c: Pick<CeldaBase, "ventasPrev" | "utilidadPrev">, mode: ViewMode): boolean {
  if (mode === "margen") return marginRatio(c.ventasPrev, c.utilidadPrev) == null;
  return !baseComparable(cellPrevValue(c, mode));
}

export function deltaModeFor(mode: ViewMode): "pct" | "pts" {
  return mode === "margen" ? "pts" : "pct";
}

/** Valor compacto para la celda de la tabla ("$1,234,567" / "29%"). */
export function renderCellValue(v: number | null, mode: ViewMode): string {
  if (v == null) return "—";
  // 🔴 El porcentaje va SIN DECIMAL y por `fmtPorcentaje`, la única definición
  // (diccionario § 0, #5). Acá decía `(v * 100).toFixed(1)` escrito a mano.
  if (mode === "margen") return fmtPorcentaje(v);
  return fmtMoneyCompact(v);
}

/**
 * El Δ tal como se pinta DEBAJO del monto, en la propia celda del heatmap.
 *
 * Por qué existe: Daniel escanea la fila de una empresa para saber QUÉ MESES
 * subieron y CUÁNTO ("en mayo 2026 Vistana salía 5%"). Con solo la flecha ▲/▼
 * sabe la dirección pero no la magnitud, y tiene que tocar celda por celda.
 * El % estuvo a la vista entre el 1-jun y el 25-jul-2026 (f81455a5) y se perdió
 * como daño colateral del #279, que reemplazó el tooltip por el panel lateral.
 *
 * `null` = no hay nada honesto que pintar (mes futuro, o sin base comparativa
 * cuando ni siquiera hay valor actual): la celda queda con el monto solo.
 */
export interface DeltaCelda {
  /** Ya listo para pintar: "▲ +36%", "-12%", "+2.1 pts", "≈0 pts", "n/a". */
  texto: string;
  tone: "emerald" | "orange" | "neutral";
}

/**
 * 🔴 «n/a» SE DICE CON PALABRAS — Daniel, 5-sep-2026: *el sistema tiene razón,
 * la palabra es la que no dice nada*.
 *
 * QUÉ PASABA: Joystep salía «n/a» de febrero a junio porque en 2025 **no vendió
 * nada hasta julio**. La cuenta estaba bien (`isNaComparison`: hay valor este
 * año y no hay base el anterior) y la sigla no explicaba nada. Ahora la celda
 * dice qué pasó el año pasado, que es la razón por la que no hay comparación.
 *
 * 🔑 SON DOS CASOS Y NO UNO, y por eso son dos frases. La base puede no servir
 * porque fue **cero** —no vendió— o porque fue **menos de $100**, el piso de
 * `BASE_MIN_COMPARATIVO`: ahí sí vendió, y decir «no vendiste» sería falso.
 * `prevBase` es lo que separa las dos; sin ese dato se cae a la sigla de antes,
 * que nunca miente.
 */
export const SIN_VENTA_ANTERIOR = "no vendiste";
export const VENTA_ANTERIOR_MINIMA = "casi no vendiste";

export function textoSinComparativo(prevBase: number | null | undefined): string {
  if (prevBase == null || !Number.isFinite(prevBase)) return SIN_COMPARATIVO;
  return prevBase <= 0 ? SIN_VENTA_ANTERIOR : VENTA_ANTERIOR_MINIMA;
}

/**
 * @param delta Δ ya calculado (cellDelta o el que arme el caller para totales).
 * @param na    true cuando hay valor actual pero NO hay base del año previo.
 * @param prevBase Base del período anterior, para poder decir POR QUÉ no hay
 *                 comparación. Omitirla deja la sigla de siempre.
 */
export function deltaCelda(
  delta: number | null,
  mode: ViewMode,
  na = false,
  prevBase?: number | null,
): DeltaCelda | null {
  if (delta == null) return na ? { texto: textoSinComparativo(prevBase), tone: "neutral" } : null;
  const fmt = formatDeltaRatio(delta, deltaModeFor(mode));
  return {
    texto: `${fmt.arrow ? `${fmt.arrow} ` : ""}${fmt.displayValue}`,
    tone: fmt.tone === "emerald" ? "emerald" : fmt.tone === "orange" ? "orange" : "neutral",
  };
}

/** Un dato de la fila transformada: etiqueta + Δ arriba, valor abajo. */
export interface SlotDetalle {
  key: string;
  /** "Ventas" / "Utilidad" / "Margen". Se pinta en mayúsculas. */
  label: string;
  /** Valor del período que se tocó, ya formateado ("$112,631" / "25.2%"). */
  valor: string;
  /** Mismo período del año previo. null cuando no hay comparativo o cuando la
   *  fila va compacta (celular): ahí no entra y se cae este dato primero. */
  prev: string | null;
  /** Δ ya formateado ("▲ +36%", "≈0 pts", "n/a", "—"). */
  delta: string;
  tone: "emerald" | "orange" | "neutral";
  /** true en la métrica que corresponde al toggle activo de la tabla. */
  destacado: boolean;
}

const METRICAS: Array<{ mode: ViewMode; label: string }> = [
  { mode: "ventas", label: "Ventas" },
  { mode: "utilidad", label: "Utilidad" },
  { mode: "margen", label: "Margen" },
];

/**
 * Las 3 métricas de una celda (Ventas, Utilidad, Margen) listas para la fila
 * transformada: valor del período, del mismo período del año previo y Δ.
 *
 * `conPrev=false` (celular) omite el monto del año previo: en 390 px los 3
 * datos + el nombre + la × no entran de otra forma, y el Δ ya dice el cambio.
 */
export function buildSlotsMetrica(
  cell: CeldaBase,
  highlight: ViewMode,
  conPrev = true,
): SlotDetalle[] {
  return METRICAS.map(({ mode, label }) => {
    const cur = cellValue(cell, mode);
    const prev = cellPrevValue(cell, mode);
    const delta = cellDelta(cell, mode);
    const fmt = formatDeltaRatio(delta, deltaModeFor(mode));
    const na = isNaComparison(cell, mode);
    return {
      key: mode,
      label,
      valor: renderCellValue(cur, mode),
      prev: conPrev && prev > 0 ? renderCellValue(prev, mode) : null,
      delta:
        delta == null
          // Mismo criterio que la celda: sin comparación, se dice POR QUÉ.
          ? (na && cur != null ? textoSinComparativo(prev) : SIN_DATO)
          : `${fmt.arrow ? `${fmt.arrow} ` : ""}${fmt.displayValue}`,
      tone: delta == null ? "neutral" : fmt.tone === "emerald" ? "emerald" : fmt.tone === "orange" ? "orange" : "neutral",
      destacado: mode === highlight,
    } satisfies SlotDetalle;
  });
}

/**
 * Identidad de la celda que se tocó, para devolverle el foco cuando la fila
 * transformada se cierra. Lleva prefijo de vista (`d` desktop / `m` celular)
 * porque las dos tablas viven en el mismo árbol y una está oculta.
 */
export function celdaKey(vista: "d" | "m", filaId: string, columna: string): string {
  return `${vista}:${filaId}:${columna}`;
}
