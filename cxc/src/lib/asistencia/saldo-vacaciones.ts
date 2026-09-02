/* ─────────────────────────────────────────────────────────────────────────────
 * EL SALDO DE VACACIONES — cuántos días le quedan a cada persona.
 *
 * Módulo PURO: sin base, sin red y sin `new Date()`. El "hoy" entra por
 * parámetro —siempre el día de PANAMÁ, `hoyPanama()`— para que los tests no
 * dependan del reloj de la máquina. Mismo criterio que `periodo.ts` y
 * `vigencia.ts`.
 *
 * ── 🩸 POR QUÉ ESTO NO ES «GANADOS DESDE QUE ENTRÓ MENOS LO TOMADO» ─────────
 *
 * Lo fue, durante un PR (#626), y era aritméticamente correcto e INÚTIL. Las
 * vacaciones solo existen en el sistema desde el 25-ago-2026 —medido por la
 * puerta de la app: UNA cargada— pero los días ganados se cuentan desde el
 * ingreso, y hay fichas de 2019. ANGELA GARCIA figuraba con **245 días
 * disponibles**: cierto, y peligroso. Alguien puede pararse en esa pantalla y
 * reclamar días que ya se tomó. Un número que no se puede usar para decidir es
 * peor que no mostrar ninguno.
 *
 * ── 🔴 EL ARRANQUE ES EL SALDO A HOY, NO LOS DÍAS TOMADOS HISTÓRICOS ────────
 *
 * Contabilidad TIENE el número en sus registros —*"a Angela le quedan 12
 * días"*— y ése lo escribe sin hacer cuentas. Pedirle *"¿cuántos días tomó
 * desde 2019?"* sería pedirle que reconstruya siete años: no lo haría nadie, y
 * la pantalla se quedaría vacía para siempre.
 *
 * ── 🔴 LA FECHA DE CORTE ES LA MITAD DEL DATO ───────────────────────────────
 *
 * "Le quedan 12" ¿a qué día? De la fecha depende QUÉ se resta después: las
 * vacaciones anteriores al corte **YA ESTÁN ADENTRO de ese 12**, y volver a
 * restarlas sería cobrarle dos veces los mismos días. El corte es la línea que
 * separa «ya contado» de «por contar», y por eso viaja pegado al número —el
 * CHECK de la base obliga a que vayan los dos o ninguno.
 *
 * ── LA CUENTA, ENTERA, EN UNA LÍNEA ─────────────────────────────────────────
 *
 *     saldo = saldo inicial
 *           − vacaciones tomadas    DESPUÉS del corte
 *           − vacaciones ya pagadas DESPUÉS del corte
 *           + lo ganado entre el corte y hoy
 *
 * ── 🔴 EL EJEMPLO NUMÉRICO (se puede auditar sin leer la función) ───────────
 *
 * ANGELA GARCIA (código 7), ingresó el **16-feb-2019**.
 * Contabilidad carga: **le quedan 12 días**, corte **25-ago-2026**.
 *
 *   Al 25-ago-2026, el mismo día del corte:
 *     ganó desde el corte = 0        (no pasó ni un mes)
 *     SALDO = 12 − 0 − 0 + 0 = 12    ← exactamente lo que ella escribió
 *
 *   Al 25-nov-2026, sin haberse tomado nada:
 *     ganados al 25-nov = 253        93 meses: 8×30 + ⌊5 × 30/11⌋ = 240 + 13
 *     ganados al corte  = 245        90 meses: 8×30 + ⌊2 × 30/11⌋ = 240 +  5
 *     ganó desde el corte = 253 − 245 = 8
 *     SALDO = 12 − 0 − 0 + 8 = 20
 *
 *   Al 25-nov-2026, si entre medio se tomó del 1 al 10 de octubre (10 días):
 *     SALDO = 12 − 10 − 0 + 8 = 10
 *
 *   Y una vacación del 1 al 10 de AGOSTO (antes del corte) NO resta nada: ya
 *   estaba adentro del 12.
 *
 * 🔑 EL INCREMENTO SE MIDE CONTRA EL INGRESO, no desde el corte. El ciclo de 11
 * meses de la ley está anclado al aniversario de entrada, así que «lo ganado
 * hasta hoy MENOS lo ganado hasta el corte» respeta ese calendario; contar 11
 * meses desde el corte lo correría para siempre. Por eso hace falta la fecha de
 * ingreso ADEMÁS del saldo, y por eso no hay dos fórmulas según qué dato haya:
 * dos fórmulas son dos verdades, y el día que se separan nadie sabe cuál vale.
 *
 * ── 🔴 LA REGLA DE LOS DÍAS GANADOS ─────────────────────────────────────────
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
 * ── 🔴 EL MEDIO DÍA ENTRA POR EL ARRANQUE, NO POR LO GANADO ─────────────────
 *
 * El saldo admite MEDIOS días (12,5) desde el 26-ago-2026: la contadora lleva
 * la planilla a mano en Excel y que aparezcan medios días es más probable que
 * lo contrario. Pero entra por UN solo lado —el número que escribe
 * contabilidad— y de ahí se arrastra a la resta.
 *
 * ⚠️ LO GANADO SIGUE DANDO ENTEROS. El prorrateo se sigue truncando a día
 * entero, y eso NO se toca: es una regla de plata ya medida, y medio día de más
 * es medio día que alguien se va sin haberlo ganado. Los días tomados también
 * son enteros —son días de calendario—, así que la única fuente de un `,5` en
 * toda la cadena es el arranque.
 *
 * ⚠️ Y NO HAY CUARTOS. Solo múltiplos de 0,5, en el validador y en el CHECK de
 * la base: un cuarto de día de vacaciones no existe en la práctica, así que un
 * 12,3 no es un dato, es un error de tipeo — y el candado lo atrapa.
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
 * dos unidades distintas y regalarle a cada persona ~8 días por mes tomado.
 *
 * ── 🔴 LAS "YA PAGADAS" TAMBIÉN BAJAN DEL SALDO ─────────────────────────────
 *
 * La regla es de la contadora, textual: *"Si la persona había cobrado sus
 * vacaciones anteriormente en dinero y no se había ido esos tres días, yo se
 * los descuento porque ya se los pagué"*. El derecho se consumió igual —se
 * cobró en vez de disfrutarse—, así que baja del saldo exactamente como si se
 * hubiera ido. Se llevan en un contador APARTE por una sola razón: quien mire
 * el renglón tiene que poder distinguir los días que descansó de los que le
 * pagaron. Los dos restan.
 *
 * ── 🔴 SIN LOS DOS DATOS NO HAY SALDO. NI CERO. NI UN NÚMERO GRANDE. ────────
 *
 * `saldo` es `number | null`, y el `null` no se puede confundir con un `0` por
 * accidente. Quien no tiene fecha de ingreso, o no tiene saldo inicial cargado,
 * **aparece en la lista** diciendo cuál de los dos le falta — que además es la
 * acción que hay que hacer. Nada se descarta en silencio, y tampoco se muestra
 * un número que engaña.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";
import { esFechaValida } from "./vigencia";
import { diasDeVacacion, type Vacacion } from "./vacaciones";

// ─────────────────────────────────────────────────────────────────────────────
// LA LEY, EN DOS NÚMEROS
// ─────────────────────────────────────────────────────────────────────────────

/** Los días que se ganan por cada período cumplido. Código de Trabajo, art. 54. */
export const DIAS_POR_PERIODO = 30;

