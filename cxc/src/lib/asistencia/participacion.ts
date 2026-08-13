/* ─────────────────────────────────────────────────────────────────────────────
 * QUIÉN MARCA PERO NO VA EN PLANILLA — "servicio profesional".
 *
 * Módulo PURO: sin base, sin red. Acá vive el DATO y las palabras; el efecto
 * sobre el dinero lo aplica `planilla.ts` (que es donde se decide si una línea
 * produce un número o no) y el I/O, `config-server.ts`.
 *
 * ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
 *
 * Daniel, textual (13-ago-2026), sobre YULISSA JUAREZ (código 26): *"yulissa es
 * servicio profesional, no esta en planilla pero quiero medir asistencia"*.
 *
 * El módulo no sabía decir eso. Una ficha sin salario era, para todas las
 * pantallas, un dato PENDIENTE: salía en el aviso «les falta el salario para
 * poder calcular», en la píldora «Falta configurar» y en la sección amarilla de
 * la planilla. O sea que una decisión de negocio —a esta persona se le paga por
 * fuera— se veía exactamente igual que un olvido, para siempre, y no había forma
 * de distinguirlas. Y peor: el día que alguien le escribiera un salario "para
 * que deje de molestar", el sistema le habría calculado quincena, seguros y neto
 * sin que nadie lo pidiera.
 *
 * ── LAS DOS MITADES, Y LA QUE IMPORTA ────────────────────────────────────────
 *
 *   FUERA de todo cálculo de pago  → sin quincenal, sin extras, sin deducciones
 *                                     y sin entrar al total de la planilla.
 *   DENTRO del control de asistencia → marcaciones, tardanzas, ausencias, horas
 *                                     y reportes, exactamente igual que antes.
 *
 * La segunda mitad es la que Daniel quiere conservar, y por eso esto NO se
 * resuelve dando de baja a la persona: la baja la sacaría también del reporte de
 * asistencia, que es justo lo que él pidió medir.
 *
 * ── ⚠️ POR QUÉ NO ES "NO TIENE SALARIO" ──────────────────────────────────────
 *
 * Porque un salario en blanco es ambiguo: puede ser "no va en planilla" o
 * "todavía no me lo dijeron" (hoy hay dos personas así, recién dadas de alta).
 * El dato tiene que decir la INTENCIÓN, no deducirse de una ausencia. Por eso es
 * una bandera explícita y no la falta de un número.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS — en español simple, las de Daniel
// ─────────────────────────────────────────────────────────────────────────────

/** El rótulo de la opción normal. */
export const ETIQUETA_EN_PLANILLA = "Va en la planilla";
/** El rótulo de la otra. Son las palabras de Daniel, sin jerga. */
export const ETIQUETA_SERVICIO_PROFESIONAL = "Servicio profesional";

/** Cómo se pregunta en la ficha. */
export const PREGUNTA_PARTICIPACION = "¿Se le paga por planilla?";

/**
 * Qué significa, dicho una sola vez y usado en los tres lugares donde hace
 * falta (la ficha, la lista de la planilla y el Excel). Dos redacciones del
 * mismo hecho es la forma de que terminen contradiciéndose.
 */
export const EXPLICACION_SERVICIO_PROFESIONAL =
  "Marca en el reloj y se le mide la asistencia igual que a todos —tardanzas, "
  + "ausencias y horas—, pero no se le calcula pago: no sale en la planilla y no "
  + "se le pide salario.";

/** Lo que se muestra donde antes iba «falta configurar». No es un pendiente. */
export const MOTIVO_FUERA_DE_PLANILLA = "no va en planilla — servicio profesional";

/**
 * 🩸 LA DISTINCIÓN YA EXISTE EN EL NEGOCIO, NO LA INVENTAMOS NOSOTROS, y decirlo
 * importa: es lo que convierte esta bandera de "una casilla más" en el reflejo
 * de cómo se paga de verdad. En la contabilidad son DOS CUENTAS distintas, y a
 * Daniel y a David se les paga por la segunda.
 *
 * Se le muestra a la contable —que es quien usa esta pantalla y quien reconoce
 * los números de cuenta— detrás del ⓘ, no en la etiqueta: quien no lleva la
 * contabilidad no necesita leer un código de cuenta para elegir bien.
 */
export const CUENTAS_CONTABLES =
  "En la contabilidad son dos cuentas distintas: lo de planilla va a SALARIOS POR "
  + "PAGAR (2.01.05.01) y el servicio profesional a SERVICIOS PROFESIONALES "
  + "(6.02.01) — que es como se les paga a Daniel y a David.";

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Esta ficha está marcada como fuera de planilla?
 *
 * 🔑 Solo `true` cuenta. Un `null`, un `undefined` o la columna todavía sin
 * crear significan lo mismo: la persona VA en planilla, que es como estaban las
 * 38 fichas antes de este cambio. Ante la duda nadie sale del cálculo — sacar a
 * alguien de la planilla por accidente es dejar de pagarle.
 */
export function esServicioProfesional(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * Lo que viene en el cuerpo de un PUT. Mismo criterio que `config.ts`: el
 * validador recibe `unknown` y decide él.
 *
 * Ausente = `false` (va en planilla). No es laxitud: el formulario manda
 * siempre el campo, y para cualquier otro llamador el valor seguro es el que no
 * saca a nadie del cálculo.
 */
export function validarServicioProfesional(body: unknown): Resultado<boolean> {
  const b = (body ?? {}) as Record<string, unknown>;
  const v = b.servicioProfesional;
  if (v === undefined || v === null || v === "") return { ok: true, valor: false };
  if (v === true || v === false) return { ok: true, valor: v };
  if (v === "true" || v === "false") return { ok: true, valor: v === "true" };
  return {
    ok: false,
    error: "Elige si va en la planilla o si es servicio profesional.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `vigencia.ts`: en este proyecto los DDL los corre Daniel a
// mano y varios se quedaron pendientes semanas. Sin la columna, TODO el módulo
// sigue funcionando —nadie está fuera de planilla, o sea como está hoy— y la
// pantalla dice qué archivo falta en vez de romperse.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_SERVICIO_PROFESIONAL =
  "20260813120000_asistencia_servicio_profesional.sql";

/** La columna nueva. Se nombra acá para que el `select` y la detección del
 *  error no se puedan separar. */
export const COLUMNA_SERVICIO_PROFESIONAL = "servicio_profesional";

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es "todavía no existe la columna"?
 *
 * Hermano de `esColumnaDeBajaFaltante` (`vigencia.ts`): `42703` es
 * "undefined_column" de Postgres (lo tira el `select`) y `PGRST204` el de
 * PostgREST cuando la columna no está en su caché de esquema (lo tira el
 * `upsert`).
 *
 * ⚠️ El error tiene que NOMBRAR la columna. Tragarse cualquier error convertiría
 * un problema real —permisos, red, RLS— en una pantalla que miente diciendo
 * "falta la migración".
 */
export function esColumnaServicioProfesionalFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!texto.includes(COLUMNA_SERVICIO_PROFESIONAL)) return false;

  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionServicioProfesional(): string {
  return (
    "Todavía no se puede marcar a nadie como servicio profesional: falta preparar "
    + `la base de datos. Pídele a Daniel que corra el archivo ${MIGRACION_SERVICIO_PROFESIONAL} `
    + "en Supabase. Mientras tanto todo lo demás funciona igual y todas las personas "
    + "aparecen en la planilla."
  );
}
