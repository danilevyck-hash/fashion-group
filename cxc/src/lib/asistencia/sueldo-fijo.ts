/* ─────────────────────────────────────────────────────────────────────────────
 * QUIÉN COBRA FIJO Y NO PASA POR EL RELOJ — «no marca el reloj».
 *
 * Módulo PURO: sin base, sin red. Acá vive el DATO y las palabras; el efecto
 * sobre el dinero lo aplica `planilla.ts` (que es donde se decide si una línea
 * produce un número) y el I/O, `config-server.ts`.
 *
 * ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
 *
 * Daniel, textual (25-ago-2026): *"Edwin → crearle ficha con $700/mes marcado
 * como no marca el reloj"*. EDWIN GOMEZ vende en la calle: no pasa por el
 * aparato ni un día, y aun así cobra su quincena completa. Su fila del Excel de
 * Vistana lo dice sin una palabra: es la ÚNICA de las seis que **no tiene
 * fórmula** en horas extra, ausencias, tardanzas, domingos ni feriados. Solo
 * `=C10/2`. La contadora tampoco le calcula nada del reloj.
 *
 * El módulo no sabía decir eso. Ante CERO marcaciones el motor se abstiene
 * —`FALTA.sinMarcaciones`, ver `planilla.ts`— porque no puede distinguir a
 * quien renunció de quien estuvo de vacaciones. Para Edwin esa abstención está
 * mal: lo dejaría en la lista de pendientes TODAS las quincenas, esperando que
 * alguien decida algo que ya está decidido, y el riesgo real es que una
 * quincena nadie lo mire y no cobre.
 *
 * ── LOS DOS EFECTOS, Y NINGUNO MÁS ───────────────────────────────────────────
 *
 *   1. NO ES UN PENDIENTE POR NO MARCAR. No se le agrega «no marcó ni un día» y
 *      no se le busca justificación: produce su neto solo, todas las quincenas.
 *   2. 🔴 EL RELOJ SE IGNORA SIEMPRE, no solo cuando no hay marcas.
 *
 * ── 🩸 POR QUÉ EL SEGUNDO EFECTO ES EL QUE IMPORTA ───────────────────────────
 *
 * Si el reloj se ignorara SOLO cuando no hay marcaciones, el día que alguien
 * use su código —se lo prestan, se lo reasignan, el aparato lo emite por error—
 * le aparecerían ausencias, tardanzas y horas extra INVENTADAS, y le cambiarían
 * el pago sin que nadie lo vea hasta el día de cobro. Un sueldo fijo que se
 * mueve solo es exactamente el error que este módulo existe para no cometer.
 *
 * Por eso el candado no pregunta si hubo marcas: pregunta por la bandera.
 *
 * ── ⚠️ POR QUÉ NO ES «SERVICIO PROFESIONAL» NI «NO TIENE MARCACIONES» ────────
 *
 * No es servicio profesional: eso es lo CONTRARIO —mide asistencia y no calcula
 * pago—, y Edwin cobra por planilla, con seguros y todo. No es «no tiene
 * marcaciones»: eso es ambiguo, y la ambigüedad es justo la que hace que el
 * motor se abstenga. Un código sin marcas puede ser alguien que renunció, que
 * está de vacaciones, o que nunca marcó porque no le toca. El dato tiene que
 * decir la INTENCIÓN, no deducirse de una ausencia de filas.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS — en español simple, cortas
// ─────────────────────────────────────────────────────────────────────────────

/** El rótulo de la opción normal. */
export const ETIQUETA_MARCA_RELOJ = "Marca el reloj";
/** El rótulo de la otra. Las palabras de Daniel, sin jerga. */
export const ETIQUETA_NO_MARCA_RELOJ = "No marca el reloj (sueldo fijo)";

/** Cómo se pregunta en la ficha. */
export const PREGUNTA_MARCA_RELOJ = "¿Marca en el reloj?";