/** Cuántos meses de trabajo cierran un período. ONCE, no doce. Ver la cabecera. */
export const MESES_POR_PERIODO = 11;

/** Tope de cordura del saldo inicial, el mismo que el CHECK de la base. */
export const SALDO_INICIAL_MAX = 999;

/**
 * El escalón más chico del saldo: MEDIO día.
 *
 * 🔑 Es el mismo que exige el CHECK `asistencia_personas_saldo_vac_medio`. Está
 * acá arriba y con nombre para que quien lo cambie tenga que ver, en la misma
 * pantalla, que hay una regla de base que también hay que mover.
 */
export const PASO_SALDO = 0.5;

/**
 * Redondea al medio día más cercano.
 *
 * 🔑 Todos los sumandos del saldo son múltiplos de 0,5 y 0,5 es exacto en punto
 * flotante, así que la cuenta ya sale bien sin esto. Se normaliza igual porque
 * lo que protege no es la aritmética de hoy: es el día que alguien sume un
 * tercer término y aparezca un 10,499999999999998 en la pantalla de la
 * contadora.
 */
export function aMedioDia(n: number): number {
  return Math.round(n / PASO_SALDO) * PASO_SALDO;
}

/**
 * Los días que vienen de la BASE, sean lo que sean.
 *
 * 🩸 POSTGREST DEVUELVE LOS `numeric` COMO TEXTO. No es teoría: en este mismo
 * módulo `salario_mensual` —que es `numeric(12,2)`— se lee con un `Number(...)`
 * por exactamente eso. Desde que el saldo dejó de ser `integer` (26-ago-2026)
 * empezó a llegar como `"12.5"`, y un `typeof === "number"` lo habría tirado a
 * `null`: la pantalla diría «Falta el saldo» de alguien que SÍ lo tiene
 * cargado, y nadie sabría por qué.
 *
 * ⚠️ La cadena vacía NO es cero: es «no hay dato». `Number("")` da 0 y ese cero
 * se leería como «no le queda ni un día».
 */
