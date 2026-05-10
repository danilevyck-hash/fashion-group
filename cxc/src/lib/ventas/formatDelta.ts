// Formato unificado para deltas porcentuales en celdas de tablas del módulo
// Ventas. Devuelve la tripleta { arrow, displayValue, tone } para que cada
// consumidor mapee tone → clase Tailwind según su contexto (light/dark bg).
//
// Reglas:
//   - previousValue null/undefined/0 → arrow null, tone stone, "—"
//   - delta entre ±5% (zona neutral) → arrow null, tone stone, pct visible
//   - delta > +5%  → ▲ emerald
//   - delta < -5%  → ▼ orange
//
// La zona neutral devuelve null en arrow para evitar el em dash confuso
// que se mezcla con signo menos en montos negativos.

export type DeltaTone = "emerald" | "orange" | "stone";

export interface DeltaFormat {
  arrow: "▲" | "▼" | null;
  /** "+12%" / "-5%" / "—" cuando no hay comparativo */
  displayValue: string;
  tone: DeltaTone;
}

const NO_COMPARATIVE: DeltaFormat = {
  arrow: null,
  displayValue: "—",
  tone: "stone",
};

/**
 * Calcula y formatea delta a partir de current/previous values.
 * Si previous es null/undefined/0/negativo → returns "sin comparativo" form.
 */
export function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): DeltaFormat {
  if (previous == null || previous <= 0) return NO_COMPARATIVE;
  const delta = ((current ?? 0) - previous) / previous;
  return formatDeltaRatio(delta);
}

/**
 * Variante para callers que ya tienen el ratio precomputado (ej. Vendedora.deltaMarzo
 * o cell.delta de ResumenView). Misma lógica de display que formatDelta.
 */
export function formatDeltaRatio(delta: number | null | undefined): DeltaFormat {
  if (delta == null) return NO_COMPARATIVE;
  const pctStr = (delta >= 0 ? "+" : "") + (delta * 100).toFixed(0) + "%";
  if (delta > 0.05) {
    return { arrow: "▲", displayValue: pctStr, tone: "emerald" };
  }
  if (delta < -0.05) {
    return { arrow: "▼", displayValue: pctStr, tone: "orange" };
  }
  return { arrow: null, displayValue: pctStr, tone: "stone" };
}
