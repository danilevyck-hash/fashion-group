// Number / pct / heatmap formatters used across the Ventas module.
// All numbers are rendered with Geist Mono via tailwind utility `font-mono`.

export const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"] as const;
export const QUARTERS = ["Q1","Q2","Q3","Q4"] as const;

// 🔴 EL SIGNO VA DELANTE DEL SÍMBOLO: «−$100.00», nunca «$-100.00»
// (diccionario § 0, #6, decidido por Daniel el 5-sep-2026).
//
// No es cosmética: `$-100.00` se lee de izquierda a derecha como «dólares
// menos cien» y en una columna de números pegados el guion se confunde con el
// separador. `fmtMoneySigned` (utilidad-cliente.ts) ya lo hacía bien desde
// antes — lo que faltaba era que las DOS funciones de esta casa dijeran lo
// mismo, porque las dos se pintan en la misma pantalla.
//
// ⚠️ NINGÚN VALOR CAMBIA. Es el mismo número con el signo en otro lugar; el
// candado `ventas-diccionario-formato.test.ts` lo congela.
function conSigno(sinSigno: string, negativo: boolean): string {
  return (negativo ? "−" : "") + "$" + sinSigno;
}

export function fmtMoney(n: number): string {
  return conSigno(
    Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    n < 0,
  );
}

export function fmtMoneyCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  // `Math.round(-0.4)` da `-0`, que imprime «−$0» y parece una deuda de cero.
  const redondeado = Math.round(Math.abs(n));
  return conSigno(redondeado.toLocaleString("en-US"), n < 0 && redondeado !== 0);
}

/**
 * 🔴 UN PORCENTAJE, SIN DECIMAL — «29%», «−12%», «—» (diccionario § 0, #5,
 * decidido por Daniel el 5-sep-2026).
 *
 * Recibe la FRACCIÓN (0.287), no el número ya multiplicado: los tres módulos
 * que escribían `(x * 100).toFixed(1) + "%"` a mano cada uno por su lado son
 * exactamente cómo el mismo margen salía «28.7%» en el Resumen y «28.73%» en
 * otra pantalla. La multiplicación vive acá y en ningún otro lado.
 *
 * ⚠️ NO se aplica a los PUNTOS de margen («+2.1 pts»): esos son una DIFERENCIA
 * entre dos porcentajes, y a cero decimales «+0.4 pts» se convertiría en «+0
 * pts», que se lee como «no cambió». Son otra unidad y llevan su propia regla
 * (`formatDeltaRatio` en modo `pts`).
 */
export function fmtPorcentaje(fraccion: number | null | undefined): string {
  if (fraccion == null || !Number.isFinite(fraccion)) return "—";
  const v = fraccion * 100;
  // `Math.round(-0.2)` da `-0` → «−0%». Se normaliza a «0%».
  const redondeado = Math.round(Math.abs(v));
  return (v < 0 && redondeado !== 0 ? "−" : "") + redondeado + "%";
}

// "$87K" / "$1.09M" / "$766K". Para el layout mobile del Resumen donde el
// ancho de celda no permite el formato largo. 2 decimales sólo para millones.
export function formatCompactCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
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
 * Símbolo de delta para KPI subtitles (sin zona neutra ±5%). Para subtítulos
 * de cards principales queremos comunicar dirección incluso en cambios chicos.
 *   d > 0 → ▲
 *   d < 0 → ▼
 *   d = 0 ó null → —
 * Bug B (em dash en KPI Utilidad): `deltaSymbol` (threshold) hacía que -2%
 * se renderizara "— -2%". `kpiDeltaSymbol` emite "▼ -2%" para signo claro.
 */
export function kpiDeltaSymbol(d: number | null | undefined): "▲" | "—" | "▼" {
  if (d == null || d === 0) return "—";
  if (d > 0) return "▲";
  return "▼";
}

/**
 * 3-level diverging heatmap, colorblind-safe (pairs always with ▲/—/▼ symbol).
 * Returns Tailwind class fragments — no inline color values.
 *
 * @param d     Delta value. En modo 'pct' es ratio (0.05 = 5%); en 'pts' es
 *              diferencia de ratios (0.005 = 0.5 pts).
 * @param mode  'pct' (default) usa threshold ±5%. 'pts' usa ±0.5 pts (matchea
 *              el "≈0 pts" del formatDelta para que celda gris = sin flecha).
 */
export function heatmapClasses(
  d: number | null | undefined,
  mode: "pct" | "pts" = "pct",
): { bg: string; fg: string } {
  if (d == null) return { bg: "bg-transparent", fg: "text-gray-400" };
  const threshold = mode === "pts" ? 0.005 : 0.05;
  if (d > threshold)  return { bg: "bg-teal-100",    fg: "text-teal-800" };
  if (d < -threshold) return { bg: "bg-orange-200",  fg: "text-orange-900" };
  return                     { bg: "bg-transparent", fg: "text-gray-500" };
}
