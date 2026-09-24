/* ─────────────────────────────────────────────────────────────────────────────
 * LA PANTALLA DE ASISTENCIA Y PLANILLA — el rediseño del 24-sep-2026. PURO.
 *
 * Sin base, sin red y sin `new Date()`: el «hoy» entra por parámetro y sale de
 * `hoyPanama()`. Acá vive TODO lo que decide qué se dibuja; los componentes solo
 * aplican.
 *
 * ── 🩸 LO QUE SE MIDIÓ (24-sep-2026, contra producción) ──────────────────────
 *
 *   · **Cuatro selectores de período, tres memorias y dos listas de quincenas
 *     que no coinciden.** Asistencia recordaba con la llave `asistencia_reporte`
 *     y Aprobaciones con `asistencia_aprobaciones` — cambiar el período en una
 *     pestaña NO cambiaba el de la otra. La Planilla tenía sus cuatro botones de
 *     quincena y Préstamos › Movimientos una lista desplegable de **24**.
 *   · En el celular, **1.085 px y 22 controles** antes del primer nombre de la
 *     tabla de Asistencia, y la tabla misma mide **888 px dentro de 356**.
 *   · En la computadora, la Planilla **se corta antes del neto**: la captura de
 *     Daniel a 1440 px termina en «ISR» y la columna siguiente muestra una «P».
 *   · De la Planilla a la Asistencia de una persona: **cuatro toques** y buscar
 *     entre 43 filas, porque la quincena no viajaba.
 *
 * ── 🔴 LA REGLA ─────────────────────────────────────────────────────────────
 *
 *   1. **UN SOLO SELECTOR DE PERÍODO** para Asistencia · Aprobaciones · Planilla
 *      y Préstamos › Movimientos: «‹ 16 – 30 sep 2026 ›» con flechas que saltan
 *      de QUINCENA, y un calendario detrás del ícono 📅 para un día o un rango.
 *      Sin chips «Hoy» y «Ayer». **Una sola memoria** (`fg_last_asistencia_periodo`)
 *      y **una sola fuente**: `?desde=&hasta=` en la dirección, con `replace`
 *      —es un filtro del mismo nivel, y el Atrás no tiene que ciclar por fechas—.
 *   2. **La quincena es fija** (1–15 · 16 al último día que paga). El **corte del
 *      reloj** es otra cosa y vive SOLO en la Planilla.
 *   3. 🔴 **NINGÚN NÚMERO CAMBIA.** Este módulo no calcula un centavo: decide qué
 *      se dibuja, qué dice cada rótulo y qué se escribe en la dirección. Lo que
 *      se le manda al servidor para generar, cerrar, aprobar y corregir es el
 *      MISMO, con el interruptor prendido y apagado.
 * ────────────────────────────────────────────────────────────────────────── */

import { quincena, quincenaAnterior, quincenasHasta, type Quincena } from "./planilla";
import { rotuloQuincena } from "./elegir-quincena";

/**
 * 🔴 EL INTERRUPTOR. En `false` el módulo es EXACTAMENTE el de antes: los cuatro
 * selectores, el panel de nueve bloques, la columna «Sale», los cuatro botones
 * de quincena de la Planilla y la tarjeta plegable de Colaboradores.
 */
export const ASISTENCIA_PANTALLA_2026_09 = true;

// ─────────────────────────────────────────────────────────────────────────────
// EL PERÍODO COMPARTIDO
// ─────────────────────────────────────────────────────────────────────────────

/** Las dos claves de la dirección. Son las que Asistencia ya usaba. */
export const PARAM_DESDE = "desde";
export const PARAM_HASTA = "hasta";

/**
 * 🔴 UNA SOLA MEMORIA para las cuatro pestañas (`fg_last_…`, como todo el
 * sistema). 🩸 Antes eran `asistencia_reporte` y `asistencia_aprobaciones`, y
 * por eso el período no viajaba entre pestañas.
 */
export const RECORDAR_PERIODO = "asistencia_periodo";

export interface Periodo {
  desde: string;
  hasta: string;
}

/** ¿Es una fecha de calendario `YYYY-MM-DD`? */
export function esFecha(v: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
}

/** ¿Las dos fechas sirven y están en orden? */
export function periodoValido(p: { desde?: string | null; hasta?: string | null }): boolean {
  const d = String(p.desde ?? "");
  const h = String(p.hasta ?? "");
  return esFecha(d) && esFecha(h) && d <= h;
}

/** La quincena que CONTIENE a `hoy` (día de Panamá). */
export function quincenaDeHoy(hoy: string): Quincena {
  const [a, m, d] = hoy.split("-").map(Number);
  return quincena(a, m, d <= 15 ? 1 : 2);
}

