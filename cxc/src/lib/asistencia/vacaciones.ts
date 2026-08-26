/* ─────────────────────────────────────────────────────────────────────────────
 * LAS VACACIONES — persona + desde + hasta + un interruptor. Nada más.
 *
 * Módulo PURO: sin base, sin red, sin `new Date()`.
 *
 * ── 🔴 UNA VACACIÓN NO ES UNA JUSTIFICACIÓN, Y POR ESO SE MUDÓ ───────────────
 *
 * Hasta el 25-ago-2026 «Vacaciones» era un motivo más del desplegable de
 * Justificaciones. No lo es: una justificación explica por qué alguien FALTÓ un
 * día que tenía que trabajar; unas vacaciones son un derecho que se gana, se
 * gasta y **lleva su propia cuenta de días**. Metidas en la misma lista, en tres
 * meses nadie puede distinguir quién estuvo enfermo de quién estuvo de
 * vacaciones — y solo una de las dos cosas se acumula.
 *
 * ── 🔴 EN UN DÍA DE VACACIONES NO SE CALCULA NADA DEL RELOJ ──────────────────
 *
 * Daniel, textual: *"si alguien pasó por el reloj estando de vacaciones, no
 * genera horas, ni tardanza, ni ausencia"*. Las marcas de ese día **no se
 * borran ni se esconden** —viajan en `marcasIgnoradas` y la pantalla las
 * muestra—, pero no entran en ninguna cuenta. Es la diferencia entre descartar
 * un dato y descartarlo EN SILENCIO.
 *
 * ── 🔴 EL INTERRUPTOR: «YA SE LE PAGÓ» ──────────────────────────────────────
 *
 * La regla es de la contadora de Daniel, textual: *"Si la persona había cobrado
 * sus vacaciones anteriormente en dinero y no se había ido esos tres días, yo se
 * los descuento porque ya se los pagué; si la persona no ha cobrado sus
 * vacaciones entonces se los pago."*
 *
 *   · MARCADO  (`yaPagadas: true`)  → esos días NO se pagan. Se descuentan de
 *     la quincena, porque ya se cobraron en efectivo antes.
 *   · SIN MARCAR (`false`, el DEFAULT) → se pagan. No se descuenta nada.
 *
 * 🩸 **SIN MARCAR ES EL DEFAULT Y ESO NO ES UN DETALLE.** El caso normal es que
 * se pagan, y es el comportamiento que la vacación de ELOYN MENDOZA (16-jul →
 * 13-ago-2026) tenía como justificación: sus días no se descontaban. La
 * migración la trae SIN MARCAR justamente para que no cambie de comportamiento
 * el día que se mude — un `true` por defecto le habría descontado una quincena
 * entera sin que nadie tocara nada.
 *
 * ── ⚠️ QUÉ DÍAS SE DESCUENTAN CUANDO ESTÁ MARCADA ───────────────────────────
 *
 * Solo los que la persona iba a trabajar: **día hábil y no feriado**. Un domingo
 * o un 3 de noviembre adentro del rango no se descuentan porque no había jornada
 * que pagar — descontarlos sería cobrarle dos veces el mismo día.
 * ────────────────────────────────────────────────────────────────────────── */

// 🔑 `fechaCorta` vive en `planilla.ts` y es la ÚNICA forma en que este módulo
// escribe una fecha: la pantalla, el papel y esta línea tienen que decir «16 jul
// 2026» igual. Sí, arma un ciclo (`reporte → vacaciones → planilla → reporte`),
// y es inofensivo porque NINGUNO de los tres se usa en tiempo de evaluación del
// módulo — todas las llamadas están adentro de funciones. Mismo camino que ya
// recorre `periodo.ts`.
import { fechaCorta } from "./planilla";

/** Una vacación cargada, tal como la lee el módulo. */
export interface Vacacion {
  /** El código del reloj. La misma llave que usa todo el módulo. */
  empleado_codigo: string;
  /** YYYY-MM-DD */
  desde: string;
  hasta: string;
  /**
   * 🔴 `true` = esos días NO se pagan (ya se cobraron en efectivo antes).
   * `false` (el default) = se pagan.
   */
  ya_pagadas: boolean;
}

/** Lo que el motor cuelga de un día cubierto por vacaciones. */
export interface DiaVacacion {
  /** `true` = ese día no se paga. Ver la nota del interruptor. */
  yaPagadas: boolean;
  /**
   * Las horas que la persona marcó ESE día y que no entran en ninguna cuenta.
   *
   * 🔴 SE MUESTRAN. Un dato que se descarta en silencio es un dato que alguien
   * va a buscar y no va a encontrar; acá se dice «marcó, y no cuenta».
   */
  marcasIgnoradas: string[];
}

/** ¿Este texto se puede leer como un "sí" del interruptor? */
export function esYaPagada(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim().toLowerCase() === "true";
  return false;
}