/**
 * Qué significa, dicho UNA sola vez y usado en los lugares donde hace falta (la
 * ficha, la lista de la planilla y el Excel). Dos redacciones del mismo hecho es
 * la forma de que terminen contradiciéndose.
 *
 * 🔑 Una línea. Daniel no lee párrafos explicativos y los pidió fuera de la UI.
 */
export const EXPLICACION_NO_MARCA_RELOJ =
  "Cobra su quincena completa sin pasar por el reloj: no se le cuentan "
  + "ausencias, tardanzas ni horas extra.";

/** Lo que se muestra al lado de su quincenal, para que el 0,00 de las columnas
 *  del reloj no se lea como un error de cálculo. */
export const CHIP_NO_MARCA_RELOJ = "sueldo fijo";

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Esta ficha cobra fijo sin marcar?
 *
 * 🔑 Solo `true` cuenta. Un `null`, un `undefined` o la columna todavía sin
 * crear significan lo mismo: la persona SÍ marca, que es como estaban las 39
 * fichas antes de este cambio. Ante la duda nadie deja de mirarse contra el
 * reloj — y por eso el día que esta migración corre NO SE MUEVE UN CENTAVO.
 *
 * La asimetría va para este lado a propósito: prender la bandera por accidente
 * le pagaría la quincena entera a alguien que faltó dos semanas, y eso no se ve
 * en ningún lado hasta que ya se pagó.
 */
export function noMarcaReloj(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * Lo que viene en el cuerpo de un PUT. Mismo criterio que `participacion.ts` y
 * `seguros.ts`: el validador recibe `unknown` y decide él.
 *
 * Ausente = `false` (marca el reloj). No es laxitud: el formulario manda siempre
 * el campo, y para cualquier otro llamador el valor seguro es el que NO le
 * regala una quincena a nadie.
 */
export function validarNoMarcaReloj(body: unknown): Resultado<boolean> {
  const b = (body ?? {}) as Record<string, unknown>;
  const v = b.noMarcaReloj;
  if (v === undefined || v === null || v === "") return { ok: true, valor: false };
  if (v === true || v === false) return { ok: true, valor: v };
  if (v === "true" || v === "false") return { ok: true, valor: v === "true" };
  return { ok: false, error: "Elige si marca el reloj o si cobra sueldo fijo." };
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `seguros.ts`, `participacion.ts` y `vigencia.ts`: en este
// proyecto los DDL los corre Daniel a mano y varios se quedaron pendientes
// semanas. Sin la columna, TODO el módulo sigue funcionando —todo el mundo marca
// el reloj, o sea como está hoy— y la pantalla dice qué archivo falta en vez de
// romperse.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_NO_MARCA_RELOJ = "20260826080000_asistencia_no_marca_reloj.sql";

/** La columna nueva. Se nombra acá para que el `select` y la detección del
 *  error no se puedan separar. */
export const COLUMNA_NO_MARCA_RELOJ = "no_marca_reloj";

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es "todavía no existe la columna"?
 *
 * Hermano de `esColumnaPagaSegurosFaltante` (`seguros.ts`): `42703` es
 * "undefined_column" de Postgres (lo tira el `select`) y `PGRST204` el de
 * PostgREST cuando la columna no está en su caché de esquema (lo tira el
 * `upsert`).
 *
 * ⚠️ El error tiene que NOMBRAR la columna. Tragarse cualquier error convertiría
 * un problema real —permisos, red, RLS— en una pantalla que miente diciendo
 * "falta la migración".
 */
export function esColumnaNoMarcaRelojFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!texto.includes(COLUMNA_NO_MARCA_RELOJ)) return false;

  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionNoMarcaReloj(): string {
  return (
    "Todavía no se puede marcar a nadie como sueldo fijo sin reloj: falta preparar "
    + `la base de datos. Pídele a Daniel que corra el archivo ${MIGRACION_NO_MARCA_RELOJ} `
    + "en Supabase. Mientras tanto todo lo demás funciona igual y a todos se les "
    + "miden las marcaciones."
  );
}