export function numeroDeDias(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

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
 * 🔴 Nunca `0` por falta de dato — ver la cabecera.
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

/**
 * Lo que ganó ENTRE el corte y hoy: lo ganado hasta hoy menos lo ganado hasta
 * el corte.
 *
 * 🔑 Se resta contra el MISMO calendario (el aniversario de ingreso) en vez de
 * contar 11 meses desde el corte. Ver la cabecera: el corte es una foto, no un
 * nuevo aniversario, y arrancar el ciclo ahí lo correría para siempre.
 *
 * Nunca negativo: un corte en el futuro no le puede quitar días a nadie.
 */
export function ganadosDesdeElCorte(
  fechaIngreso: string | null | undefined,
  corte: string | null | undefined,
  hoy: string,
): number | null {
  if (!esFechaValida(corte)) return null;
  const aHoy = diasGanados(fechaIngreso, hoy);
  const alCorte = diasGanados(fechaIngreso, String(corte).trim());
  if (aHoy === null || alCorte === null) return null;
  return Math.max(0, aHoy - alCorte);
}

// ─────────────────────────────────────────────────────────────────────────────
// LO GASTADO — SOLO LO QUE PASÓ DESPUÉS DEL CORTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los días de esta vacación que caen DESPUÉS del corte.
 *
 * 🔴 Una vacación entera anterior al corte devuelve 0: esos días ya están
 * adentro del saldo que cargó contabilidad, y restarlos otra vez sería
 * cobrárselos dos veces.
 *
 * ⚠️ Y una vacación que CRUZA el corte se parte: se restan solo los días
 * posteriores. Tirar la vacación entera —o contarla entera— por caer a caballo
 * del corte inventaría o regalaría días sin decirlo.
 */
export function diasDespuesDelCorte(desde: string, hasta: string, corte: string): number {
  const total = diasDeVacacion(desde, hasta);
  if (total === 0 || !esFechaValida(corte)) return 0;
  // Se comparan como TEXTO: en `YYYY-MM-DD` el orden alfabético ES el
  // cronológico. El día del corte cuenta como YA absorbido.
  if (hasta <= corte) return 0;
  if (desde > corte) return total;
  return total - diasDeVacacion(desde, corte);
}

export interface DiasGastados {
  /** Días que la persona se tomó DESPUÉS del corte (sin marcar «ya se le pagó»). */
  tomados: number;
  /** Días que cobró en efectivo y no disfrutó, después del corte. **También restan.** */
  yaPagados: number;
}

/**
 * Los días que esta persona gastó después del corte, en los dos contadores.
 *
 * ⚠️ Recorre TODAS las vacaciones que se le pasen y filtra por el corte acá
 * adentro: quien llame tiene que darle la lista completa. Filtrarla antes por
 * un rango de fechas devolvería un saldo inflado sin decir por qué.
 */
export function diasGastados(
  vacaciones: readonly Vacacion[],
  codigo: string,
  corte: string,
): DiasGastados {
  const cod = String(codigo ?? "").trim();
  let tomados = 0;
  let yaPagados = 0;
  for (const v of vacaciones) {
    if (String(v?.empleado_codigo ?? "").trim() !== cod) continue;
    const dias = diasDespuesDelCorte(v.desde, v.hasta, corte);
    if (dias === 0) continue;
    if (v.ya_pagadas) yaPagados += dias;
    else tomados += dias;
  }
  return { tomados, yaPagados };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL SALDO
// ─────────────────────────────────────────────────────────────────────────────

/** Qué dato falta para poder calcular. `null` = no falta ninguno. */
export type FaltaDato = "fecha" | "saldo" | "ambos";

/** Lo que la ficha aporta al cálculo. */
export interface DatosSaldo {
  /** Ancla del ciclo de 11 meses. Sin esto no se sabe cuánto gana. */
  fechaIngreso: string | null;
  /** Los días que le quedaban al corte, escritos por contabilidad. */
  saldoInicial: number | null;
  /** El día al que ese número es cierto. Va SIEMPRE junto con el anterior. */
  corte: string | null;
}

export interface SaldoVacaciones {
  codigo: string;
  /** El nombre, o el código si todavía no tiene ficha. NUNCA vacío. */
  etiqueta: string;
  /** `null` = falta un dato. NO es cero. */
  saldo: number | null;
  /** Lo que cargó contabilidad, tal cual. `null` si no lo cargó. */
  saldoInicial: number | null;
  /** El día del corte. `null` si no hay saldo inicial. */
  corte: string | null;
  /** Lo ganado ENTRE el corte y hoy. */
  ganadosDesdeCorte: number;
  /** Días tomados después del corte. */
  tomados: number;
  /** Días ya pagados después del corte. También restan. */
  yaPagados: number;
  /** Qué falta para poder calcular. `null` = no falta nada. */
  falta: FaltaDato | null;
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
  datos: DatosSaldo,
  vacaciones: readonly Vacacion[],
  hoy: string,
): SaldoVacaciones {
  const hayFecha = esFechaValida(datos.fechaIngreso);
  // 🔑 Los dos juntos o ninguno, igual que el CHECK de la base. Un saldo sin
  // corte es un saldo a un día que nadie sabe: no se puede usar para restar.
  const haySaldo =
    typeof datos.saldoInicial === "number"
    && Number.isFinite(datos.saldoInicial)
    && esFechaValida(datos.corte);

  const base = {
    codigo: String(codigo ?? "").trim(),
    etiqueta,
    saldoInicial: haySaldo ? datos.saldoInicial : null,
    corte: haySaldo ? String(datos.corte).trim() : null,
  };

  if (!hayFecha || !haySaldo) {
    // 🔴 EL CANDADO: falta un dato, no sale un número. Ni cero, ni el saldo
    // inicial pelado —que sin la fecha no se puede hacer crecer y se quedaría
    // congelado mintiendo—.
    return {
      ...base,
      saldo: null,
      ganadosDesdeCorte: 0,
      tomados: 0,
      yaPagados: 0,
      falta: !hayFecha && !haySaldo ? "ambos" : !hayFecha ? "fecha" : "saldo",
    };
  }

  const corte = String(datos.corte).trim();
  const { tomados, yaPagados } = diasGastados(vacaciones, codigo, corte);
  const ganadosDesdeCorte = ganadosDesdeElCorte(datos.fechaIngreso, corte, hoy) ?? 0;

  return {
    ...base,
    ganadosDesdeCorte,
    tomados,
    yaPagados,
    saldo: aMedioDia((datos.saldoInicial as number) - tomados - yaPagados + ganadosDesdeCorte),
    falta: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LEE
//
// Los textos viven acá y no en la pantalla: son los mismos que van a necesitar
// el Excel y el papel el día que existan, y una segunda redacción es una
// segunda verdad. Mismo criterio que `vacaciones.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo se llama el campo en la ficha. Corto y en español simple. */
export const ETIQUETA_SALDO_INICIAL = "Días de vacaciones que le quedan hoy";

/** Lo que dice la columna según qué dato falte. Es la ACCIÓN, no un guion. */
export const TEXTO_FALTA: Record<FaltaDato, string> = {
  fecha: "Falta la fecha de ingreso",
  saldo: "Falta el saldo",
  ambos: "Faltan la fecha de ingreso y el saldo",
};

/**
 * Un número de días, como se escribe: `12` entero, `12.5` con medio día.
 *
 * 🔴 EL `12` NO SE VE `12.0`. Un decimal permanente ensucia una columna que se
 * lee de un vistazo y hace que el caso raro —el medio día— deje de saltar a la
 * vista, que es justo para lo que está.
 *
 * 🔑 El punto es el separador decimal de `es-PA` (`(12.5).toLocaleString(
 * "es-PA")` → `"12.5"`), el MISMO que ya usa el resto del módulo para la plata
 * (`$194.80`, `$3.02`). Una coma acá sería una segunda convención en la misma
 * pantalla.
 */
export function textoDias(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-08-25» → «25 ago 2026». La misma forma que usa el resto del módulo. */
export function fechaCortaSaldo(f: string): string {
  const p = partes(f);
  return p ? `${p.dia} ${MESES_CORTOS[p.mes - 1]} ${p.anio}` : "";
}

/**
 * La columna de saldo, corta: «20 días», «12.5 días». Sin el dato, la frase que
 * dice qué falta hacer.
 *
 * ⚠️ El singular es SOLO para el 1 exacto: «0.5 días» y «1.5 días» van en
 * plural, que es como se dice.
 */
export function textoSaldo(s: SaldoVacaciones): string {
  if (s.saldo === null || s.falta !== null) return TEXTO_FALTA[s.falta ?? "saldo"];
  const uno = s.saldo === 1 || s.saldo === -1;
  return `${textoDias(s.saldo)} ${uno ? "día" : "días"}`;
}

/**
 * El renglón chico de abajo: DE DÓNDE salió ese número, para poder auditarlo
 * sin abrir otra pantalla. `null` cuando no hay saldo que explicar.
 *
 * «12 al 25 ago 2026 · +8 ganados · tomó 10 · ya pagados 3»
 */
export function textoDetalle(s: SaldoVacaciones): string | null {
  if (s.saldo === null || s.saldoInicial === null || s.corte === null) return null;
  const partes = [`${textoDias(s.saldoInicial)} al ${fechaCortaSaldo(s.corte)}`];
  if (s.ganadosDesdeCorte > 0) partes.push(`+${s.ganadosDesdeCorte} ganados`);
  if (s.tomados > 0) partes.push(`tomó ${s.tomados}`);
  // 🔴 Se NOMBRA aparte: son días que se cobraron, no que se descansaron, y
  // restan igual. Juntarlos con los tomados borraría esa diferencia.
  if (s.yaPagados > 0) partes.push(`ya pagados ${s.yaPagados}`);
  return partes.join(" · ");
}

/**
 * La línea que dice cuánta gente se quedó SIN saldo y por qué.
 * `null` cuando no falta ninguna — un cartel permanente se deja de leer.
 *
 * 🔴 Lleva el DÓNDE, no solo el cuánto: sin eso es una queja, no una tarea.
 *
 * ⚠️ Los dos números son DISJUNTOS: `sinFecha` cuenta a quien le falta la fecha
 * de ingreso (con o sin saldo) y `sinSaldo` a quien SÍ tiene la fecha y solo le
 * falta el saldo. Solapados, la suma no daría el total y el aviso se leería
 * como si hubiera más gente de la que hay.
 */
export function avisoSinSaldo(sinFecha: number, sinSaldo: number): string | null {
  const f = Math.max(0, sinFecha);
  const s = Math.max(0, sinSaldo);
  const total = f + s;
  if (total === 0) return null;
  const gente = total === 1 ? "1 persona no tiene saldo" : `${total} personas no tienen saldo`;
  const donde = "Se cargan en Configuración.";
  if (f > 0 && s > 0) {
    return `${gente}: a ${f} les falta la fecha de ingreso y a ${s} el saldo. ${donde}`;
  }
  if (f > 0) return `${gente}: les falta la fecha de ingreso. ${donde}`;
  return `${gente}: falta cargárselo en «${ETIQUETA_SALDO_INICIAL}». ${donde}`;
}

/**
 * La línea que dice desde cuándo cuenta la resta. **No se puede sacar.**
 *
 * 🔑 Es lo que hace que el número se entienda en vez de solo creerse: el saldo
 * arranca del que escribió contabilidad, y de ahí en adelante el sistema suma
 * lo que se gana y resta lo que se carga acá.
 */
export const DESDE_CUANDO_CUENTA =
  "Arranca del saldo que carga contabilidad y desde esa fecha suma lo ganado y "
  + "resta las vacaciones cargadas aquí.";

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN — el validador recibe `unknown` y convierte él
//
// Mismo criterio que `config.ts` y `seguros.ts`: con un `Number(x)` afuera, un
// `null` llegaría como 0 y un saldo de cero entraría sin que nadie lo escribiera.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El saldo inicial que viene en el cuerpo de un PUT.
 *
 * Vacío es un valor VÁLIDO y significa «todavía no se cargó» → `null`, que es
 * como están las 38 fichas y lo que hace que la pantalla diga «Falta el saldo».
 *
 * 🔑 MEDIOS DÍAS SÍ, CUARTOS NO. Se aceptan `12` y `12.5`; un `12.25` o un
 * `12.3` se rechazan con un mensaje en español. Es el MISMO candado que el
 * CHECK `asistencia_personas_saldo_vac_medio`: en la base porque cualquier
 * camino tiene que respetarlo, y acá porque un error de la contadora se explica
 * en su idioma y no con «violates check constraint».
 *
 * ⚠️ Se traga la COMA decimal («12,5»): es como se escribe un decimal en medio
 * mundo, y es lo mismo que ya hace el campo del salario de esta pantalla.
 * Rechazar un `12,5` por el separador sería rechazar un dato correcto.
 */
export function validarSaldoInicial(body: unknown): Resultado<number | null> {
  const b = (body ?? {}) as Record<string, unknown>;
  const v = b.saldoVacacionesDias;
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    return { ok: true, valor: null };
  }
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Los días que le quedan tienen que ser un número." };
  }
  // 🔑 Se compara contra el valor ORIGINAL, no contra el redondeado: `aMedioDia`
  // convertiría un 12,3 en 12,5 y lo guardaría como si nada — que es
  // exactamente el error de tipeo que este candado viene a atrapar.
  if (aMedioDia(n) !== n) {
    return {
      ok: false,
      error: "Los días que le quedan van de medio en medio: 12 o 12.5, no 12.3.",
    };
  }
  if (n < -SALDO_INICIAL_MAX || n > SALDO_INICIAL_MAX) {
    return { ok: false, error: `Los días que le quedan tienen que estar entre -${SALDO_INICIAL_MAX} y ${SALDO_INICIAL_MAX}.` };
  }
  return { ok: true, valor: n };
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `seguros.ts` y `vigencia.ts`: en este proyecto los DDL los
// corre Daniel a mano y varios se quedaron pendientes semanas. Sin las
// columnas, TODO el módulo sigue funcionando —nadie tiene saldo inicial, o sea
// que la pantalla dice «Falta el saldo» y no muestra ningún número— y
// Configuración dice qué archivo falta en vez de romperse.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_SALDO_VACACIONES =
  "20260826040000_asistencia_saldo_vacaciones_inicial.sql";

/** La que le agrega los MEDIOS días. Va después de la de arriba. */
export const MIGRACION_SALDO_MEDIOS_DIAS =
  "20260826060000_asistencia_saldo_vacaciones_medios_dias.sql";

/** Las columnas nuevas. Se listan acá para que el `select` y la detección del
 *  error no se puedan separar: si mañana se agrega una tercera, va en un lugar. */
export const COLS_SALDO_VACACIONES = [
  "saldo_vacaciones_dias",
  "saldo_vacaciones_corte",
] as const;

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es «todavía no existen las columnas del saldo»?
 *
 * Hermano de `esColumnaPagaSegurosFaltante`: `42703` es "undefined_column" de
 * Postgres (lo tira el `select`) y `PGRST204` el de PostgREST cuando la columna
 * no está en su caché de esquema (lo tira el `upsert`).
 *
 * ⚠️ El error tiene que NOMBRAR una de las columnas. Tragarse cualquier error
 * convertiría un problema real —permisos, red, RLS— en una pantalla que miente
 * diciendo "falta la migración".
 */
export function esColumnaSaldoVacacionesFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!COLS_SALDO_VACACIONES.some((c) => texto.includes(c))) return false;

  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

/**
 * ¿Este error es «la columna todavía es `integer` y le mandaron medio día»?
 *
 * 🩸 EXISTE POR UNA VENTANA REAL. La migración del saldo (20260826040000) ya
 * está corrida en producción y creó la columna como `integer`; la de los medios
 * días (20260826060000) la corre Daniel aparte. En el medio, un `12.5` lo
 * rechaza Postgres con `22P02: invalid input syntax for type integer` — un
 * texto en inglés, con jerga de base, en la cara de la contadora.
 *
 * ⚠️ Quien llame TIENE que comprobar antes que el valor que se estaba guardando
 * de verdad tenía medio día. El error no nombra la columna, así que sin esa
 * condición cualquier `22P02` de la fila se leería como «falta esta migración».
 */
export function esSaldoTodaviaEntero(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (String(e.code ?? "") === "22P02") return true;
  return /invalid input syntax for type integer|sintaxis de entrada no v[áa]lida/i.test(texto);
}

export function avisoMigracionSaldoMediosDias(): string {
  return (
    "Todavía no se pueden cargar medios días: falta preparar la base de datos. "
    + `Pídele a Daniel que corra el archivo ${MIGRACION_SALDO_MEDIOS_DIAS} en Supabase. `
    + "Mientras tanto se puede cargar el saldo en días enteros."
  );
}

export function avisoMigracionSaldoVacaciones(): string {
  return (
    "Todavía no se puede cargar el saldo de vacaciones de nadie: falta preparar "
    + `la base de datos. Pídele a Daniel que corra el archivo ${MIGRACION_SALDO_VACACIONES} `
    + "en Supabase. Mientras tanto todo lo demás funciona igual."
  );
}
