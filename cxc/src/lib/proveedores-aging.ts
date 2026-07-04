// Puente entre los 8 buckets de aging de Switch (CxP) y el vocabulario único
// de aging del sistema (lib/cxc-aging: Por vencer / Vencido reciente / Vencido
// crítico). Client-safe (sin deps de servidor): lo consumen la lista, el
// detalle y el export de Proveedores, y buildList en lib/proveedores.ts.

import type { AgingKey } from "@/lib/cxc-aging";

/** Tramo CXC de cada bucket de Switch: 0-90 por vencer, 91-120 reciente, 121+ crítico. */
export function agingKeyForBucket(title: string): AgingKey {
  if (title === "0-30" || title === "31-60" || title === "61-90") return "current";
  if (title === "91-120") return "watch";
  return "overdue";
}

export interface CondensedAging {
  current: number;
  watch: number;
  overdue: number;
}

/** Condensa buckets de Switch a los 3 tramos del vocabulario CXC. */
export function condenseAging(aging: { title: string; saldo: number }[] | null | undefined): CondensedAging {
  const t: CondensedAging = { current: 0, watch: 0, overdue: 0 };
  for (const b of aging ?? []) t[agingKeyForBucket(b.title)] += Number(b.saldo);
  return { current: round2(t.current), watch: round2(t.watch), overdue: round2(t.overdue) };
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
