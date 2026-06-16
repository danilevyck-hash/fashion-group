// Vocabulario único de aging para el módulo CXC (desktop /admin).
// Fuente de verdad de los 3 términos + colores; consumido por KpiCards,
// AgingLegend, ClientTable, ClientRow, ContactPanel para evitar duplicación.

export type AgingKey = "current" | "watch" | "overdue";

export interface AgingMeta {
  label: string;    // término canónico en español
  range: string;    // rango compacto de días (texto descriptivo: 0-90d / 91-120d / +120d)
  colLabel: string; // rango en el MISMO formato que las columnas de la tabla (0-90d / 91-120d / 121d+)
  dot: string;      // clase de fondo para el swatch/punto de color
  text: string;     // clase de texto del color del tramo
}

export const AGING: Record<AgingKey, AgingMeta> = {
  current: { label: "Por vencer", range: "0-90d", colLabel: "0-90d", dot: "bg-emerald-500", text: "text-emerald-700" },
  watch: { label: "Vencido reciente", range: "91-120d", colLabel: "91-120d", dot: "bg-amber-500", text: "text-amber-700" },
  overdue: { label: "Vencido crítico", range: "+120d", colLabel: "121d+", dot: "bg-red-500", text: "text-red-700" },
};

export const AGING_ORDER: AgingKey[] = ["current", "watch", "overdue"];

/** Días transcurridos desde una fecha ISO hasta hoy (null si no hay fecha válida). */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/**
 * Color de los "días transcurridos" con la MISMA escala del aging:
 * gris ≤90 · ámbar 91-120 · rojo >120. Gris claro si no hay dato.
 */
export function daysAgingColor(days: number | null): string {
  if (days == null) return "text-gray-300";
  if (days <= 90) return "text-gray-500";
  if (days <= 120) return "text-amber-600";
  return "text-red-600";
}
