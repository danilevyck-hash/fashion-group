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

import { formatCompactCurrency, fmtMoneyCompact } from "./format";
import { variacionPct, SIN_COMPARATIVO } from "../variacion";
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
  const ratio = variacionPct(ytd, ytdP);
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
    delta: ratio == null ? SIN_COMPARATIVO : `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toFixed(0)}%`,
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

// ─────────────────────────────────────────────────────────────────────────────
// LA PROYECCIÓN DEL GRUPO — la cuarta tarjeta del Resumen (5-sep-2026).
//
// Daniel: la proyección vivía en la ÚLTIMA celda de la fila negra, al borde
// derecho de una tabla de 15 columnas que hay que arrastrar. Sube a tarjeta,
// al lado de Ventas netas, Utilidad y Margen. La columna «Proyección» de la
// tabla SE QUEDA: ahí se ve empresa por empresa.
//
// 🔴 NO SE INVENTA NADA. `ProyeccionGrupo` no trae `algoritmo` ni
// `frac_ytd_estacional` —esos son de cada empresa—, así que la frase del grupo
// no puede copiar la de una empresa. Los tres números que dice salen TODOS del
// mismo payload de la RPC:
//
//   · «llevabas el X% del año» = Σ `ventas_prev_ytd_sp` de las empresas ÷
//     `cierre_anio_anterior_total`. Es literalmente cuánto del año anterior
//     estaba cumplido a esta misma altura, medido, no estimado.
//   · «cierras en $Y» = `totales_grupo.proyeccion_cierre`, que es la SUMA de la
//     proyección de cada empresa — y la frase lo dice con todas las letras, en
//     vez de dar a entender que sale de una regla de tres del grupo.
//
// ⚠️ NUNCA se nombra una meta. `ventas_proyeccion_cierre_v7` devuelve
// `meta_anual`, `gap_vs_meta` y `status`, y `stripMetasProyeccion` ya los deja
// afuera del payload. Daniel, 5-sep-2026: *«quita meta, no lo uso, prefiero
// proyeccion»*.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo del grupo que hace falta para explicar su proyección. */
export interface ProyeccionGrupoExplicable {
  ventas_ytd: number;
  proyeccion_cierre: number;
  cierre_anio_anterior_total: number;
  delta_vs_anio_anterior_total: number | null;
  /** Σ `ventas_prev_ytd_sp` de las empresas: lo que el grupo llevaba vendido el
   *  año anterior a esta MISMA altura. Se pasa desde afuera porque el bloque
   *  `totales_grupo` no lo trae. */
  ventas_prev_ytd_sp: number;
}

/** Cuánto del año anterior estaba cumplido al día de corte. `null` sin cierre. */
export function fraccionCumplidaGrupo(g: ProyeccionGrupoExplicable): number | null {
  if (!(g.cierre_anio_anterior_total > 0)) return null;
  return g.ventas_prev_ytd_sp / g.cierre_anio_anterior_total;
}

/** La frase que explica la proyección del GRUPO, en castellano llano. */
export function explicacionProyeccionGrupo(
  g: ProyeccionGrupoExplicable,
  prevYear: number,
  opts: { fechaCorte?: string | null } = {},
): string {
  const cierre = fmtMoneyCompact(g.proyeccion_cierre);
  const dia = diaCorto(opts.fechaCorte);
  const frac = fraccionCumplidaGrupo(g);
  const suma = `Suma la proyección de cada empresa: ${cierre}.`;
  if (frac == null) {
    // Sin cierre del año anterior no hay con qué medir la altura del año. Se
    // dice el número y de dónde sale, y no se inventa un porcentaje.
    return suma;
  }
  const pct = Math.round(frac * 100);
  const alDia = dia ? ` al ${dia}` : "";
  return `En ${prevYear}${alDia} llevabas el ${pct}% del año. ${suma}`;
}

/** Los números que sostienen la frase del grupo, como slots del detalle. */
export function buildSlotsProyeccionGrupo(
  g: ProyeccionGrupoExplicable,
  prevYear: number,
  opts: { fechaCorte?: string | null } = {},
): SlotDetalle[] {
  const dia = diaCorto(opts.fechaCorte);
  const ratio = variacionPct(g.ventas_ytd, g.ventas_prev_ytd_sp);
  return [
    {
      key: "ytd",
      label: dia ? `Vas al ${dia}` : "Vas",
      valor: fmtMoneyCompact(g.ventas_ytd),
      prev: g.ventas_prev_ytd_sp > 0 ? fmtMoneyCompact(g.ventas_prev_ytd_sp) : null,
      delta: ratio == null ? SIN_COMPARATIVO : `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toFixed(0)}%`,
      tone: ratio == null ? "neutral" : ratio >= 0 ? "emerald" : "orange",
      destacado: false,
    },
    {
      key: "cierre",
      label: "Cierra en",
      valor: fmtMoneyCompact(g.proyeccion_cierre),
      prev: null,
      delta: "",
      tone: "neutral",
      destacado: true,
    },
    {
      key: "cierre-prev",
      label: `Cerró ${prevYear}`,
      valor: fmtMoneyCompact(g.cierre_anio_anterior_total),
      prev: null,
      delta: "",
      tone: "neutral",
      destacado: false,
    },
  ];
}

/** «+$210,569» / «−$12,000» / «sin comparativo» — el Δ de la tarjeta. */
export function deltaProyeccionTexto(delta: number | null | undefined): string {
  if (delta == null) return SIN_COMPARATIVO;
  return `${delta >= 0 ? "+" : "−"}${fmtMoneyCompact(Math.abs(delta))}`;
}
