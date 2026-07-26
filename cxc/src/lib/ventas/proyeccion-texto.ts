// Cómo se explica la proyección de cierre en la pantalla de Ventas.
//
// El #296 movió el desglose del panel lateral a la fila transformada y en el
// camino se perdió la línea que decía CÓMO salía el número. Volvió, pero no
// como venía: antes era la fórmula cruda ("Proyección = YTD / fracción = $X"),
// que a un dueño de negocio no le dice nada. Ahora es una frase en castellano
// llano, del tipo "El año pasado, a esta altura, llevabas el 56% del año — a
// ese ritmo cierras en $2.1M".
//
// Vive acá y no en el componente porque la usan la tabla de escritorio y la de
// celular, y porque una frase que explica un número es exactamente el tipo de
// cosa que hay que poder testear sin montar un DOM.

import { formatCompactCurrency } from "./format";
import type { SlotDetalle } from "./celda";

/** Lo mínimo de ProyeccionEmpresa que hace falta para explicar el número. */
export interface ProyeccionExplicable {
  ventas_ytd: number;
  ventas_prev_ytd_sp: number;
  cierre_anio_anterior: number;
  proyeccion_cierre: number;
  algoritmo: "estacional" | "mixto" | "fallback_lineal";
  frac_ytd_estacional: number | null;
  factor_final: number | null;
  es_fallback_lineal?: boolean | null;
}

/** "2026-07-26" → "26 jul". Vacío si no hay fecha de corte. */
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function diaCorto(fechaCorte: string | null | undefined): string {
  if (!fechaCorte) return "";
  const [, m, d] = fechaCorte.split("-").map((x) => Number(x));
  if (!m || !d || m < 1 || m > 12) return "";
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

/**
 * La frase que explica de dónde sale la proyección.
 *
 * `corto` recorta para el celular: en 390 px la fila transformada da ~40
 * caracteres antes de truncar, así que ahí se dice solo el gancho.
 */
export function explicacionProyeccion(
  p: ProyeccionExplicable,
  prevYear: number,
  opts: { fechaCorte?: string | null; corto?: boolean } = {},
): string {
  const cierre = formatCompactCurrency(p.proyeccion_cierre);
  const dia = diaCorto(opts.fechaCorte);
  const alDia = dia ? ` al ${dia}` : "";

  // Rama estacional: se usa la FORMA del año anterior (qué porcentaje del año
  // llevaba cumplido a esta misma altura) para estirar lo que va del actual.
  if (!p.es_fallback_lineal && p.algoritmo === "estacional" && p.frac_ytd_estacional != null) {
    const pct = Math.round(p.frac_ytd_estacional * 100);
    if (opts.corto) return `En ${prevYear} llevabas ${pct}% del año`;
    return `En ${prevYear}${alDia} llevabas el ${pct}% del año. A ese ritmo cierras en ${cierre}.`;
  }

  // Rama mixta: el crecimiento medido se aplica al cierre real del año previo.
  if (!p.es_fallback_lineal && p.algoritmo === "mixto" && p.factor_final != null) {
    const pct = Math.round((p.factor_final - 1) * 100);
    const dir = pct === 0 ? "igual que" : pct > 0 ? `${pct}% arriba de` : `${Math.abs(pct)}% abajo de`;
    if (opts.corto) return `Vas ${dir} ${prevYear}`;
    return `Vas ${dir} ${prevYear}. Aplicado al cierre de ${prevYear} (${formatCompactCurrency(p.cierre_anio_anterior)}), cierras en ${cierre}.`;
  }

  // Fallback lineal: no hay historia suficiente, se estira el promedio.
  if (opts.corto) return "Promedio de lo que va del año";
  return `Sin historia suficiente de ${prevYear}: se estira el promedio de lo que va del año hasta ${cierre}.`;
}

/**
 * Los números que sostienen la frase, como slots de la fila transformada.
 *
 * Escritorio lleva 3 (los mismos que las filas de métricas) y el celular 2. No
 * hay un slot con el nombre del método: medido en 1440 px, agregarlo empujaba
 * la frase de 436 a 449 px y la truncaba — y la frase YA dice cómo se calcula.
 */
export function buildSlotsProyeccion(
  p: ProyeccionExplicable,
  prevYear: number,
  opts: { fechaCorte?: string | null; compacto?: boolean } = {},
): SlotDetalle[] {
  const ytd = p.ventas_ytd;
  const ytdP = p.ventas_prev_ytd_sp;
  const ratio = ytdP > 0 ? (ytd - ytdP) / ytdP : null;
  const dia = diaCorto(opts.fechaCorte);

  const cierra: SlotDetalle = {
    key: "cierre",
    label: "Cierra en",
    valor: formatCompactCurrency(p.proyeccion_cierre),
    prev: null,
    delta: "",
    tone: "neutral",
    destacado: true,
  };
  const vas: SlotDetalle = {
    key: "ytd",
    label: dia ? `Vas al ${dia}` : "Vas",
    valor: formatCompactCurrency(ytd),
    prev: opts.compacto || ytdP <= 0 ? null : formatCompactCurrency(ytdP),
    delta: ratio == null ? "—" : `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toFixed(0)}%`,
    tone: ratio == null ? "neutral" : ratio >= 0 ? "emerald" : "orange",
    destacado: false,
  };

  if (opts.compacto) return [vas, cierra];

  return [
    vas,
    cierra,
    {
      key: "cierre-prev",
      label: `Cerró ${prevYear}`,
      valor: formatCompactCurrency(p.cierre_anio_anterior),
      prev: null,
      delta: "",
      tone: "neutral",
      destacado: false,
    },
  ];
}
