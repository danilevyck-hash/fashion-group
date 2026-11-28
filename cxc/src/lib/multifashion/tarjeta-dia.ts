// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA DEL DÍA de Multifashion › Resumen (`MULTIFASHION_TARJETA_DIA_2026_11`).
// Módulo PURO: sirve a la ruta `/api/multifashion/dia` y a la tarjeta.
//
// 🔴 NINGUNA FUENTE NUEVA:
//   · venta y tickets = `_multifashion_sf_vw` retail (`retail-dia.ts`, NC restan,
//     tickets = COUNT(*) de documentos, el mismo número del Resumen).
//   · el año pasado = el MISMO DÍA DE LA SEMANA, fecha − 364 d: la regla del
//     Telegram de ACS (`ventanasResumen().fechaComparable`). «Hoy» se compara
//     con ese día COMPLETO.
//   · margen = `switch_articulo_diario` (NC restan, sin ND), que llega de
//     madrugada: hoy no tiene costo. Desde el 28-nov-2026 hoy va ESTIMADO
//     (`margen-estimado.ts`, `MULTIFASHION_MARGEN_ESTIMADO_2026_11`); si Switch
//     no contesta, dice «mañana».
//   · horas = las 3 horas seguidas de mayor venta (`bloqueDeHoras`, la misma
//     cuenta de «Últimos 12 meses»), sobre las facturas del día.
// ─────────────────────────────────────────────────────────────────────────────

import { variacionPct } from "@/lib/variacion";
import { porcentajeDeLaTabla } from "@/lib/ventas/celular";
import { bloqueDeHoras, etiquetaHoras } from "@/lib/multifashion/historico";

export interface DiaDeLaTarjeta {
  fecha: string;
  /** fecha − 364 d (mismo día de la semana del año pasado). */
  equivalente: string;
  esHoy: boolean;
  venta: number;
  tickets: number;
  ventaPrevia: number;
  ticketsPrevios: number;
  /** El año pasado tiene venta cargada antes del equivalente: sin eso, un $0 no se afirma. */
  hayHistoriaPrevia: boolean;
  /** Fracción (0.34). `null` = sin costo (hoy, o el día sin artículos). */
  margen: number | null;
  /** `true` = el margen de hoy es ESTIMADO (costo actual del artículo), no el de Switch. */
  margenEstimado: boolean;
  /** Fracción de la venta con costo conocido en el estimado; `null` si no es estimado. */
  cobertura: number | null;
  /** Venta por hora de Panamá, 24 posiciones. */
  horas: number[];
}

export function fechaEquivalente(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 364);
  return d.toISOString().slice(0, 10);
}

export function esFechaValida(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) === fecha;
}

const DIA = (fecha: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-PA", { ...opts, timeZone: "UTC" }).format(new Date(`${fecha}T12:00:00Z`)).replace(/[.,]/g, "");

/** «Sábado 21 de noviembre» · «Hoy, viernes 27 de noviembre». */
export function tituloDelDia(fecha: string, esHoy: boolean): string {
  const largo = DIA(fecha, { weekday: "long", day: "numeric", month: "long" });
  return esHoy ? `Hoy, ${largo}` : largo.charAt(0).toUpperCase() + largo.slice(1);
}

/** «contra el sábado 22 nov 2025» · «en curso · contra el viernes 28 nov 2025». */
export function subtituloDelDia(equivalente: string, esHoy: boolean): string {
  const d = new Date(`${equivalente}T12:00:00Z`);
  const wd = DIA(equivalente, { weekday: "long" });
  const mes = DIA(equivalente, { month: "short" });
  const texto = `contra el ${wd} ${d.getUTCDate()} ${mes} ${d.getUTCFullYear()}`;
  return esHoy ? `en curso · ${texto}` : texto;
}

export interface CambioDelDia {
  texto: string;
  tono: "up" | "dn" | "fl";
}

/**
 * El % contra el año pasado, con el MISMO texto, color y umbral que las tablas
 * (±5 % en gris sin flecha; bajo 1 % con un decimal). El equivalente en $0 con
 * historia cargada: «sin venta año pasado». Base bajo $100: sin %.
 */
export function cambioDelDia(d: Pick<DiaDeLaTarjeta, "venta" | "ventaPrevia" | "hayHistoriaPrevia">): CambioDelDia | null {
  if (d.ventaPrevia === 0) return d.hayHistoriaPrevia ? { texto: "sin venta año pasado", tono: "fl" } : null;
  const r = variacionPct(d.venta, d.ventaPrevia);
  return r == null ? null : porcentajeDeLaTabla(r);
}

export function ticketPromedio(venta: number, tickets: number): number | null {
  return tickets > 0 ? venta / tickets : null;
}

/** Las 3 horas seguidas de mayor venta del día: «12–3 pm» y su monto. */
export function horasDeMayorVenta(horas: readonly number[]): { desde: number; hasta: number; rotulo: string; monto: number } | null {
  const b = bloqueDeHoras({ desde: "", hasta: "", semana: [], horas: horas.map((ventas, hora) => ({ hora, ventas })) });
  if (!b) return null;
  const monto = horas.slice(b.desde, b.hasta).reduce((s, x) => s + x, 0);
  return { desde: b.desde, hasta: b.hasta, rotulo: etiquetaHoras(b.desde, b.hasta), monto: Math.round(monto * 100) / 100 };
}

/** Las horas que se dibujan: 10 am a 6 pm como mínimo, más si hubo venta afuera. */
export function horasDelDibujo(horas: readonly number[]): number[] {
  const con = horas.map((v, h) => (v !== 0 ? h : -1)).filter((h) => h >= 0);
  const desde = Math.min(10, ...con);
  const hasta = Math.max(18, ...con);
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

/** «10a» · «12p» · «6p». */
export function horaCorta(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
}
