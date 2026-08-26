/* ─────────────────────────────────────────────────────────────────────────────
 * EL SALDO DE VACACIONES — cuántos días le quedan a cada persona.
 *
 * Módulo PURO: sin base, sin red y sin `new Date()`. El "hoy" entra por
 * parámetro —siempre el día de PANAMÁ, `hoyPanama()`— para que los tests no
 * dependan del reloj de la máquina. Mismo criterio que `periodo.ts` y
 * `vigencia.ts`.
 *
 * ── LA CUENTA, ENTERA, EN UNA LÍNEA ──────────────────────────────────────────
 *
 *     días ganados  −  días tomados  −  días ya pagados  =  SALDO
 *
 * ── 🔴 LA REGLA DE LOS DÍAS GANADOS, CON UN EJEMPLO A MANO ───────────────────
 *
 * Código de Trabajo de Panamá: **30 días por cada 11 MESES trabajados** (un mes
 * de vacaciones por cada once de trabajo). Once, no doce — y de ahí sale todo
 * lo demás, así que no es un typo que alguien deba "arreglar".
 *
 *   · Cada bloque de 11 meses CUMPLIDOS suma 30 días enteros.
 *   · El bloque EN CURSO suma 30 ÷ 11 = 2,7272… días por cada mes cumplido, y
 *     se **trunca** a día entero. Los días sueltos del mes en curso no suman.
 *
 * 🔑 SE TRUNCA HACIA ABAJO, y esa asimetría es a propósito: mostrar un día de
 * más es habilitar a alguien a irse un día que todavía no ganó, y eso después
 * se paga en plata. Mostrar un día de menos solo se corrige solo, al mes
 * siguiente.
 *
 * ── EL EJEMPLO NUMÉRICO (se puede auditar sin leer la función) ───────────────
 *
 * ANGELA GARCIA (código 7) entró el **16-feb-2019**; al **25-ago-2026**:
 *
 *     meses cumplidos = 90        16-feb-2019 → 16-ago-2026 son 90 meses,
 *                                 y el 25 ya pasó el 16, así que el mes cerró.
 *     bloques enteros = 90 ÷ 11 = 8   →  8 × 30      = 240 días
 *     resto           = 90 − 8×11 = 2 →  ⌊2 × 30/11⌋ = ⌊5,45⌋ = 5 días
 *     ───────────────────────────────────────────────────────────────
 *     GANADOS                                        = 245 días
 *
 * ── 🔴 LOS DÍAS SE CUENTAN DE CALENDARIO, FINES DE SEMANA Y FERIADOS ADENTRO ─
 *
 * Es el MISMO criterio que ya usa el motor de vacaciones (`diasDeVacacion` en
 * `vacaciones.ts`, que es lo que la pantalla viene mostrando desde el
 * 25-ago-2026): del `desde` al `hasta`, los dos incluidos, sin mirar el día de
 * la semana.
 *
 * 🩸 **NO se usa el filtro de "hábil y no feriado" de `planilla.ts`**, y la
 * diferencia no es un descuido. Ese filtro responde otra pregunta: *¿qué días
 * había jornada que pagar?* — es una regla de PLATA. Acá la pregunta es *¿qué
 * días de derecho gastó?*, y el derecho viene medido en meses de calendario:
 * los 30 días de la ley son un MES corrido, con sus domingos adentro.
 * Descontar solo los hábiles contra un techo de días corridos sería comparar
 * dos unidades distintas y regalarle a cada persona ~8 días por mes de
 * vacaciones tomado.
 *
 * ── 🔴 LAS "YA PAGADAS" TAMBIÉN BAJAN DEL SALDO ─────────────────────────────
 *
 * La regla es de la contadora, textual: *"Si la persona había cobrado sus
 * vacaciones anteriormente en dinero y no se había ido esos tres días, yo se
 * los descuento porque ya se los pagué"*. O sea: el derecho se consumió igual
 * —se cobró en vez de disfrutarse—, así que baja del saldo exactamente como si
 * se hubiera ido. Se llevan en un contador APARTE del de los tomados por una
 * sola razón: quien mire el renglón tiene que poder distinguir los días que la
 * persona descansó de los que le pagaron. Los dos restan.
 *
 * ── 🔴 SIN FECHA DE INGRESO NO HAY SALDO. NI CERO. ──────────────────────────
 *
 * `ganados` y `saldo` son `number | null`, y el `null` no se puede confundir
 * con un `0` por accidente: **20 de las 36 personas activas no tienen
 * `fecha_ingreso` cargada** (medido por la puerta de la app el 25-ago-2026,
 * GET /api/asistencia/configuracion). Un cero ahí se leería como "no le queda
 * ni un día" y a alguien le negarían las vacaciones que sí ganó.
 *
 * Y NO se esconden de la lista: aparecen diciendo «Falta la fecha de ingreso»,
 * que además es la acción que hay que hacer. Nada se descarta en silencio.
 * ────────────────────────────────────────────────────────────────────────── */

