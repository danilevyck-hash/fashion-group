/* ─────────────────────────────────────────────────────────────────────────────
 * QUIÉN TRABAJA AFUERA — la casilla de la ficha (14-sep-2026).
 *
 * Daniel, textual:
 *  · *«a ellas cuando están afuera se les paga el día regular como si hubiesen
 *    trabajado las 8 horas, en horario de 9-6, con una hora de almuerzo»*
 *  · *«cuando marcan, que es cuando trabajan en la tienda, trabajan de 10 a 7»*
 *
 * Módulo PURO: sin base, sin red. Acá viven el DATO, las palabras y LA REGLA
 * del día sin marca. El motor del reporte (`reporte.ts`) le pregunta a la regla
 * qué hacer con un día hábil sin marcas; el de la planilla (`planilla.ts`) deja
 * de pedirle «no marcó ni un día» a quien la tiene; el I/O, `config-server.ts`.
 *
 * ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
 *
 * Ana Trejos (2) y Cindy De Gracia (3) son impulsadoras: trabajan fuera de la
 * tienda casi todo el mes y por eso no marcan el reloj. Medido del 16-ago al
 * 15-sep-2026: **1 día con marca de 22 hábiles**, cada una. El sistema contaba
 * cada día sin marca como AUSENCIA y se la descontaba; la contadora les pagaba
 * el mes completo a mano. En Rodrigo Miranda (13) eso fue **$296,26 de
 * diferencia** en una sola quincena.
 *
 * Ya existía el motivo «Trabajo de vendedor», que hace exactamente esto POR
 * DÍA y A MANO. Con 21 días afuera al mes por persona, cargarlos cada quincena
 * es la solución equivocada: 🔴 **nadie carga nada, nunca**. La decisión es de
 * la FICHA y se aplica sola.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────
 *
 *   MARCÓ ese día  → se mide del reloj, EXACTAMENTE como hoy: su horario, sus
 *                    tardanzas, sus horas extra, su salida temprana.
 *   NO MARCÓ       → NO es ausencia: se paga el día completo, como un día
 *                    normal de 8 horas. Es «Trabajo de vendedor» puesto solo.
 *
 * Y SOLO decide sobre un día hábil, ya pasado, sin marca y sin ninguna otra
 * explicación (`motivoAutomaticoDelDiaSinMarca`):
 *
 *   · Un FERIADO sin marca no se toca: ya no descontaba, y no hay nada que
 *     pagar de más. Un feriado trabajado sigue yendo al recargo de feriado.
 *   · Un SÁBADO o DOMINGO sin marca no se toca: no son días hábiles, nunca
 *     fueron ausencia, y marcarlos como «día afuera» los haría contar como
 *     días trabajados fuera que nadie trabajó.
 *   · Una VACACIÓN manda (el reporte la resuelve ANTES de mirar las marcas):
 *     una vacación «ya pagada» se sigue descontando aunque la casilla esté
 *     prendida — esos días ya se cobraron.
 *   · Una JUSTIFICACIÓN cargada manda: el día dice «Incapacidad», no «afuera».
 *   · El día EN CURSO (hoy y los que vienen) no se juzga, como todo lo demás.
 *
 * ── ⚠️ NO ES «NO MARCA EL RELOJ» (`sueldo-fijo.ts`) ─────────────────────────
 *
 * Esa casilla —la de Edwin— apaga el reloj SIEMPRE: ni tardanzas, ni extras,
 * ni ausencias, marque o no marque. Acá el día que SÍ marca se mide normal. Son
 * dos cosas distintas y conviven: si alguien tuviera las dos, «no marca el
 * reloj» gana (el motor la aplica después y cera las horas), que es lo que esa
 * casilla promete.
 *
 * ── ⚠️ Y EL MOTIVO «TRABAJO DE VENDEDOR» SIGUE EXISTIENDO ────────────────────
 *
 * Para el caso suelto de alguien SIN la casilla que un día trabajó afuera. Lo
 * nuevo es el automático por ficha, no un motivo distinto: el día sin marca de
 * quien trabaja afuera se lee igual que uno justificado a mano («Trabajando
 * fuera de la oficina (vendedor)»), suma en `diasTrabajandoFuera` y nunca en
 * las ausencias.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";
import { MOTIVO_TRABAJO_VENDEDOR } from "./motivos";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo se pregunta en la ficha. */
export const PREGUNTA_TRABAJA_AFUERA = "¿Trabaja afuera?";
export const ETIQUETA_NO_TRABAJA_AFUERA = "No, el día sin marca es ausencia";
export const ETIQUETA_TRABAJA_AFUERA = "Sí, el día sin marca se paga completo";

/** Qué significa prenderla, dicho UNA sola vez. Una línea. */
export const EXPLICACION_TRABAJA_AFUERA =
  "Los días hábiles sin marca se pagan como un día normal de 8 horas, sin cargar nada. "
  + "Cuando marca, manda el reloj: tardanzas y horas extra se miden como siempre.";

