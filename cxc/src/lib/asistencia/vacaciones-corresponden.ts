/* ─────────────────────────────────────────────────────────────────────────────
 * CUÁNTOS DÍAS DE VACACIONES LE CORRESPONDEN — se CALCULA, no se carga.
 *
 * Módulo PURO: sin base, sin red y sin `new Date()`. El "hoy" entra por
 * parámetro —siempre el día de PANAMÁ, `hoyPanama()`— para que los tests no
 * dependan del reloj de la máquina. Mismo criterio que `periodo.ts`.
 *
 * ── QUÉ PIDIÓ DANIEL (17-sep-2026) ──────────────────────────────────────────
 *
 * Textual: *«las vacaciones no funciona por día, hay que cambiar eso, funciona
 * que por cada 11 meses trabajado, 1 mes de vacaciones»* · *«1. Un mes son 30
 * días corridos. 2. La fecha de ingreso que tiene la ficha. 3. [las ya tomadas]
 * lo vemos después»* · *«Quita lo del saldo vacaciones»*.
 *
 * ── 🩸 QUÉ REEMPLAZA, Y POR QUÉ SE VA ───────────────────────────────────────
 *
 * Hasta hoy el número salía de un SALDO INICIAL que contabilidad escribía a
 * mano en la ficha, con su fecha de corte (`saldo_vacaciones_dias` y
 * `saldo_vacaciones_corte`). La idea era buena —contabilidad tiene el número en
 * sus registros— y en la práctica **no la usó nadie: de las 49 fichas NINGUNA tenía
 * un número: 47 vacías y 2 con un 0** (medido el 17-sep-2026). O sea que la pantalla decía
 * «Falta el saldo» para todo el mundo, y el dato que Daniel quería ver —cuántos
 * días le tocan a alguien por su antigüedad— no se veía nunca.
 *
 * Las dos columnas se **RETIRAN, no se dropean** (patrón `mayor_lineas`): sin
 * lectores, con `COMMENT`, y hay candado que pone el build ROJO si una
 * migración las borra o si el código vuelve a leerlas.
 *
 * ── 🔴 LA REGLA DE LA LEY ───────────────────────────────────────────────────
 *
 * Código de Trabajo de Panamá: **30 días por cada 11 MESES trabajados** (un mes
 * de vacaciones por cada once de trabajo). Once, no doce — no es un typo que
 * alguien deba "arreglar".
 *
 *   · Cada bloque de 11 meses CUMPLIDOS suma 30 días enteros.
 *   · El bloque EN CURSO suma 30 ÷ 11 = 2,7272… días por cada mes cumplido, y
 *     se **trunca** a día entero. Los días sueltos del mes en curso no suman.
 *
 * 🔑 SE TRUNCA HACIA ABAJO, y esa asimetría es a propósito: mostrar un día de
 * más es habilitar a alguien a irse un día que todavía no ganó, y eso después
 * se paga en plata. Un día de menos se corrige solo, al mes siguiente.
 *
 * 🔴 LOS DÍAS SON DE CALENDARIO, con sus domingos adentro — el MISMO criterio
 * que `diasDeVacacion` en `vacaciones.ts`. Los 30 días de la ley son un MES
 * corrido; descontar solo los hábiles sería comparar dos unidades distintas y
 * regalarle a cada persona ~8 días por mes tomado.
 *
 * ── 🔴 NO ES UN SALDO, Y ÉSE ES EL PUNTO ────────────────────────────────────
 *
 * Las vacaciones solo existen en el sistema desde el 25-ago-2026, y los días se
 * ganan desde el ingreso — hay fichas de 2019. Así que **lo que esto calcula es
 * lo que le CORRESPONDE por antigüedad menos lo que el sistema tiene
 * registrado**, y nadie sabe qué se tomó antes. Por eso:
 *
 *   · se lee «Le corresponden N días», nunca «le quedan N días»;
 *   · va siempre con la línea `NO_INCLUYE_ANTES`, en gris, como dato;
 *   · 🔴 **NO entra a ningún cálculo de plata**. Ni a la planilla, ni a una
 *     liquidación. Si alguien lo lee como saldo y le paga 45 días a quien ya se
 *     tomó 30, eso es plata de verdad. Hay candado que exige que este módulo no
 *     lo importe nadie que calcule dinero.
 *
 * 🩸 Ya pasó una vez: en el PR #626 el número era «ganados desde que entró menos
 * lo tomado», aritméticamente correcto e inútil — ANGELA GARCIA figuraba con
 * **245 días disponibles**. Cierto, y peligroso. La diferencia con hoy no es la
 * cuenta: es que el número **dice lo que es** y no se usa para pagar.
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
 * Los días de vacaciones GANADOS desde el ingreso hasta una fecha.
 *
 * `null` = no se puede saber: no hay fecha de ingreso (o no es una fecha).
 * 🔴 Nunca `0` por falta de dato — un cero se leería como «no le toca ninguno».
 *
 * Con una fecha de ingreso posterior devuelve `0`, y ese cero sí es real: la
 * persona todavía no empezó a trabajar y no ganó ningún día.
 */
