/**
 * LA CARTERA de una anotación del CXC — módulo PURO.
 *
 * ─── LA REGLA, dicha por Daniel (12-ago-2026), textual ───────────────────────
 *   "debe de ser cxc de fashion group y otro aparte de boston, no deben de ni
 *    convivir juntos."
 *
 * El #522 sacó a Boston de todas las superficies de PLATA desde la base (la
 * vista `switch_estadocuenta_aging` ES la definición de "cartera del grupo").
 * Lo que quedaba uniendo las dos carteras eran las tres tablas de ANOTACIONES —
 * `cxc_favorites`, `cxc_client_overrides`, `cxc_contact_log` —, que se atan al
 * cliente por `nombre_normalized` **y a nada más**: una estrella o una llamada
 * anotada en una cartera aparecía también en la otra para los nombres que
 * existen en las dos.
 *
 * Sobre `CITY MALL PASO CANOA`, que existe en las dos, Daniel dijo: *"es la
 * misma persona, pero no lo quiero ver en fashion group porque no tiene el
 * mismo codigo"*, y entre "compartido" y "separado" eligió **SEPARADO**: cada
 * cartera con sus propias notas y estrellas.
 *
 * ─── POR QUÉ UNA COLUMNA `cartera` Y NO `empresa_key` ───────────────────────
 * Una anotación NO es de una empresa: es de una CARTERA. Un favorito puesto
 * mirando el panel del grupo vale para las seis empresas a la vez — el panel
 * consolida por `nombre_normalized`, no por empresa. Guardar `empresa_key`
 * obligaría a inventar cuál de las seis, y a repetir la misma estrella seis
 * veces para que se viera igual. Son DOS carteras, y eso es exactamente lo que
 * la columna dice.
 */

/** Las dos carteras. NO hay una tercera: el CXC del sistema son estas dos. */
export const CARTERAS = ["grupo", "boston"] as const;
export type Cartera = (typeof CARTERAS)[number];

/**
 * La cartera de las 6 empresas de Fashion Group
 * (`vistana · fashion_wear · fashion_shoes · active_wear · active_shoes · joystep`).
 */
export const CARTERA_GRUPO: Cartera = "grupo";

/** La cartera de `confecciones_boston`, la que va APARTE. */
export const CARTERA_BOSTON: Cartera = "boston";

/**
 * ¿Este valor es una cartera válida? Devuelve `null` si no lo es.
 *
 * 🔴 NO tiene valor por defecto A PROPÓSITO. Un default acá sería la puerta por
 * la que un camino nuevo escribe "sin cartera" sin que nadie se entere: la fila
 * quedaría en el grupo por descarte, que es justo el modo de fallo que esta
 * columna vino a eliminar. Quien escribe DICE en qué cartera escribe.
 */
export function parseCartera(valor: unknown): Cartera | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  return (CARTERAS as readonly string[]).includes(v) ? (v as Cartera) : null;
}

/** Nombre legible, para los mensajes que ve una persona. */
export function nombreDeCartera(c: Cartera): string {
  return c === "boston" ? "Confecciones Boston" : "Fashion Group";
}

// ─────────────────────────────────────────────────────────────────────────────
// LA COLUMNA PUEDE NO EXISTIR TODAVÍA (patrón `cols-opcionales`)
//
// En este proyecto los DDL los corre Daniel A MANO, y varios se quedaron
// "PENDIENTES" semanas. La app tiene que funcionar ANTES de que corra la
// migración, así que cada lectura/escritura se reintenta sin la columna.
//
// ⚠️ Solo se reintenta cuando el error NOMBRA la columna (o es el 42P10 del
// `ON CONFLICT` que la incluye). Reintentar ante cualquier error convertiría un
// problema real —permisos, red, RLS— en una lectura silenciosamente incompleta,
// que es peor que fallar.
// ─────────────────────────────────────────────────────────────────────────────

/** ¿Este error de PostgREST/Postgres es "todavía no existe la columna `cartera`"? */
export function esErrorSinColumnaCartera(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = err.message ?? "";

  // 42P10 — "there is no unique or exclusion constraint matching the ON CONFLICT
  // specification". En este módulo el ÚNICO `onConflict` que menciona `cartera`
  // es el nuestro, así que este código acá significa exactamente eso.
  if (code === "42P10" || /no unique or exclusion constraint/i.test(msg)) return true;

  // 42703 (select) / PGRST204 (insert) — los dos NOMBRAN la columna.
  if (!/\bcartera\b/i.test(msg)) return false;
  return /does not exist|schema cache|could not find/i.test(msg) || code === "42703" || code === "PGRST204";
}

/**
 * Se lanza cuando la cartera APARTE quiere escribir y la columna todavía no
 * existe. No es un error de programación: es el estado legítimo entre el deploy
 * y la corrida del DDL.
 *
 * 🔴 Escribir igual —sin la columna— metería la anotación de Boston en el
 * namespace compartido, o sea aparecería en el grupo: exactamente lo que Daniel
 * prohibió. Se prefiere no guardar y decirlo.
 */
export class CarteraNoDisponibleError extends Error {
  constructor(public readonly cartera: Cartera) {
    super(
      `Las notas y estrellas de ${nombreDeCartera(cartera)} todavía no están habilitadas. ` +
        `Falta correr un ajuste en la base de datos.`,
    );
    this.name = "CarteraNoDisponibleError";
  }
}