/** La etiqueta de excepción en la ficha, la lista y la planilla. */
export const CHIP_TRABAJA_AFUERA = "Trabaja afuera";

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/** La columna. Se nombra acá para que el `select`, el `update` y la detección
 *  del error no se puedan separar. */
export const COLUMNA_TRABAJA_AFUERA = "trabaja_afuera";
export const MIGRACION_TRABAJA_AFUERA = "20261124120000_asistencia_trabaja_afuera.sql";

/**
 * ¿Esta ficha trabaja afuera?
 *
 * 🔑 SOLO `true` cuenta. `null`, `undefined` o la columna sin crear significan
 * NO, que es como están las 47 fichas el día que nace la casilla. La asimetría
 * va para este lado a propósito: prenderla por accidente le pagaría días
 * enteros a alguien que faltó, y eso no se ve hasta que ya se pagó. Por eso
 * el día que la migración corra NO SE MUEVE UN CENTAVO.
 */
export function trabajaAfuera(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * Lo que viene en el cuerpo de un PUT. Mismo criterio que `sueldo-fijo.ts`: el
 * validador recibe `unknown` y decide él. Ausente = `false`, el valor que no
 * le regala un día a nadie.
 */
export function validarTrabajaAfuera(body: unknown): Resultado<boolean> {
  const b = (body ?? {}) as Record<string, unknown>;
  const v = b.trabajaAfuera;
  if (v === undefined || v === null || v === "") return { ok: true, valor: false };
  if (v === true || v === false) return { ok: true, valor: v };
  if (v === "true" || v === "false") return { ok: true, valor: v === "true" };
  return { ok: false, error: "Elige si trabaja afuera o no." };
}

// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA — qué pasa con un día hábil sin marca
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que el reporte ya sabe del día antes de decidir si es ausencia. */
export interface DiaSinMarca {
  /** ¿Esta ficha tiene la casilla prendida? */
  trabajaAfuera: boolean;
  /** Lunes a viernes. */
  habil: boolean;
  /** El nombre del feriado, o `null`. */
  feriado: string | null;
  /** Hoy o después: todavía no se juzga. */
  enCurso: boolean;
  /** La justificación de día entero que ya lo cubre, o `null`. */
  justificado: string | null;
}

/**
 * El motivo que se le pone SOLO a un día sin marca, o `null` si no le toca.
 *
 * 🔴 ES EXACTAMENTE LA CONDICIÓN QUE LO HABRÍA HECHO AUSENCIA. Si el reporte
 * lo iba a contar como falta —día hábil, ya pasado, sin feriado y sin
 * justificación— y la persona trabaja afuera, el día pasa a ser «Trabajo de
 * vendedor». En cualquier otro caso no se toca nada: un feriado, un fin de
 * semana, un día en curso o un día ya justificado siguen siendo lo que eran.
 *
 * 🔑 Devuelve el MISMO motivo que se carga a mano, no uno nuevo: así el día se
 * lee, se cuenta y se paga igual por los dos caminos, y hay una sola regla de
 * «no es ausencia» en todo el módulo (`esTrabajoDeVendedor`).
 */
export function motivoAutomaticoDelDiaSinMarca(d: DiaSinMarca): string | null {
  if (!d.trabajaAfuera) return null;
  if (d.enCurso || !d.habil || d.feriado || d.justificado) return null;
  return MOTIVO_TRABAJO_VENDEDOR;
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// 🔴 La columna nace con la migración SIN APLICAR: Daniel la corre cuando
// decida prenderle la casilla a alguien. Mientras tanto la lectura de la
// columna va APARTE del `select` de las fichas (`leerTrabajaAfuera`, en
// `config-server.ts`) y falla ABIERTA a «nadie la tiene» — que es exactamente
// el sistema de hoy. Un error que NO nombre la columna sí se propaga.
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es "todavía no existe la columna"?
 *
 * Hermano de `esColumnaNoMarcaRelojFaltante` (`sueldo-fijo.ts`): `42703` es
 * "undefined_column" de Postgres (lo tira el `select`) y `PGRST204` el de
 * PostgREST cuando la columna no está en su caché de esquema (lo tira el
 * `update`).
 *
 * ⚠️ El error tiene que NOMBRAR la columna. Tragarse cualquier error convertiría
 * un problema real —permisos, red, RLS— en una planilla que dice «nadie
 * trabaja afuera» con la pantalla tranquila.
 */
export function esColumnaTrabajaAfueraFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!texto.includes(COLUMNA_TRABAJA_AFUERA)) return false;

  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionTrabajaAfuera(): string {
  return (
    "Todavía no se puede marcar a nadie como «trabaja afuera»: falta preparar la "
    + `base de datos. Pídele a Daniel que corra el archivo ${MIGRACION_TRABAJA_AFUERA} `
    + "en Supabase. Mientras tanto todo lo demás de la ficha se guardó igual."
  );
}
