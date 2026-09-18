/* ─────────────────────────────────────────────────────────────────────────────
 * LOS DÍAS Y LOS DOS HORARIOS, CONFIGURABLES POR PERSONA (18-sep-2026).
 *
 * Módulo PURO: sin base, sin red, sin `new Date()`. Acá viven las dos reglas
 * que el motor tenía escritas a fuego y Daniel pidió soltar:
 *
 *   A · «Hábil = lunes a viernes» para las ocho empresas.
 *   B · «Un solo horario por persona».
 *
 * Daniel, textual:
 *  · *«todo eso de horario que sea configurable por si hay cambios en un futuro»*
 *  · *«multifashion es de 10-1830»* · *«multifashion sus dias laborales es de
 *    lunes a sabado»*
 *  · *«Ana · Cindy · Yeisibeth su horario es de 9-18 cuando estan afuera. cuando
 *    estan afuera marcan por el sistema marcaciones. al igual rodrigo, su
 *    horario cambia cuando esta afuera y usa el celular de 10-1830»*
 *  · *«si marca por el telefono es el horario que te dije, que se fije por la
 *    primera marcacion pues. la persona no deberia de marcar en ambos sistemas,
 *    o es uno o es el otro»*
 *
 * Y sobre el sábado de Multifashion, las dos consecuencias aprobadas una por una:
 *  · *«1. Desaparece ese aviso — las horas del sábado dejan de ser un caso raro,
 *    son el día normal. 2. El que no viene el sábado, falta. Con su descuento,
 *    como cualquier otro día.»*
 *
 * ── A · LOS DÍAS QUE TRABAJA ─────────────────────────────────────────────────
 *
 * Cada persona tiene una lista de días laborables (1 = lunes … 6 = sábado).
 * Sale de `asistencia_horarios.dias_laborables`; con la columna en NULL manda
 * la EMPRESA de la ficha (`DIAS_LABORABLES_POR_EMPRESA`): Multifashion lunes a
 * sábado, las otras lunes a viernes. Un día laborable sin marca es AUSENCIA,
 * con su descuento de 8 horas; un día laborable con marca se mide como
 * cualquier otro. 🔑 Para Multifashion el sábado es un DÍA NORMAL: el salario
 * quincenal ya lo paga y NO se inventa ningún recargo.
 *
 * 🔴 EL DOMINGO NO SE TOCA. Nunca es laborable —aunque alguien lo mande en la
 * lista— y sigue yendo al recargo de domingo (`recargoDomingoFeriado`).
 *
 * 🔴 Y ES TODO, NO SOLO LA AUSENCIA (18-sep-2026). Daniel: *«obvio todo de
 * lunes a sábado con multifashion»*. Las tres cuentas que seguían preguntando
 * «lunes a viernes» a secas —«faltan N días hábiles», el prorrateo de quien
 * entra o sale a mitad de quincena y la deuda del día libre— pasan por
 * `diasLaborablesDelRango`, de acá, con los días de cada quien.
 *
 * ── B · LOS DOS HORARIOS ─────────────────────────────────────────────────────
 *
 * `entrada`/`salida` son los de cuando marca en el RELOJ; `entrada_afuera`/
 * `salida_afuera` los de cuando marca por el TELÉFONO. Cuál aplica lo decide
 * la PRIMERA marca del día: si vino del teléfono, el horario de afuera; si
 * vino del reloj (o de una hora agregada a mano), el de adentro.
 * 🔑 VACÍO = EL MISMO DE ADENTRO, campo por campo. Para los ~40 que nunca
 * trabajan afuera no cambia absolutamente nada.
 *
 * ── 🔴 FALLA ABIERTA ─────────────────────────────────────────────────────────
 *
 * Las tres columnas nacen con la migración SIN APLICAR (Daniel la corre). Sin
 * ella, la lectura devuelve «ninguna configuración» y TODO se comporta
 * exactamente como hoy: lunes a viernes, un horario. Un error que NO nombre
 * las columnas sí se propaga.
 *
 * ── ⚠️ LAS 48 HORAS ──────────────────────────────────────────────────────────
 *
 * Daniel: *«el máximo es 48 a la semana»*. Con los horarios de arriba nadie se
 * pasa por horario: Multifashion 7,5 h × 6 = 45; Ana afuera 8 h × 6 = 48,
 * justo en el tope. Es el LÍMITE anotado, no un tope construido: hoy el extra
 * se mide por DÍA y cambiar eso es otra pregunta que Daniel no ha hecho.
 * ────────────────────────────────────────────────────────────────────────── */

