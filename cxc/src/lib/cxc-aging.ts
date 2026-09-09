// Vocabulario único de aging para el módulo CXC (desktop /admin).
// Fuente de verdad de los 3 términos + colores; consumido por KpiCards,
// ClientTable, ClientRow y ContactPanel para evitar duplicación.
// (AgingLegend se eliminó en jul-2026 al quitar la leyenda de CXC y Proveedores.)

export type AgingKey = "current" | "watch" | "overdue";

export interface AgingMeta {
  label: string;    // término canónico en español
  range: string;    // rango compacto de días (texto descriptivo: 0-90d / 91-120d / +120d)
  colLabel: string; // rango en el MISMO formato que las columnas de la tabla (0-90d / 91-120d / 121d+)
  rangoLargo: string; // el rango EN PALABRAS, para el papel que lee el cliente
  dot: string;      // clase de fondo para el swatch/punto de color
  text: string;     // clase de texto del color del tramo
}

export const AGING: Record<AgingKey, AgingMeta> = {
  current: { label: "Por vencer", range: "0-90d", colLabel: "0-90d", rangoLargo: "0 a 90 días", dot: "bg-emerald-500", text: "text-emerald-700" },
  watch: { label: "Vencido reciente", range: "91-120d", colLabel: "91-120d", rangoLargo: "91 a 120 días", dot: "bg-amber-500", text: "text-amber-700" },
  overdue: { label: "Vencido crítico", range: "+120d", colLabel: "121d+", rangoLargo: "121 días y más", dot: "bg-red-500", text: "text-red-700" },
};

export const AGING_ORDER: AgingKey[] = ["current", "watch", "overdue"];

/**
 * 🔴 CÓMO SE LLAMA UN TRAMO, EN TODAS PARTES: el nombre y el rango juntos
 * ("Por vencer 0-90d").
 *
 * 🩸 Era EL MISMO BOTÓN CON DOS NOMBRES. En escritorio (`KpiCards`) las
 * píldoras decían solo el rango —"0-90d · 91-120d · 121d+"— y en el celular
 * (`PanelCxcMobile`) solo el nombre —"Por vencer · Vencido reciente · Vencido
 * crítico"—, con la lista de nombres COPIADA adentro de su propio
 * `AGING_THEME`. Quien aprende a cobrar desde el celular no reconoce el botón
 * en la computadora, y al revés. El papel (`pdf-cxc.ts`) ya decía los dos desde
 * jul-2026 y era el único de los tres que se leía sin traducir: se generalizó
 * ese criterio en vez de inventar uno cuarto.
 *
 * ⚠️ NO CAMBIA NI UN NÚMERO NI UN CORTE: los tramos siguen siendo 0-90 /
 * 91-120 / 121+ y las cifras salen de las mismas sumas. Esto es vocabulario.
 */
export function tramoLabel(k: AgingKey): string {
  return `${AGING[k].label} ${AGING[k].colLabel}`;
}

/**
 * 🔴 EL MISMO TRAMO, SIN JUZGARLO — para el papel que lee el CLIENTE
 * (9-sep-2026): «0 a 90 días · 91 a 120 días · 121 días y más».
 *
 * Es el mismo corte y la misma lista: cambia solo cómo se NOMBRA. Va como
 * CUARTO CAMPO de `AGING`, no en un mapa aparte, por lo mismo que el nombre
 * corto de empresa vive al lado del largo: una segunda lista es cómo dos
 * superficies terminan diciendo tramos distintos.
 *
 * ⚠️ POR QUÉ NO SE USA `tramoLabel()` EN EL ESTADO DE CUENTA DEL CLIENTE. Ese
 * rótulo dice «Vencido reciente» y «Vencido crítico», y hay un invariante que
 * lo prohíbe en lo que lee el cliente: `dias` es la EDAD del documento desde su
 * emisión, no días de mora, así que llamarle «vencido» a un documento de 121
 * días afirma algo que el dato no dice. El papel de Switch tampoco los juzga:
 * rotula «0-30 Dias», «31-60 Dias». Candado: `cxc-papel-vocabulario.test.ts`.
 * Adentro de la casa —pantalla, celular, las dos descargas— sigue mandando
 * `tramoLabel()`, que no cambió.
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
