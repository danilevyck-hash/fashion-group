// ─────────────────────────────────────────────────────────────────────────────
// LA FICHA DE UN ARTÍCULO — las TRES respuestas del tab Ventas › Referencia.
// Módulo PURO (sin red, sin DOM, sin "ahora").
//
// La especificación es una frase de Daniel, textual:
//   *"cuánto tiempo demoré en vender mi compra, cuánto por mes, para cuántos
//    meses me queda el stock actual"*
//
// Eso, y nada más. Este archivo produce EXACTAMENTE esos tres números, las
// barras de los 12 meses completos, el precio real de venta y el margen. La
// PANTALLA y el EXCEL lo llaman a ÉL: si cada uno hiciera su cuenta tendríamos
// dos verdades sobre la misma decisión de compra.
//
// 🔴 NUNCA ENTRA EL MES EN CURSO. Medido el 10-ago-2026 en `40HM265001`: los
// "últimos 3 meses" daban 18,3 u/mes con 10 días de agosto adentro y 34,3 con
// meses completos — EL DOBLE. La ventana termina en el mes ANTERIOR a `hoyMes`,
// siempre, y no hay ninguna rama que la corra.
//
// 🔴 LAS NC YA VIENEN RESTADAS. Este módulo recibe `art.serie`, que arma
// `ventasPorMes()` sobre `ventasNetasPorDia()` — el ÚNICO lugar donde se aplica
// `signoTipo()`. Acá NO se vuelve a firmar nada. La firma del error histórico
// del repo es que la diferencia da EXACTO el doble de las notas de crédito.
//
// 🩸 ACÁ NO HAY VEREDICTOS, Y ES A PROPÓSITO. Nada de "comprá N", "se agotó",
// "descontinuado" ni "movimiento lento". Daniel ya rechazó dos diseños por eso:
// él mira los números y decide. Lo único que se agrega a un número crudo es
// DECIR CUÁNDO NO SE PUEDE CALCULAR — que es lo contrario de un veredicto.
// ─────────────────────────────────────────────────────────────────────────────

import { restarMeses } from "./referencia";
import type { ArticuloCompras, CompraMedida, MesVenta } from "./compras";

/** Cuántos meses completos mira la pantalla. */
export const MESES_VENTANA = 12;

/** Los meses fuertes de Daniel, textual: *"ultimos 3 meses del año vendo mas q
 *  los primeros 3 meses del año"*. Se RESALTAN en las barras; NO ajustan ningún
 *  promedio (decisión B de Daniel: el "me queda para X meses" es el número
 *  simple y él lo interpreta). */
export const MESES_FUERTES: readonly number[] = [10, 11, 12];

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "jul 2026" */
export function fmtMesAnio(mes: string): string {
  return `${fmtMesCorto(mes)} ${mes.slice(0, 4)}`;
}

/** "ene" — la etiqueta de una barra. */
export function fmtMesCorto(mes: string): string {
  return MESES_CORTO[Number(mes.slice(5, 7)) - 1] ?? mes.slice(5, 7);
}