import type { EmpresaAsistencia, Resultado } from "./config";
import { DISPOSITIVO_TELEFONO } from "@/lib/marcacion/marcacion";

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/** Las columnas. Se nombran acá para que el `select`, el `upsert` y la
 *  detección del error no se puedan separar. */
export const COLUMNA_DIAS_LABORABLES = "dias_laborables";
export const COLUMNA_ENTRADA_AFUERA = "entrada_afuera";
export const COLUMNA_SALIDA_AFUERA = "salida_afuera";
export const COLUMNAS_HORARIO_CONFIGURABLE = [
  COLUMNA_DIAS_LABORABLES, COLUMNA_ENTRADA_AFUERA, COLUMNA_SALIDA_AFUERA,
] as const;
export const MIGRACION_HORARIO_CONFIGURABLE = "20261208120000_asistencia_horario_configurable.sql";

/** 0 = domingo … 6 = sábado, como `Date.getUTCDay()`. */
export const DOMINGO = 0;
export const SABADO = 6;

/** Lo de siempre: lunes a viernes. */
export const DIAS_LABORABLES_DEFAULT: readonly number[] = Object.freeze([1, 2, 3, 4, 5]);
const LUNES_A_SABADO: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6]);

/**
 * El punto de partida de cada empresa. Daniel: *«multifashion sus dias
 * laborales es de lunes a sabado»*. Las otras tres, lunes a viernes.
 * ⚠️ Solo cuenta cuando la migración ya corrió (ver `resolverDiasLaborables`).
 */
export const DIAS_LABORABLES_POR_EMPRESA: Readonly<Record<EmpresaAsistencia, readonly number[]>> =
  Object.freeze({
    confecciones_boston: DIAS_LABORABLES_DEFAULT,
    vistana: DIAS_LABORABLES_DEFAULT,
    fashion_wear: DIAS_LABORABLES_DEFAULT,
    american_classic: LUNES_A_SABADO,
  });

export function diasLaborablesDeEmpresa(empresa: string | null | undefined): readonly number[] {
  const k = String(empresa ?? "").trim();
  return (DIAS_LABORABLES_POR_EMPRESA as Record<string, readonly number[]>)[k] ?? DIAS_LABORABLES_DEFAULT;
}

/**
 * Los días en que trabaja ALGUNA de estas empresas (la unión, ordenada).
 *
 * 🔴 TODO DE LUNES A SÁBADO EN MULTIFASHION (18-sep-2026). Daniel: *«obvio todo
 * de lunes a sábado con multifashion»*. Es lo que usa el aviso «faltan N días
 * hábiles» cuando el cuadro muestra las cuatro empresas juntas: un sábado que
 * a Multifashion todavía no se le contó ES un día que falta, aunque para las
 * otras tres no lo sea. Con una sola empresa es exactamente su lista.
 */
export function diasLaborablesDeEmpresas(
  empresas: readonly (string | null | undefined)[],
): readonly number[] {
  const out = new Set<number>();
  for (const e of empresas) for (const d of diasLaborablesDeEmpresa(e)) out.add(d);
  return out.size ? [...out].sort((a, b) => a - b) : DIAS_LABORABLES_DEFAULT;
}

/**
 * Una lista de días como viene de la base o del cuerpo de un PUT → lista
 * limpia, o `null` si no hay nada que decir (y manda la empresa).
 *
 * 🔴 EL DOMINGO SE DESCARTA SIEMPRE: nunca es laborable. Y una lista vacía es
 * `null`, no «no trabaja ningún día»: una persona sin días laborables no
 * tendría ausencias nunca, y eso no es una configuración, es un agujero.
 */
