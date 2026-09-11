// ─────────────────────────────────────────────────────────────────────────────
// LA FILA DEL AÑO EN «MES A MES» DE MULTIFASHION — módulo PURO (11-sep-2026).
//
// 🩸 El año se decía DOS veces en la misma pantalla y con números distintos: la
// tarjeta «Año» usa `overview.retail.ytdVentas` (los 12 meses) y la fila «YTD»
// de «Mes a mes» sumaba SOLO los meses con base del año anterior. Medido contra
// producción el 11-sep-2026: 2025 → **$652.420,19** en la tarjeta y
// **$509.291,64** en la fila (ene–abr 2025 no tienen 2024).
//
// Regla:
//   · el TOTAL de la fila es el de la tarjeta (`totalAnio`), sin sumar nada acá;
//   · el Δ se mide sobre los meses COMPARABLES (los que tienen base), porque
//     comparar 12 meses contra 8 sería inventar un porcentaje;
//   · cuando no todos los meses con dato son comparables, la fila lo DICE
//     («Δ sobre los 8 meses que tienen 2024: $509,291.64 vs $477,843.10»);
//   · la fila se llama «Año», no «YTD» — la sigla que el rediseño dio por retirada.
// ─────────────────────────────────────────────────────────────────────────────

import { variacionPct } from "@/lib/variacion";

export const ROTULO_FILA_ANIO = "Año";

export interface MesComparable {
  label: string;
  v: number;
  vPrev: number | null;
}

export interface FilaAnio {
  /** El MISMO número de la tarjeta «Año». */
  total: number;
  /** La base del año anterior sobre los meses comparables; `null` sin ninguno. */
  totalPrev: number | null;
  pct: number | null;
  abs: number | null;
  /** Sobre cuántos meses se midió el Δ, solo cuando no son todos. */
  nota: string | null;
}

const fmt = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function filaAnio({
  totalAnio,
  meses,
  prevYear,
}: {
  totalAnio: number;
  meses: readonly MesComparable[];
  prevYear: number;
}): FilaAnio {
  const comparables = meses.filter((m) => m.vPrev != null);
  if (comparables.length === 0) {
    return { total: totalAnio, totalPrev: null, pct: null, abs: null, nota: null };
  }
  const tot = comparables.reduce((s, m) => s + m.v, 0);
  const totPrev = comparables.reduce((s, m) => s + (m.vPrev ?? 0), 0);
  const pct = variacionPct(tot, totPrev);
  const abs = tot - totPrev;
  const nota =
    comparables.length < meses.length
      ? `Δ sobre los ${comparables.length} meses que tienen ${prevYear}: ${fmt(tot)} vs ${fmt(totPrev)}`
      : null;
  return { total: totalAnio, totalPrev: totPrev, pct, abs, nota };
}
