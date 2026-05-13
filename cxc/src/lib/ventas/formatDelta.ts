// Formato unificado para deltas en celdas de tablas del módulo Ventas.
// Devuelve la tripleta { arrow, displayValue, tone } para que cada consumidor
// mapee tone → clase Tailwind según su contexto (light/dark bg).
//
// Soporta dos modos:
//   - 'pct' (default): delta como ratio decimal (0.12 = +12%). Thresholds
//     ±5% para color. Zona neutral muestra el % sin flecha.
//   - 'pts': delta en puntos porcentuales (margen actual − margen previo,
//     ambos como ratio). Thresholds ±0.5 pts para color. Zona neutral
//     muestra "≈0 pts" stone sin flecha (matchea polish de Detalle Mensual).
//
// La zona neutral devuelve null en arrow para evitar el em dash confuso
// que se mezcla con signo menos en montos negativos.

export type DeltaTone = "emerald" | "orange" | "stone";

export interface DeltaFormat {
  arrow: "▲" | "▼" | null;
  /** "+12%" / "-5%" / "+2.1 pts" / "≈0 pts" / "—" cuando no hay comparativo */
  displayValue: string;
  tone: DeltaTone;
}

const NO_COMPARATIVE: DeltaFormat = {
  arrow: null,
  displayValue: "—",
  tone: "stone",
};

export type DeltaMode = "pct" | "pts";

/**
 * Calcula y formatea delta a partir de current/previous values.
 * Si previous es null/undefined/0/negativo → returns "sin comparativo" form.
 * El modo 'pts' acá no aplica — para puntos porcentuales usar formatDeltaPts
 * con los márgenes ya calculados, o formatDeltaRatio con mode='pts'.
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
 * Variante para callers que ya tienen el delta precomputado.
 *
 * @param delta En modo 'pct': ratio (0.12 = +12%). En modo 'pts': diferencia
 *              de ratios (0.021 = +2.1 pts).
 * @param mode  'pct' (default) o 'pts'.
 */
export function formatDeltaRatio(
  delta: number | null | undefined,
  mode: DeltaMode = "pct",
): DeltaFormat {
  if (delta == null) return NO_COMPARATIVE;

  if (mode === "pts") {
    const pts = delta * 100;
    const absPts = Math.abs(pts);
    // < 0.5 pts es ruido — mismo guard que Detalle Mensual ("≈0%")
    if (absPts < 0.5) {
      return { arrow: null, displayValue: "≈0 pts", tone: "stone" };
    }
    const ptsStr = (pts >= 0 ? "+" : "−") + absPts.toFixed(1) + " pts";
    if (pts > 0) return { arrow: "▲", displayValue: ptsStr, tone: "emerald" };
    return { arrow: "▼", displayValue: ptsStr, tone: "orange" };
  }

  // mode === 'pct'
  const pctStr = (delta >= 0 ? "+" : "") + (delta * 100).toFixed(0) + "%";
  if (delta > 0.05) {
    return { arrow: "▲", displayValue: pctStr, tone: "emerald" };
  }
  if (delta < -0.05) {
    return { arrow: "▼", displayValue: pctStr, tone: "orange" };
  }
  return { arrow: null, displayValue: pctStr, tone: "stone" };
}