export function normalizarDiasLaborables(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out = new Set<number>();
  for (const x of v) {
    const n = typeof x === "number" ? x : Number(String(x ?? "").trim());
    if (Number.isInteger(n) && n >= 1 && n <= SABADO) out.add(n);
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

/** El día de la semana de una fecha `YYYY-MM-DD`. 0 = domingo. */
export function diaDeLaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

/**
 * ¿Ese día esa persona trabaja? Sin lista, lunes a viernes: lo de siempre.
 * 🔴 El domingo devuelve `false` pase lo que pase.
 */
export function esDiaLaborable(fecha: string, dias?: readonly number[] | null): boolean {
  const dow = diaDeLaSemana(fecha);
  if (dow === DOMINGO) return false;
  return (dias && dias.length ? dias : DIAS_LABORABLES_DEFAULT).includes(dow);
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

/**
 * Los días LABORABLES de un rango, ambas fechas incluidas, para una lista de
 * días (sin lista, lunes a viernes). 🔴 ES EL ÚNICO CONTADOR DE DÍAS HÁBILES
 * DEL MÓDULO (18-sep-2026): lo usan «faltan N días hábiles» (`periodo.ts`),
 * el prorrateo de quien entra o sale a mitad de quincena
 * (`prorrateo-ingreso.ts`) y la deuda del día libre de la empresa
 * (`dia-libre-empresa.ts`). Hasta hoy cada uno tenía su bucle con «lunes a
 * viernes» escrito a mano, y Multifashion —que trabaja el sábado— cobraba de
 * menos al entrar a mitad de quincena.
 *
 * Un rango al revés, una fecha que no es fecha, o el domingo: no dan días.
 * `tope` corta el recorrido (por defecto 400: el rango libre ya está acotado a
 * 366 días por la ruta).
 */
export function diasLaborablesDelRango(
  desde: string,
  hasta: string,
  dias?: readonly number[] | null,
  tope = 400,
): string[] {
  const out: string[] = [];
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) return out;
  let t = Date.parse(`${desde}T12:00:00Z`);
  const fin = Date.parse(`${hasta}T12:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(fin)) return out;
  for (let i = 0; t <= fin && i < tope; i += 1, t += DIA_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (esDiaLaborable(iso, dias)) out.push(iso);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ HORARIO APLICA HOY — lo decide la PRIMERA marca del día
// ─────────────────────────────────────────────────────────────────────────────

/** El aparato cuyas marcas usan el horario «de afuera». */
export const DISPOSITIVO_DE_AFUERA = DISPOSITIVO_TELEFONO;

/** ¿Esta marca vino del teléfono? Sin aparato (una hora agregada a mano, o
 *  una llamada vieja que no lo trae) es del RELOJ: lo de siempre. */
export function esMarcaDeAfuera(dispositivo: string | null | undefined): boolean {
  return String(dispositivo ?? "").trim() === DISPOSITIVO_DE_AFUERA;
}

export interface HorarioConAfuera {
  entrada: string;
  salida: string;
  entrada_afuera?: string | null;
  salida_afuera?: string | null;
}

/**
 * El horario con el que se mide UN día. `deAfuera` = la primera marca vino
 * del teléfono Y hay algo configurado para afuera; con las dos horas de afuera
 * vacías el día se mide con el de adentro, aunque haya marcado por el teléfono.
 * 🔑 Vacío = el mismo de adentro, campo por campo.
 */
export function horarioDelDia(
  h: HorarioConAfuera,
  dispositivoPrimeraMarca: string | null | undefined,
): { entrada: string; salida: string; deAfuera: boolean } {
  const afuera = esMarcaDeAfuera(dispositivoPrimeraMarca);
  const entradaAfuera = limpiaHora(h.entrada_afuera);
  const salidaAfuera = limpiaHora(h.salida_afuera);
  if (!afuera || (!entradaAfuera && !salidaAfuera)) {
    return { entrada: h.entrada, salida: h.salida, deAfuera: false };
  }
  return {
    entrada: entradaAfuera ?? h.entrada,
    salida: salidaAfuera ?? h.salida,
    deAfuera: true,
  };
}

/** "HH:MM" o "HH:MM:SS" → "HH:MM"; vacío, `null` o basura → `null`. */
export function limpiaHora(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${m[1]}:${m[2]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVER LOS DÍAS DE CADA QUIEN — la columna, si no la empresa, si no L–V
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaHorarioDias {
  empleado_codigo: string;
  dias_laborables?: readonly number[] | null;
}

/**
 * Código → días laborables. Es lo que recibe el motor.
 *
 * 🔴 CON `faltaMigracion` DEVUELVE VACÍO: sin columna no hay configuración y el
 * motor cae a lunes a viernes para todo el mundo — el sistema de hoy. Recién
 * con la migración corrida la EMPRESA de la ficha se vuelve el punto de
 * partida, y la columna de la persona (si la tiene) le gana.
 */
export function resolverDiasLaborables(opts: {
  horarios: readonly FilaHorarioDias[];
  /** Código → empresa de la ficha (`asistencia_personas.empresa`). */
  empresaDe: ReadonlyMap<string, string | null | undefined>;
  faltaMigracion: boolean;
}): Map<string, readonly number[]> {
  const out = new Map<string, readonly number[]>();
  if (opts.faltaMigracion) return out;
  for (const [codigo, empresa] of opts.empresaDe) {
    out.set(codigo, diasLaborablesDeEmpresa(empresa));
  }
  for (const h of opts.horarios) {
    const propios = normalizarDiasLaborables(h.dias_laborables);
    if (propios) out.set(h.empleado_codigo, propios);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE VIENE EN EL CUERPO DE UN PUT
// ─────────────────────────────────────────────────────────────────────────────

/** Una hora obligatoria ("HH:MM"). */
export function validarHora(v: unknown, que: string): Resultado<string> {
  const h = limpiaHora(v);
  return h ? { ok: true, valor: h } : { ok: false, error: `Hora de ${que} inválida` };
}

/** Una hora opcional: ausente, `null` o vacío = «el mismo de adentro». */
export function validarHoraOpcional(v: unknown, que: string): Resultado<string | null> {
  if (v === undefined || v === null || String(v).trim() === "") return { ok: true, valor: null };
  const h = limpiaHora(v);
  return h ? { ok: true, valor: h } : { ok: false, error: `Hora de ${que} inválida` };
}

/** La lista de días del cuerpo: ausente = no se toca; `null`/vacía = manda la empresa. */
export function validarDiasLaborables(v: unknown): Resultado<number[] | null> {
  if (v === undefined) return { ok: true, valor: null };
  if (v === null || (Array.isArray(v) && v.length === 0)) return { ok: true, valor: null };
  if (!Array.isArray(v)) return { ok: false, error: "Elige los días que trabaja." };
  return { ok: true, valor: normalizarDiasLaborables(v) };
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** ¿Este error es «una de las TRES columnas no existe»? Se mira el nombre. */
export function esColumnaHorarioFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!COLUMNAS_HORARIO_CONFIGURABLE.some((c) => texto.includes(c))) return false;
  return (
    String(e.code ?? "") === "42703" ||
    String(e.code ?? "") === "PGRST204" ||
    /does not exist|no existe|could not find|schema cache/i.test(texto)
  );
}

export function avisoMigracionHorario(): string {
  return `Falta correr el SQL ${MIGRACION_HORARIO_CONFIGURABLE}: mientras tanto todos trabajan de lunes a viernes con un solo horario, como siempre.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS DE LA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

export const ROTULO_DIAS = "Días que trabaja";
export const ROTULO_RELOJ = "Cuando marca en el reloj";
export const ROTULO_TELEFONO = "Cuando marca por el teléfono";
export const NOTA_TELEFONO_VACIO = "vacío = el mismo de arriba";
export const NOTA_DOMINGO = "El domingo sigue libre, con su recargo.";

/** Lo que se muestra en cada botón de día, del lunes al sábado. */
export const DIAS_SEMANA_CORTO: Readonly<Record<number, string>> = Object.freeze({
  1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb",
});
export const DIAS_ELEGIBLES: readonly number[] = LUNES_A_SABADO;
