/* ─────────────────────────────────────────────────────────────────────────────
 * EL PERÍODO DEL REPORTE VIVE EN LA URL (16-sep-2026). Módulo PURO.
 *
 * Daniel, textual: *«si estoy en asistencia y voy a planilla y vuelvo se me
 * resetea asistencia, quiero q se quede»*.
 *
 * 🩸 EL PROBLEMA. `desde`/`hasta` eran `useState` dentro de `ReporteTab`, y la
 * pestaña se DESMONTA al cambiar de pestaña: volver la montaba de cero, con el
 * rango por defecto («hace 14 días → hoy»). El rango recordado
 * (`fg_last_asistencia_reporte`) se leía en un efecto que corre UNA vez al
 * montar, así que tapaba el síntoma a medias y solo en el mismo dispositivo.
 *
 * ── 🔴 LA URL, CON `replace` ─────────────────────────────────────────────────
 *
 * La pestaña (`?tab=`) y la empresa (`?empresa=`) ya viven ahí. El período es
 * un FILTRO DEL MISMO NIVEL, no un drill-down, así que va con `replace`: el
 * Atrás del navegador no tiene que ciclar por cada cambio de fechas
 * (convención del sistema, `useUrlState`).
 *
 * 🔑 LA PRECEDENCIA NO CAMBIÓ, SOLO SE ESCRIBIÓ EN UN LADO: manda la URL,
 * después lo recordado en este dispositivo, y al final la sugerencia de
 * siempre. Es exactamente lo que hacían el `llegada` y el efecto de
 * `ultimoRango` juntos — «Ver sus días ›» desde la ficha sigue mandando su
 * rango y sigue ganando.
 * ────────────────────────────────────────────────────────────────────────── */

/** ¿Es una fecha de calendario `YYYY-MM-DD`? */
function esFecha(v: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
}

export interface Periodo {
  desde: string;
  hasta: string;
}

/** Cuántos días atrás arranca el Reporte cuando nadie eligió nada. El de siempre. */
export const DIAS_POR_DEFECTO = 14;

/**
 * El rango con el que abre el Reporte.
 *
 * @param url        lo que traen `?desde=` y `?hasta=` (puede venir a medias)
 * @param recordado  el último rango de este dispositivo, o `null`
 * @param hoy        el día de Panamá (`hoyPanama()`)
 * @param haceCatorce  `hoy` menos 14 días, también en día de Panamá
 *
 * 🔴 LAS DOS FECHAS VIAJAN JUNTAS y en orden. Media URL (`?desde=` sin
 * `?hasta=`) o un rango al revés se descartan enteros: mostrar medio período
 * pedido es peor que mostrar el de siempre.
 */
export function periodoInicial(opts: {
  url: { desde?: string | null; hasta?: string | null };
  recordado: Periodo | null;
  hoy: string;
  haceCatorce: string;
}): Periodo {
  const d = String(opts.url.desde ?? "");
  const h = String(opts.url.hasta ?? "");
  if (esFecha(d) && esFecha(h) && d <= h) return { desde: d, hasta: h };
  const r = opts.recordado;
  if (r && esFecha(r.desde) && esFecha(r.hasta) && r.desde <= r.hasta) return { desde: r.desde, hasta: r.hasta };
  return { desde: opts.haceCatorce, hasta: opts.hoy };
}

/** ¿La URL ya trae un período completo y válido? */
export function urlTraePeriodo(url: { desde?: string | null; hasta?: string | null }): boolean {
  const d = String(url.desde ?? "");
  const h = String(url.hasta ?? "");
  return esFecha(d) && esFecha(h) && d <= h;
}