/** "9 abr 2025" — el formato de fecha de la casa. */
export function fmtFechaCorta(f: string): string {
  const [a, m, d] = f.split("-");
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1] ?? m} ${a}`;
}

/** "16 meses" / "1 mes" / "menos de 1 mes". Una sola definición para pantalla
 *  y Excel — si difirieran, la misma compra tendría dos duraciones. */
export function textoMeses(meses: number | null): string {
  if (meses == null) return "—";
  const n = Math.round(meses);
  if (n <= 0) return "menos de 1 mes";
  return n === 1 ? "1 mes" : `${n} meses`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Los N meses COMPLETOS anteriores a `hoyMes`, del más viejo al más nuevo.
 *
 * 🔴 `hoyMes` NO entra. En agosto la ventana termina en julio.
 */
export function ultimosMesesCompletos(hoyMes: string, n: number = MESES_VENTANA): string[] {
  const out: string[] = [];
  for (let i = n; i >= 1; i -= 1) out.push(restarMeses(hoyMes, i));
  return out;
}

// ─── Barras ──────────────────────────────────────────────────────────────────

export interface MesBarra {
  mes: string; // YYYY-MM
  /** Unidades NETAS del mes. 0 = el mes existió y no vendió. */
  unidades: number;
  /** Venta NETA del mes, en dólares. */
  venta: number;
  /** oct · nov · dic — los meses fuertes de Daniel. */
  fuerte: boolean;
  /** `true` = el artículo todavía no había vendido nunca. NO es un cero de
   *  venta: es un mes en el que el artículo no estaba en la calle. */
  antesDeEmpezar: boolean;
}

/** El primer mes en que el artículo vendió ALGO, en toda su historia. */
export function primerMesConVenta(serie: readonly MesVenta[]): string | null {
  const conVenta = serie.filter((s) => s.unidades > 0).map((s) => s.mes);
  return conVenta.length ? conVenta.reduce((a, b) => (a < b ? a : b)) : null;
}

/**
 * Las 12 barras. TODOS los meses de la ventana salen siempre, aunque el
 * artículo sea nuevo: si se recortaran, oct-nov-dic cambiarían de lugar de un
 * artículo a otro y dejarían de servir para comparar de un vistazo.
 */
export function barrasDeVentana(
  serie: readonly MesVenta[],
  hoyMes: string,
  n: number = MESES_VENTANA,
): MesBarra[] {
  const porMes = new Map(serie.map((s) => [s.mes, s]));
  const primero = primerMesConVenta(serie);
  return ultimosMesesCompletos(hoyMes, n).map((mes) => ({
    mes,
    unidades: porMes.get(mes)?.unidades ?? 0,
    venta: porMes.get(mes)?.venta ?? 0,
    fuerte: MESES_FUERTES.includes(Number(mes.slice(5, 7))),
    antesDeEmpezar: primero != null && mes < primero,
  }));
}

// ─── "Vendo por mes" ─────────────────────────────────────────────────────────

export interface Promedio {
  /** Unidades por mes. `null` = no vendió nada en la ventana. */
  porMes: number | null;
  /** Unidades netas sumadas. */
  unidades: number;
  /** Venta neta sumada, en dólares. */
  venta: number;
  /** Entre cuántos meses se dividió. */
  meses: number;
  /**
   * `true` = el artículo empezó a venderse DENTRO de la ventana, así que se
   * promedió su vida y no 12 meses.
   *
   * 🩸 Sin esto, un artículo que llegó en diciembre saldría con el promedio
   * dividido entre 12 —o sea la mitad de lo que vende de verdad— y el "me queda
   * para" se iría al doble. Medido en `QD3958033` (llegó 26-dic-2025, 54 u
   * vendidas): 54÷12 = 4,5 u/mes → 28 meses de stock, contra 54÷7 = 7,7 u/mes →
   * 16 meses, que es lo real.
   */
  desdeQueEmpezo: boolean;
}

/**
 * Unidades por mes sobre la ventana de meses completos.
 *
 * El divisor son los meses de la ventana en los que el artículo YA se vendía.
 * Un mes dentro de su vida con cero ventas SÍ divide (es un mes malo, no un mes
 * inexistente); los anteriores a su primera venta NO.
 */
export function promedioMensual(barras: readonly MesBarra[]): Promedio {
  const vivos = barras.filter((b) => !b.antesDeEmpezar);
  const unidades = vivos.reduce((s, b) => s + b.unidades, 0);
  const venta = vivos.reduce((s, b) => s + b.venta, 0);
  const meses = vivos.length;
  return {
    porMes: meses > 0 && unidades > 0 ? unidades / meses : null,
    unidades,
    venta,
    meses,
    desdeQueEmpezo: meses > 0 && meses < barras.length,
  };
}

// ─── "Me queda para" ─────────────────────────────────────────────────────────

/**
 * Meses que alcanza el stock actual al ritmo del promedio.
 *
 * 🔴 SIN AJUSTE DE TEMPORADA — decisión B de Daniel: *el número simple, él lo
 * interpreta*. Las barras con oct-nov-dic marcados son las que le muestran la
 * estacionalidad; meterla acá adentro la escondería dentro de un número que
 * nadie puede reconstruir.
 */
export function mesesDeStock(existencia: number | null, porMes: number | null): number | null {
  if (existencia == null || porMes == null || porMes <= 0) return null;
  if (existencia <= 0) return 0;
  return existencia / porMes;
}

// ─── El margen REAL ──────────────────────────────────────────────────────────

/**
 * 🔴 EL MARGEN VA CONTRA EL CIF, NO CONTRA EL FOB. Las tres razones:
 *
 *  1. **El FOB no es confiable.** En el 93% de las líneas Switch lo manda IGUAL
 *     al CIF — error de carga conocido, medido y sin corregir. Un margen "sobre
 *     FOB" sería el margen sobre CIF disfrazado en el 93% de los artículos y
 *     otro número distinto en el 7% restante: la MISMA columna significando dos
 *     cosas según el artículo, que es peor que no tenerla.
 *  2. **El CIF es lo que costó de verdad** poner la pieza en la bodega de
 *     Panamá (mercancía + flete + seguro). El FOB deja el flete afuera, así que
 *     un margen sobre FOB sale siempre MÁS ALTO que el real — y este número
 *     existe justo para frenar una compra, no para que se vea mejor.
 *  3. **El CIF está en casi todas las líneas.** Donde Switch no desglosa
 *     (Fashion Shoes) el valor único ES el CIF; el FOB de ahí está ESTIMADO
 *     (CIF ÷ 1,1), o sea que un margen sobre FOB sería un margen sobre un
 *     número que nos inventamos nosotros.
 *
 * El costo es el de la ÚLTIMA compra: es contra ese que se decide reponer, y es
 * el mismo que la fila de costos muestra como "CIF de hoy".
 */
export type MotivoSinMargen = "sin-costo" | "sin-ventas" | "precio-no-positivo";

export interface MargenReal {
  /** venta neta ÷ unidades netas de la ventana. A cuánto salió DE VERDAD —
   *  con los descuentos ya adentro, que es lo que el precio de lista no dice. */
  precioReal: number | null;
  /** CIF de la última compra. */
  costo: number | null;
  /** (precio − costo) ÷ precio. `null` = no se puede calcular con confianza. */
  margen: number | null;
  /** `null` = sí se pudo calcular. */
  motivo: MotivoSinMargen | null;
}

/**
 * Precio real promedio, costo y margen.
 *
 * 🩸 CUANDO NO SE PUEDE, SE DICE. Un margen dudoso en la pantalla con la que se
 * decide una compra es peor que un hueco: el hueco se ve, el número malo no.
 */
export function margenReal(
  ventaNeta: number,
  unidadesNetas: number,
  cif: number | null,
): MargenReal {
  if (unidadesNetas <= 0) {
    return { precioReal: null, costo: cif, margen: null, motivo: "sin-ventas" };
  }
  const precioReal = ventaNeta / unidadesNetas;
  if (precioReal <= 0) {
    return { precioReal, costo: cif, margen: null, motivo: "precio-no-positivo" };
  }
  if (cif == null || cif <= 0) {
    return { precioReal, costo: null, margen: null, motivo: "sin-costo" };
  }
  return { precioReal, costo: cif, margen: (precioReal - cif) / precioReal, motivo: null };
}

/** Por qué no hay margen, en español simple y sin jerga. */
export function textoSinMargen(m: MotivoSinMargen, mesesVentana: number): string {
  switch (m) {
    case "sin-costo":
      return "No se puede calcular el margen: la última compra no trae el costo CIF.";
    case "sin-ventas":
      return `No se puede calcular el margen: no vendió nada en ${mesesVentana === 1 ? "el último mes" : `los últimos ${mesesVentana} meses`}, así que no hay precio real.`;
    case "precio-no-positivo":
      return "No se puede calcular el margen: las devoluciones dejaron la venta del período en cero o en negativo.";
  }
}

// ─── Temporada fuerte ────────────────────────────────────────────────────────

export interface Temporada {
  /** Unidades de oct + nov + dic dentro de la ventana. */
  unidades: number;
  /** Unidades de los 12 meses. */
  total: number;
  /** unidades ÷ total. `null` si el total no es positivo. */
  parte: number | null;
  /** `true` = ninguno de sus oct/nov/dic ocurrió todavía (artículo nuevo). */
  todaviaNoPaso: boolean;
}

export function temporadaFuerte(barras: readonly MesBarra[]): Temporada {
  const fuertes = barras.filter((b) => b.fuerte);
  const unidades = fuertes.reduce((s, b) => s + b.unidades, 0);
  const total = barras.reduce((s, b) => s + b.unidades, 0);
  return {
    unidades,
    total,
    parte: total > 0 ? unidades / total : null,
    todaviaNoPaso: fuertes.length > 0 && fuertes.every((b) => b.antesDeEmpezar),
  };
}

// ─── "Mi última compra" ──────────────────────────────────────────────────────

/**
 * 🔴 SIEMPRE ES LA ÚLTIMA COMPRA, aunque no se haya acabado — decisión A de
 * Daniel, textual y explícita. Caer a la última compra AGOTADA contestaría
 * sobre mercancía que ya no está mientras la que se acaba de traer no dice
 * nada, y es justo esa la que se está por reponer.
 */
export interface ResumenCompra {
  /** "240 u en 15 meses" | "todavía no se acaba" */
  titular: string;
  /** "llegó 9 abr 2025 · se acabó jul 2026" | "llegó 180 el 26 dic 2025 · van 54" */
  detalle: string;
  /** `true` = todavía queda mercancía de esta llegada. */
  viva: boolean;
}

export function resumirCompra(c: CompraMedida): ResumenCompra {
  const llego = fmtFechaCorta(c.fecha);
  if (c.estado === "viva" || c.estado === "sin-ventas") {
    // Lo honesto es decir en qué va, no inventarle un plazo que no terminó.
    return {
      titular: "todavía no se acaba",
      detalle: `llegó ${fmtNum(c.unidades)} el ${llego} · van ${fmtNum(c.vendidas)}`,
      viva: true,
    };
  }
  return {
    titular: `${fmtNum(c.unidades)} u en ${textoMeses(c.meses)}`,
    detalle: c.fechaCorte
      ? `llegó ${llego} · se acabó ${fmtMesAnio(c.fechaCorte.slice(0, 7))}`
      : `llegó ${llego}`,
    viva: false,
  };
}

/**
 * La línea de tendencia, en UNA sola línea:
 * `Esta: 240 u en 15 meses · Anterior: 240 u en 7 meses`.
 *
 * Devuelve `null` —y la línea se OMITE, no se rellena con guiones mudos— en dos
 * casos:
 *   · no hay compra anterior;
 *   · 🩸 NINGUNA de las dos se acabó todavía. Medido en `NB2570001`, cuyas dos
 *     últimas compras (11 y 19-feb-2026) siguen vivas bajo FIFO: la línea decía
 *     *"Esta: todavía no se acaba · Anterior: todavía no se acaba"*, o sea la
 *     misma frase dos veces y CERO señal de tendencia. Un renglón que no dice
 *     nada gasta la atención igual que uno que dice algo.
 */
export function lineaComparacion(
  ultima: CompraMedida | null,
  anterior: CompraMedida | null,
): string | null {
  if (!ultima || !anterior) return null;
  const a = resumirCompra(ultima);
  const b = resumirCompra(anterior);
  if (a.viva && b.viva) return null;
  return `Esta: ${a.titular} · Anterior: ${b.titular}`;
}

// ─── La ficha completa ───────────────────────────────────────────────────────

export interface FichaArticulo {
  barras: MesBarra[];
  promedio: Promedio;
  /** Meses que alcanza el stock. `null` = no se puede decir. */
  alcance: number | null;
  margen: MargenReal;
  temporada: Temporada;
  /** La compra más reciente. `null` = no hay ninguna registrada. */
  ultima: CompraMedida | null;
  /** La inmediatamente anterior. `null` = no hay. */
  anterior: CompraMedida | null;
  /** `Esta: … · Anterior: …`, o `null` si no hay anterior. */
  comparacion: string | null;
  /** Compras más viejas que la anterior — detrás de "Ver las N compras
   *  anteriores". Daniel: *"la ultima me basta"*. */
  viejas: CompraMedida[];
}

/**
 * Arma todo lo que la pantalla (y el Excel) muestran de un artículo.
 *
 * `art.compras` viene con la MÁS NUEVA PRIMERO (así la arma `armarArticulo`).
 */
export function armarFicha(art: ArticuloCompras, hoyMes: string): FichaArticulo {
  // `serie ?? []` no es paranoia: una respuesta cacheada por un deploy anterior
  // (o un artículo sin una sola venta) llega sin ella, y las barras vacías son
  // una degradación honesta — reventar la pantalla entera no lo sería.
  const barras = barrasDeVentana(art.serie ?? [], hoyMes);
  const promedio = promedioMensual(barras);
  const ultima = art.compras[0] ?? null;
  const anterior = art.compras[1] ?? null;

  return {
    barras,
    promedio,
    alcance: mesesDeStock(art.existencia, promedio.porMes),
    margen: margenReal(promedio.venta, promedio.unidades, ultima?.costos.cif ?? null),
    temporada: temporadaFuerte(barras),
    ultima,
    anterior,
    comparacion: lineaComparacion(ultima, anterior),
    viejas: art.compras.slice(2),
  };
}