import { esFechaValida } from "./vigencia";
import { diasDeVacacion, type Vacacion } from "./vacaciones";

// ─────────────────────────────────────────────────────────────────────────────
// LA LEY, EN DOS NÚMEROS
// ─────────────────────────────────────────────────────────────────────────────

/** Los días que se ganan por cada período cumplido. Código de Trabajo, art. 54. */
export const DIAS_POR_PERIODO = 30;

/** Cuántos meses de trabajo cierran un período. ONCE, no doce. Ver la cabecera. */
export const MESES_POR_PERIODO = 11;

// ─────────────────────────────────────────────────────────────────────────────
// MESES CUMPLIDOS
//
// Se cuenta con las tres partes de la fecha como NÚMEROS, no con `Date`: meter
// un `Date` en una comparación de días de calendario es el bug clásico de este
// repo (`timestamptz` vs `date` pelado), y acá un día de corrimiento es un mes
// de vacaciones que aparece o desaparece de golpe.
// ─────────────────────────────────────────────────────────────────────────────

function partes(f: string): { anio: number; mes: number; dia: number } | null {
  if (!esFechaValida(f)) return null;
  const [anio, mes, dia] = f.trim().split("-").map(Number);
  return { anio, mes, dia };
}

/**
 * Cuántos meses CUMPLIDOS pasaron entre las dos fechas.
 *
 * El mes cierra el mismo día del mes: de un día 16 a otro día 16 hay un mes
 * cumplido; al 15 todavía no. Nunca devuelve negativo — quien entra mañana
 * lleva cero meses trabajados, no menos uno.
 */
export function mesesCumplidos(desde: string, hasta: string): number {
  const a = partes(desde);
  const b = partes(hasta);
  if (!a || !b) return 0;
  let meses = (b.anio - a.anio) * 12 + (b.mes - a.mes);
  // El mes en curso todavía no cerró: falta llegar al día de ingreso.
  if (b.dia < a.dia) meses -= 1;
  return meses > 0 ? meses : 0;
}

/**
 * Los días de vacaciones GANADOS desde el ingreso hasta `hoy`.
 *
 * `null` = no se puede saber: no hay fecha de ingreso (o no es una fecha).
 * 🔴 Nunca `0` por falta de dato — ver la cabecera.
 *
 * Con una fecha de ingreso FUTURA devuelve `0`, y ese cero sí es real: la
 * persona todavía no empezó a trabajar y no ganó ningún día.
 */
export function diasGanados(
  fechaIngreso: string | null | undefined,
  hoy: string,
): number | null {
  if (!esFechaValida(fechaIngreso) || !esFechaValida(hoy)) return null;
  const meses = mesesCumplidos(String(fechaIngreso).trim(), hoy);
  const bloques = Math.floor(meses / MESES_POR_PERIODO);
  const resto = meses - bloques * MESES_POR_PERIODO;
  // El bloque cerrado paga entero; el que está en curso, prorrateado y truncado.
  return bloques * DIAS_POR_PERIODO
    + Math.floor((resto * DIAS_POR_PERIODO) / MESES_POR_PERIODO);
}

// ─────────────────────────────────────────────────────────────────────────────
// LO GASTADO
// ─────────────────────────────────────────────────────────────────────────────

export interface DiasGastados {
  /** Días de vacaciones que la persona se tomó (sin marcar «ya se le pagó»). */
  tomados: number;
  /** Días que cobró en efectivo y no disfrutó. **También restan.** */
  yaPagados: number;
}

/**
 * Los días que esta persona ya gastó, separados en los dos contadores.
 *
 * ⚠️ Recorre TODAS las vacaciones que se le pasen: el saldo es histórico, no
 * de una quincena. Quien llame tiene que darle la lista completa —filtrarla por
 * un rango de fechas devolvería un saldo inflado sin decir por qué.
 */