/**
 * El período con el que abren las cuatro pestañas.
 *
 * 🔴 Manda la dirección, después la memoria compartida, y al final **la quincena
 * en curso** — no «hace 14 días», que es lo que abría antes: el selector nuevo
 * se mueve de quincena en quincena y abrir en un rango que no es ninguna dejaría
 * las flechas mintiendo desde el primer segundo.
 */
export function periodoCompartidoInicial(opts: {
  url: { desde?: string | null; hasta?: string | null };
  recordado: Periodo | null;
  hoy: string;
}): Periodo {
  if (periodoValido(opts.url)) return { desde: String(opts.url.desde), hasta: String(opts.url.hasta) };
  const r = opts.recordado;
  if (r && periodoValido(r)) return { desde: r.desde, hasta: r.hasta };
  const q = quincenaDeHoy(opts.hoy);
  return { desde: q.desde, hasta: q.hasta };
}

/** ¿Este rango es EXACTAMENTE una quincena? Decide el rótulo y el salto. */
export function esQuincenaExacta(desde: string, hasta: string): boolean {
  if (!periodoValido({ desde, hasta })) return false;
  const [a, m] = desde.split("-").map(Number);
  return [quincena(a, m, 1), quincena(a, m, 2)].some((q) => q.desde === desde && q.hasta === hasta);
}

/** La quincena en la que EMPIEZA este período. */
export function quincenaDelPeriodo(desde: string): Quincena {
  const [a, m, d] = desde.split("-").map(Number);
  return quincena(a, m, d <= 15 ? 1 : 2);
}

/** La quincena INMEDIATAMENTE siguiente. */
export function quincenaSiguiente(q: Quincena): Quincena {
  if (q.n === 1) return quincena(q.anio, q.mes, 2);
  const mes = q.mes === 12 ? 1 : q.mes + 1;
  const anio = q.mes === 12 ? q.anio + 1 : q.anio;
  return quincena(anio, mes, 1);
}

/**
 * 🔴 LAS FLECHAS SALTAN DE QUINCENA, SIEMPRE. Mirando un día suelto o un rango
 * elegido en el calendario, «‹» y «›» llevan a la quincena anterior o siguiente
 * a la que CONTIENE el primer día de lo que se mira. Un paso que a veces es «un
 * día» y a veces «una quincena» sería un control que no se puede predecir.
 */
export function pasoDeQuincena(desde: string, direccion: -1 | 1): Periodo {
  const q = quincenaDelPeriodo(desde);
  const n = direccion === -1 ? quincenaAnterior(q) : quincenaSiguiente(q);
  return { desde: n.desde, hasta: n.hasta };
}

/**
 * ¿Se puede ir a la quincena siguiente? 🔴 NUNCA AL FUTURO: «›» se apaga cuando
 * la quincena que sigue todavía no empezó (misma regla que el mes del celular de
 * Multifashion).
 */
export function haySiguienteQuincena(desde: string, hoy: string): boolean {
  return pasoDeQuincena(desde, 1).desde <= hoy;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «24 sep 2026». */
function diaLargo(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7));
  return `${d} ${MESES_CORTOS[m - 1] ?? ""} ${iso.slice(0, 4)}`;
}

/**
 * Lo que dice la barra: «16 – 30 sep 2026» cuando es una quincena, «24 sep 2026»
 * cuando es UN día, y «18 sep – 22 sep 2026» cuando es cualquier otro rango.
 */
export function rotuloDelPeriodo(desde: string, hasta: string): string {
  if (!periodoValido({ desde, hasta })) return "";
  if (esQuincenaExacta(desde, hasta)) {
    return `${rotuloQuincena(quincenaDelPeriodo(desde))} ${desde.slice(0, 4)}`;
  }
  if (desde === hasta) return diaLargo(desde);
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  const izq = mismoAnio
    ? `${Number(desde.slice(8, 10))} ${MESES_CORTOS[Number(desde.slice(5, 7)) - 1]}`
    : diaLargo(desde);
  return `${izq} – ${diaLargo(hasta)}`;
}