export function diasGanados(
  fechaIngreso: string | null | undefined,
  hasta: string,
): number | null {
  if (!esFechaValida(fechaIngreso) || !esFechaValida(hasta)) return null;
  const meses = mesesCumplidos(String(fechaIngreso).trim(), hasta);
  const bloques = Math.floor(meses / MESES_POR_PERIODO);
  const resto = meses - bloques * MESES_POR_PERIODO;
  // El bloque cerrado paga entero; el que está en curso, prorrateado y truncado.
  return bloques * DIAS_POR_PERIODO
    + Math.floor((resto * DIAS_POR_PERIODO) / MESES_POR_PERIODO);
}

// ─────────────────────────────────────────────────────────────────────────────
// LO REGISTRADO — todas las vacaciones cargadas, sin recortar por fecha
// ─────────────────────────────────────────────────────────────────────────────

export interface DiasTomados {
  /** Días que se tomó (sin marcar «ya se le pagó»). */
  tomados: number;
  /**
   * Días que cobró en efectivo y no disfrutó. **También restan**: el derecho se
   * consumió igual. Se cuentan aparte para poder DECIR cuáles descansó y
   * cuáles le pagaron — la regla es de la contadora.
   */
  yaPagados: number;
}

/**
 * Los días que esta persona tiene REGISTRADOS en el sistema.
 *
 * ⚠️ Recorre TODAS las que se le pasen y no filtra por fecha: quien llame tiene
 * que darle la lista completa. Filtrarla por un rango devolvería un número
 * inflado sin decir por qué.
 */