export function diasGastados(
  vacaciones: readonly Vacacion[],
  codigo: string,
): DiasGastados {
  const cod = String(codigo ?? "").trim();
  let tomados = 0;
  let yaPagados = 0;
  for (const v of vacaciones) {
    if (String(v?.empleado_codigo ?? "").trim() !== cod) continue;
    // 🔑 El MISMO contador que muestra la pantalla al cargar la vacación
    // (`diasDeVacacion`): días de calendario, los dos extremos incluidos. Ver
    // la cabecera para por qué acá no entra el filtro de hábiles de la planilla.
    const dias = diasDeVacacion(v.desde, v.hasta);
    if (v.ya_pagadas) yaPagados += dias;
    else tomados += dias;
  }
  return { tomados, yaPagados };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL SALDO
// ─────────────────────────────────────────────────────────────────────────────

export interface SaldoVacaciones {
  codigo: string;
  /** El nombre, o el código si todavía no tiene ficha. NUNCA vacío. */
  etiqueta: string;
  /** `null` = falta la fecha de ingreso. NO es cero. */
  ganados: number | null;
  tomados: number;
  yaPagados: number;
  /** `null` = falta la fecha de ingreso. Puede ser NEGATIVO: ver abajo. */
  saldo: number | null;
  /** `true` = no hay fecha de ingreso cargada y por eso no hay saldo. */
  faltaFechaIngreso: boolean;
}

/**
 * El saldo de una persona.
 *
 * 🔑 PUEDE DAR NEGATIVO y se muestra negativo. Alguien que se tomó más días de
 * los que ganó existe —se adelantan vacaciones— y recortar a cero escondería
 * justo el caso que hay que mirar.
 */
export function saldoDe(
  codigo: string,
  etiqueta: string,
  fechaIngreso: string | null | undefined,
  vacaciones: readonly Vacacion[],
  hoy: string,
): SaldoVacaciones {
  const { tomados, yaPagados } = diasGastados(vacaciones, codigo);
  const ganados = diasGanados(fechaIngreso, hoy);
  return {
    codigo: String(codigo ?? "").trim(),
    etiqueta,
    ganados,
    tomados,
    yaPagados,
    // 🔴 El candado: sin `ganados` no sale un número, sale `null`. Un `?? 0` acá
    // convertiría "no se sabe" en "no le queda nada".
    saldo: ganados === null ? null : ganados - tomados - yaPagados,
    faltaFechaIngreso: ganados === null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LEE
//
// Los textos viven acá y no en la pantalla: son los mismos que van a necesitar
// el Excel y el papel el día que existan, y una segunda redacción es una
// segunda verdad. Mismo criterio que `vacaciones.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que dice la columna cuando no hay fecha de ingreso. Es la ACCIÓN, no un guion. */
export const SIN_FECHA_INGRESO = "Falta la fecha de ingreso";

/**
 * La columna de saldo, corta: «18 de 30» = le quedan 18 de los 30 que ganó.
 * Sin fecha de ingreso, la frase que dice qué falta hacer.
 */
export function textoSaldo(s: SaldoVacaciones): string {
  if (s.saldo === null || s.ganados === null) return SIN_FECHA_INGRESO;
  return `${s.saldo} de ${s.ganados}`;
}

/**
 * El renglón chico de abajo: en qué se fueron los días. `null` cuando no gastó
 * ninguno — una línea que siempre dice «tomó 0» es una línea que se deja de leer.
 */
export function textoGastados(s: SaldoVacaciones): string | null {
  const partes: string[] = [];
  if (s.tomados > 0) partes.push(`tomó ${s.tomados}`);
  // 🔴 Se NOMBRA aparte: son días que se cobraron, no que se descansaron, y
  // restan igual. Juntarlos con los tomados borraría esa diferencia.
  if (s.yaPagados > 0) partes.push(`ya pagados ${s.yaPagados}`);
  return partes.length ? partes.join(" · ") : null;
}

/**
 * La línea que dice cuánta gente se quedó SIN saldo por falta de fecha.
 * `null` cuando no falta ninguna — un cartel permanente se deja de leer.
 *
 * 🔴 Lleva el DÓNDE, no solo el cuánto: sin eso es una queja, no una tarea.
 */
export function avisoSinFechaIngreso(cuantas: number): string | null {
  if (cuantas <= 0) return null;
  const gente = cuantas === 1 ? "1 persona no tiene saldo" : `${cuantas} personas no tienen saldo`;
  return `${gente}: les falta la fecha de ingreso. Se carga en Configuración, en «Empezó a trabajar».`;
}

/**
 * La línea que dice desde cuándo cuenta la resta. **No se puede sacar.**
 *
 * 🩸 Los días GANADOS se cuentan desde que la persona entró —hay fichas de
 * 2019—, pero las vacaciones solo existen en el sistema desde el 25-ago-2026,
 * cuando se creó la tabla: al medir por la puerta de la app ese día había UNA
 * cargada. O sea que a quien se fue de vacaciones en 2023 el saldo se las
 * cuenta como no tomadas. Decirlo es la diferencia entre un número que se
 * entiende y un número que se cree.
 */
export const DESDE_CUANDO_CUENTA =
  "El saldo resta solo las vacaciones cargadas acá. Las de antes no están en el sistema.";
