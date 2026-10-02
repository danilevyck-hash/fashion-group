// Vocabulario único de aging para el módulo CXC (desktop /admin).
// Fuente de verdad de los 3 términos + colores; consumido por KpiCards,
// ClientTable, ClientRow y ContactPanel para evitar duplicación.
// (AgingLegend se eliminó en jul-2026 al quitar la leyenda de CXC y Proveedores.)

export type AgingKey = "current" | "watch" | "overdue";

export interface AgingMeta {
  label: string;    // el rango EN DÍAS, ancho: «0-90 días» (pantalla, PDF, Excel, papel del cliente)
  range: string;    // el mismo rango, angosto: «0-90 d»
  colLabel: string; // el rango angosto de chips y columnas: «0-90 d · 91-120 d · +120 d»
  rangoLargo: string; // el rango ancho para el papel que lee el cliente (= label)
  dot: string;      // clase de fondo para el swatch/punto de color
  text: string;     // clase de texto del color del tramo
}

export const AGING: Record<AgingKey, AgingMeta> = {
  current: { label: "0-90 días", range: "0-90 d", colLabel: "0-90 d", rangoLargo: "0-90 días", dot: "bg-emerald-500", text: "text-emerald-700" },
  watch: { label: "91-120 días", range: "91-120 d", colLabel: "91-120 d", rangoLargo: "91-120 días", dot: "bg-amber-500", text: "text-amber-700" },
  overdue: { label: "+120 días", range: "+120 d", colLabel: "+120 d", rangoLargo: "+120 días", dot: "bg-red-500", text: "text-red-700" },
};

export const AGING_ORDER: AgingKey[] = ["current", "watch", "overdue"];

/**
 * 🔴 CÓMO SE LLAMA UN TRAMO, EN TODAS PARTES: SOLO EL RANGO («0-90 días»).
 *
 * 1-oct-2026, Daniel: nombres normales de ERP — la antigüedad de saldos va
 * SOLO en rangos, sin «Por vencer / Vencido reciente / Vencido crítico / Al
 * día», en CxC, Boston, ficha, hover, celular, PDF y Excel. Un solo formato:
 * ancho «0-90 días · 91-120 días · +120 días» y, donde no cabe (chips y
 * columnas angostas), «0-90 d · 91-120 d · +120 d».
 *
 * 🩸 Antes era EL MISMO BOTÓN CON DOS NOMBRES (escritorio con el rango, celular
 * con el nombre). Desde aquí sale un solo nombre para todas las superficies.
 *
 * ⚠️ NO CAMBIA NI UN NÚMERO NI UN CORTE: los tramos siguen siendo 0-90 /
 * 91-120 / 121+ y las cifras salen de las mismas sumas. Esto es vocabulario.
 */
export function tramoLabel(k: AgingKey): string {
  return AGING[k].label;
}

/**
 * EL MISMO TRAMO, SIN JUZGARLO — para el papel que lee el CLIENTE. `dias` es la
 * EDAD del documento desde su emisión, no días de mora: llamarle «vencido» a
 * un documento de 121 días afirma algo que el dato no dice (candado
 * `cxc-papel-vocabulario.test.ts`). Desde el 1-oct-2026 dice lo mismo que
 * `tramoLabel()`; se queda como función propia porque el papel la nombra.
 */
export function tramoRango(k: AgingKey): string {
  return AGING[k].rangoLargo;
}

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