/** Las 24 quincenas del calendario del selector, de la más nueva a la más vieja. */
export function quincenasDelCalendario(hoy: string, cuantas = 24): Quincena[] {
  return quincenasHasta(hoy, cuantas);
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CORTE DEL RELOJ — solo en la Planilla
//
// 🩸 «Quincena» y «Cortar el reloj el» estaban uno al lado del otro, con rótulo
// propio y el mismo peso: por eso parecían DOS períodos. Y al lado del campo
// había un botón «Quincena entera» y un chip gris «Corte 17 sep» que solo
// repetía el valor que ya decía el campo.
//
// 🔴 Ahora: el campo con una «×» que lo vacía, y debajo UNA línea gris que dice
// hasta dónde se lee el reloj. Ni el botón ni el chip.
// 🔑 El corte NO cambia lo que se paga: el período queda entero y solo se recorta
// hasta dónde se mira el reloj. Eso ya era así y no se toca.
// ─────────────────────────────────────────────────────────────────────────────

/** «13 sep» — la fecha del corte, corta. */
export function cortoDelCorte(f: string): string {
  if (!esFecha(f)) return "";
  return `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1] ?? ""}`.trim();
}

/** «El reloj se lee hasta el 28 sep» · «…hasta el fin de la quincena». */
export function lineaDelCorte(corte: string): string {
  return esFecha(corte)
    ? `El reloj se lee hasta el ${cortoDelCorte(corte)}`
    : "El reloj se lee hasta el fin de la quincena";
}

/** Lo que dice el botón que vacía el corte. */
export const VACIAR_EL_CORTE = "Quitar el corte";
/** El enlace de la línea gris, que lleva al campo. */
export const CAMBIAR_EL_CORTE = "cambiar";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 7a — DE LA PLANILLA A LA ASISTENCIA DE ESA PERSONA, EN UN TOQUE
//
// 🩸 Hoy son cuatro toques: cambiar de pestaña, volver a elegir la quincena
// (Asistencia y Planilla tenían memorias distintas), buscar a la persona entre
// 43 filas y abrirla. Ahora el nombre de la fila es un enlace que lleva a su
// Asistencia con la MISMA empresa, la MISMA quincena y su tabla de días abierta.
//
// 🔑 El camino de vuelta ya existe: las pestañas visitadas quedan armadas
// (`pestanas-vivas.ts`), así que el Atrás del navegador devuelve la Planilla
// tal cual, sin regenerarla.
// ─────────────────────────────────────────────────────────────────────────────

/** Qué colaborador abre la pestaña Asistencia al llegar. */
export const PARAM_ABRE = "abre";

/** La dirección de «ver la asistencia de esta persona», con su período puesto. */
export function rutaAsistenciaDePersona(opts: {
  codigo: string;
  empresa?: string | null;
  desde: string;
  hasta: string;
}): string {
  const q = new URLSearchParams();
  q.set("tab", "asistencia");
  if (opts.empresa) q.set("empresa", opts.empresa);
  if (esFecha(opts.desde)) q.set(PARAM_DESDE, opts.desde);
  if (esFecha(opts.hasta)) q.set(PARAM_HASTA, opts.hasta);
  q.set(PARAM_ABRE, String(opts.codigo ?? ""));
  return `/asistencia?${q.toString()}`;
}

/** Lo que dice el enlace al pasar el mouse por la fila de la Planilla. */
export const VER_SU_ASISTENCIA = "ver su asistencia ›";

// ─────────────────────────────────────────────────────────────────────────────
// 2e — EL CÓDIGO A LA IZQUIERDA Y LA SALIDA EN BURBUJA
//
// Daniel, textual: *«pone salida como en una burbuja al lado del nombre, y el
// código a la izquierda del nombre»*.
//
// 🩸 La columna «Sale» ocupaba una de las once columnas de la tabla para un dato
// que casi siempre es el mismo (18:30 en cinco de ocho, 18:00 en tres) y que solo
// se mira cuando algo no cuadra.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántas columnas tiene la tabla de Asistencia. Once antes; diez ahora. */
export function columnasDelReporte(nuevo: boolean = ASISTENCIA_PANTALLA_2026_09): number {
  return nuevo ? 10 : 11;
}

/** Los códigos van alineados entre sí: el nombre arranca siempre en el mismo punto. */
export function anchoDelCodigo(codigos: readonly string[]): number {
  return Math.max(1, ...codigos.map((c) => String(c ?? "").length));
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS AVISOS PLEGADOS EN UNA LÍNEA
// ─────────────────────────────────────────────────────────────────────────────

/** «3 avisos del período» · «1 aviso del período». `null` sin ninguno. */
export function rotuloDeAvisos(cuantos: number): string | null {
  const n = Math.max(0, Math.trunc(cuantos || 0));
  if (n === 0) return null;
  return n === 1 ? "1 aviso del período" : `${n} avisos del período`;
}

/** La línea de una sola fila que resume los relojes. */
export function resumenDeRelojes(
  relojes: readonly { salud: string; titulo: string }[],
): string {
  if (relojes.length === 0) return "";
  if (relojes.length === 1) return relojes[0].titulo;
  const malos = relojes.filter((r) => r.salud !== "al_dia");
  if (malos.length === 0) return "Los relojes están al día";
  if (malos.length === relojes.length) return "Ningún reloj está entrando";
  return `${malos.length} de ${relojes.length} relojes no están entrando`;
}