export function diasTomados(
  vacaciones: readonly Vacacion[],
  codigo: string,
): DiasTomados {
  const cod = String(codigo ?? "").trim();
  let tomados = 0;
  let yaPagados = 0;
  for (const v of vacaciones) {
    if (String(v?.empleado_codigo ?? "").trim() !== cod) continue;
    const dias = diasDeVacacion(v.desde, v.hasta);
    if (dias === 0) continue;
    if (v.ya_pagadas) yaPagados += dias;
    else tomados += dias;
  }
  return { tomados, yaPagados };
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE LE CORRESPONDE
// ─────────────────────────────────────────────────────────────────────────────

export interface DiasCorresponden {
  codigo: string;
  /** El nombre, o el código si todavía no tiene ficha. NUNCA vacío. */
  etiqueta: string;
  /**
   * Lo que le corresponde HOY: ganados − registrados.
   * 🔴 `null` = no se puede saber porque no tiene fecha de ingreso. NO es cero.
   */
  dias: number | null;
  /** Lo que ganó por antigüedad, sin restar nada. `null` sin fecha de ingreso. */
  ganados: number | null;
  /** Días registrados que se tomó. */
  tomados: number;
  /** Días registrados que cobró y no disfrutó. También restan. */
  yaPagados: number;
  /** `true` = le falta la fecha de ingreso, y por eso no hay número. */
  faltaFechaIngreso: boolean;
}

/**
 * Los días que le corresponden a una persona.
 *
 * 🔑 PUEDE DAR NEGATIVO y se muestra negativo: alguien que se tomó más días de
 * los que ganó existe —se adelantan vacaciones— y recortar a cero escondería
 * justo el caso que hay que mirar.
 */
export function correspondenA(
  codigo: string,
  etiqueta: string,
  fechaIngreso: string | null | undefined,
  vacaciones: readonly Vacacion[],
  hoy: string,
): DiasCorresponden {
  const cod = String(codigo ?? "").trim();
  const ganados = diasGanados(fechaIngreso, hoy);
  const { tomados, yaPagados } = diasTomados(vacaciones, cod);
  if (ganados === null) {
    // 🔴 SIN FECHA DE INGRESO NO SALE UN NÚMERO. Ni cero, ni «los ganados menos
    // lo tomado» —que sin la fecha sería un negativo inventado—.
    return {
      codigo: cod, etiqueta, dias: null, ganados: null,
      tomados, yaPagados, faltaFechaIngreso: true,
    };
  }
  return {
    codigo: cod, etiqueta,
    dias: ganados - tomados - yaPagados,
    ganados, tomados, yaPagados,
    faltaFechaIngreso: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LEE
//
// Los textos viven acá y no en la pantalla: los necesitan la lista, la ficha y
// el Excel el día que exista, y una segunda redacción es una segunda verdad.
// Mismo criterio que `vacaciones.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo se llama el número. 🔴 «Le corresponden», NUNCA «le quedan». */
export const ROTULO_CORRESPONDEN = "Le corresponden";

/** Lo que dice la columna cuando no hay fecha de ingreso. Es la ACCIÓN. */
export const TEXTO_FALTA_INGRESO = "Falta la fecha de ingreso";

/**
 * 🔴 LA LÍNEA QUE NO SE PUEDE SACAR. Es lo que impide que el número se lea como
 * un saldo: el sistema no sabe qué se tomó antes de que las vacaciones se
 * empezaran a cargar acá.
 *
 * Daniel, textual: *«[las ya tomadas] lo vemos después»*.
 */
export const NO_INCLUYE_ANTES =
  "No incluye vacaciones tomadas antes del 17 de septiembre de 2026.";

/** La regla, en una línea, para que el número se pueda auditar sin preguntar. */
export const COMO_SE_CALCULA =
  "30 días corridos por cada 11 meses trabajados, desde su fecha de ingreso.";

/** Un número de días, como se escribe. Un entero no se ve `12.0`. */
export function textoDias(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * «Le corresponden 20 días». Sin fecha de ingreso, la frase que dice qué falta.
 *
 * ⚠️ El singular es SOLO para el 1 exacto.
 */
export function textoCorresponden(d: DiasCorresponden): string {
  if (d.dias === null || d.faltaFechaIngreso) return TEXTO_FALTA_INGRESO;
  const uno = d.dias === 1 || d.dias === -1;
  return `${ROTULO_CORRESPONDEN} ${textoDias(d.dias)} ${uno ? "día" : "días"}`;
}

/**
 * El renglón chico de abajo: DE DÓNDE salió el número. `null` cuando no hay
 * número que explicar.
 *
 * «30 ganados · tomó 10 · ya pagados 3»
 */
export function textoDetalle(d: DiasCorresponden): string | null {
  if (d.dias === null || d.ganados === null) return null;
  const partes = [`${textoDias(d.ganados)} ganados`];
  if (d.tomados > 0) partes.push(`tomó ${d.tomados}`);
  // 🔴 Se NOMBRA aparte: son días que se cobraron, no que se descansaron, y
  // restan igual. Juntarlos con los tomados borraría esa diferencia.
  if (d.yaPagados > 0) partes.push(`ya pagados ${d.yaPagados}`);
  return partes.join(" · ");
}

/**
 * La línea que dice a cuánta gente no se le puede calcular, y por qué.
 * `null` cuando no falta ninguna — un cartel permanente se deja de leer.
 */
export function avisoSinFechaIngreso(cuantos: number): string | null {
  const n = Math.max(0, cuantos);
  if (n === 0) return null;
  const gente = n === 1
    ? "1 colaborador no tiene fecha de ingreso"
    : `${n} colaboradores no tienen fecha de ingreso`;
  return `${gente}: sin ella no se pueden calcular sus días de vacaciones.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS DOS COLUMNAS RETIRADAS — se quedan en la base, sin lectores
//
// Patrón `mayor_lineas`: lo que se retira NO se dropea. Las dos columnas quedan
// con su `COMMENT` y el candado pone el build ROJO si una migración las borra o
// si el código vuelve a leerlas.
// ─────────────────────────────────────────────────────────────────────────────

export const COLS_SALDO_VACACIONES_RETIRADAS = [
  "saldo_vacaciones_dias",
  "saldo_vacaciones_corte",
] as const;

export const MIGRACION_RETIRO_SALDO_VACACIONES =
  "20261204120000_asistencia_saldo_vacaciones_retirado.sql";