/**
 * La vacación que cubre este día, o `null`.
 *
 * 🔑 Se compara como TEXTO: en `YYYY-MM-DD` el orden alfabético ES el
 * cronológico, así que no hace falta construir un `Date` —que metería la zona
 * horaria en una comparación de días de calendario, el bug clásico de este
 * repo—.
 */
export function vacacionDe(
  vacaciones: readonly Vacacion[],
  codigo: string,
  fecha: string,
): Vacacion | null {
  return (
    vacaciones.find(
      (v) => v.empleado_codigo === codigo && v.desde <= fecha && fecha <= v.hasta,
    ) ?? null
  );
}

/**
 * Cómo se lee un día de vacaciones, en pantalla y en el Excel.
 *
 * 🔴 NUNCA LA PALABRA «AUSENCIA». Quien está de vacaciones no faltó: está
 * usando un derecho. Y cuando está marcada se dice **«(ya pagadas)»**, porque
 * ése es el único caso en que el día no se paga y quien mira el renglón tiene
 * que poder saberlo sin abrir otra pantalla.
 */
export function textoDiaVacaciones(yaPagadas: boolean): string {
  return yaPagadas ? "Vacaciones (ya pagadas)" : "Vacaciones";
}

/**
 * El rango escrito, para la línea de «Decidilo vos» de la planilla.
 * «Vacaciones del 16 jul 2026 al 13 ago 2026».
 */
export function textoVacacion(desde: string, hasta: string, yaPagadas: boolean): string {
  return `${textoDiaVacaciones(yaPagadas)} del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
}

/**
 * La única línea que la pantalla escribe debajo del interruptor.
 *
 * 🔑 UNA línea y corta. Daniel odia los párrafos didácticos, y acá el que carga
 * la vacación necesita saber una sola cosa: si esos días se pagan o no.
 */
export function efectoDelInterruptor(yaPagadas: boolean): string {
  return yaPagadas
    ? "No se le pagan estos días: ya se los pagaste antes."
    : "Se le pagan estos días.";
}

/** Los días de calendario que cubre la vacación, `desde` y `hasta` incluidos. */
export function diasDeVacacion(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T12:00:00Z`);
  const b = Date.parse(`${hasta}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 NADA SE DESCARTA EN SILENCIO — el aviso de lo que la planilla NO pagó
//
// Regla firme de Daniel: si la planilla deja de pagar días por una vacación
// marcada, **tiene que decirlo en pantalla**. Rechazar sí, esconder no.
// ─────────────────────────────────────────────────────────────────────────────

export interface VacacionNoPagada {
  codigo: string;
  /** El nombre, o el código si todavía no tiene. NUNCA vacío. */
  etiqueta: string;
  /**
   * Los rangos marcados «ya se le pagó» que tocan el período.
   *
   * 🔑 Es una LISTA y no un `desde`/`hasta`: si alguien tuviera dos vacaciones
   * marcadas en la misma quincena, juntarlas en un solo rango inventaría un
   * período continuo que nunca existió — y el rango es justo lo que se usa para
   * ir a buscar la vacación y comprobarla.
   */
  rangos: ReadonlyArray<{ desde: string; hasta: string }>;
  /** Cuántos días de ESTE período se dejaron de pagar (hábiles, no feriados). */
  dias: number;
  /** Cuánto NO se pagó, en dólares. */
  monto: number;
}

/** «16 jul 2026 → 13 ago 2026», y con varios rangos los junta con « y ». */
export function textoRangos(
  rangos: ReadonlyArray<{ desde: string; hasta: string }>,
): string {
  return rangos.map((r) => `${fechaCorta(r.desde)} → ${fechaCorta(r.hasta)}`).join(" y ");
}

/**
 * La línea ámbar, tal como se lee. `null` si no hay nada que avisar — un cartel
 * permanente es un cartel que se deja de leer.
 *
 * 🔑 Lleva las TRES cosas que Daniel pidió y en este orden: el nombre, el rango
 * y el monto. Sin el monto no se puede cotejar contra nada; sin el rango no se
 * sabe de qué vacación habla; sin el nombre no se sabe a quién reclamarle.
 */
export function textoVacacionesNoPagadas(
  items: readonly VacacionNoPagada[],
): string | null {
  if (items.length === 0) return null;
  const detalle = items
    .map(
      (v) =>
        `${v.etiqueta} · ${textoRangos(v.rangos)} · ` +
        `${v.dias} ${v.dias === 1 ? "día" : "días"} · $${v.monto.toFixed(2)}`,
    )
    .join(" — ");
  const cabeza =
    items.length === 1
      ? "1 vacación marcada como «ya se le pagó»: esos días NO se pagaron en este cuadro."
      : `${items.length} vacaciones marcadas como «ya se le pagó»: esos días NO se pagaron en este cuadro.`;
  return `${cabeza} ${detalle}`;
}
