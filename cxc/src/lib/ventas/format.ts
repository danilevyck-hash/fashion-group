// Number / pct / heatmap formatters used across the Ventas module.
// All numbers are rendered with Geist Mono via tailwind utility `font-mono`.

export const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"] as const;
export const QUARTERS = ["Q1","Q2","Q3","Q4"] as const;

export function fmtMoney(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtMoneyCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function fmtPct(d: number | null | undefined): string {
  if (d == null) return "—";
  const v = d * 100;
  return (v >= 0 ? "+" : "") + v.toFixed(0) + "%";
}

export function deltaSymbol(d: number | null | undefined): "▲" | "—" | "▼" {
  if (d == null) return "—";
  if (d > 0.05) return "▲";
  if (d < -0.05) return "▼";
  return "—";
}

/**
 * 3-level diverging heatmap, colorblind-safe (pairs always with ▲/—/▼ symbol).
 * Returns Tailwind class fragments — no inline color values.
 */
export function heatmapClasses(d: number | null | undefined): { bg: string; fg: string } {
  if (d == null)        return { bg: "bg-transparent", fg: "text-stone-400" };
  if (d > 0.05)         return { bg: "bg-teal-100",    fg: "text-teal-800" };
  if (d < -0.05)        return { bg: "bg-orange-200",  fg: "text-orange-900" };
  return                       { bg: "bg-transparent", fg: "text-stone-500" };
}
