/* ─────────────────────────────────────────────────────────────────────────────
 * A QUIÉN SE LE DESCUENTAN LOS SEGUROS — social y educativo, SIEMPRE JUNTOS.
 *
 * Módulo PURO: sin base, sin red. Acá viven el DATO y las palabras; el efecto
 * sobre el dinero lo aplica `calcularDinero` (`planilla.ts`) y el I/O,
 * `config-server.ts`. Es el mismo reparto que `participacion.ts`.
 *
 * ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
 *
 * La planilla le cobraba seguro social (9,75 %) y educativo (1,25 %) a las 31
 * de 31 personas con dinero calculado, porque los dos porcentajes viven en
 * `asistencia_reglas` y una regla GLOBAL no tiene forma de decir "a ésta no".
 *
 * El Excel real de la contadora (16 al 31 de julio de 2026, las tres empresas)
 * dice otra cosa, y se lee celda por celda en sus fórmulas:
 *   · Confecciones Boston → 4 de 19 filas tienen `=L*9,75%`. El resto, 0 o vacío.
 *   · Vistana            → las 6 de la planilla sí; las 2 de «Servicios
 *                          Profesionales» (Andrea Pérez y Jorman Hernández) no.
 *   · Fashion Wear       → NADIE. Su cuadro entero está bajo «Servicios
 *                          Profesionales».
 * Total: 8 de 27. Medido, no deducido — son las fórmulas del archivo.
 *
 * 🔴 NO ES "TIENE SALARIO" NI "ES SERVICIO PROFESIONAL". Las cuatro de Boston
 * que sí pagan están en la MISMA lista, con el mismo tipo de sueldo, que las
 * quince que no. Quién está inscrito en la Caja de Seguro Social es un hecho
 * externo al reloj: no se puede deducir de ningún dato que este módulo tenga.
 * Por eso es una bandera explícita, igual que el servicio profesional.
 *
 * ── 🔴 UN SOLO CAMPO PARA LOS DOS SEGUROS ────────────────────────────────────
 *
 * Daniel, textual: *"esto es junto, no es separado cada uno. El que usa uno
 * usará ambos."* Y el Excel lo confirma: no hay una sola fila con seguro social
 * y sin educativo, ni al revés. Dos casillas serían dos formas de dejarlo mal
 * puesto sin comprar ni un caso real — la misma trampa que el almuerzo, que
 * tenía dos perillas para el mismo dato.
 *
 * ── 🔴 EL DEFAULT ES «SÍ SE LE COBRA», Y ESO NO ES UN DETALLE ────────────────
 *
 * Sin la columna corrida, con la columna en `null`, o con una ficha que nadie
 * tocó todavía, la respuesta es SÍ. O sea: **el día que este código sale a
 * producción no se mueve un centavo**, y la planilla sigue dando exactamente lo
 * que daba ayer hasta que una persona apague el interruptor a conciencia.
 *
 * Es la dirección segura por una razón asimétrica: cobrar de más un seguro se
 * ve en el neto y se reclama el mismo día; NO cobrarlo en silencio se descubre
 * meses después, cuando la Caja pide lo que no se retuvo.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS — en español simple, sin jerga
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo se pregunta en la ficha. */
export const PREGUNTA_SEGUROS = "¿Se le descuentan los seguros?";

/** El rótulo de lo normal, y de lo que pasa si nadie toca nada. */
export const ETIQUETA_PAGA_SEGUROS = "Sí — seguro social y educativo";
/** El rótulo del otro caso. */
export const ETIQUETA_SIN_SEGUROS = "No se le descuentan";

/**
 * Qué significa, dicho UNA vez y usado en la ficha, en la lista de la planilla
 * y en el Excel. Dos redacciones del mismo hecho es la forma de que terminen
 * contradiciéndose.
 */
export const EXPLICACION_SEGUROS =
  "Los dos seguros van juntos: quien paga uno paga el otro. Se descuentan del "
  + "total bruto —9,75 % el social y 1,25 % el educativo— igual que en el cuadro "
  + "de la contadora. Apagarlo deja las dos columnas en $0,00 y no cambia nada más.";

/** Lo que se muestra en la línea de la planilla de quien NO los paga. */
export const CHIP_SIN_SEGUROS = "sin seguros";

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿A esta ficha se le descuentan los seguros?
 *
 * 🔑 SOLO UN `false` EXPLÍCITO LOS APAGA. Un `null`, un `undefined` o la columna
 * todavía sin crear significan lo mismo: SÍ se le cobran, que es como estaban
 * las 38 fichas antes de este cambio. Ante la duda se retiene — ver la nota del
 * encabezado sobre por qué la asimetría va para este lado.
 */
export function pagaSeguros(v: unknown): boolean {
  return !(v === false || v === "false" || v === 0 || v === "0");
}

/**
 * Lo que viene en el cuerpo de un PUT. Mismo criterio que `participacion.ts`:
 * el validador recibe `unknown` y decide él.
 *
 * Ausente = `true` (se le cobran). No es laxitud: el formulario manda siempre el
 * campo, y para cualquier otro llamador el valor seguro es el que retiene.
 */
export function validarPagaSeguros(body: unknown): Resultado<boolean> {
  const b = (body ?? {}) as Record<string, unknown>;
  const v = b.pagaSeguros;
  if (v === undefined || v === null || v === "") return { ok: true, valor: true };
  if (v === true || v === false) return { ok: true, valor: v };
  if (v === "true" || v === "false") return { ok: true, valor: v === "true" };
  return { ok: false, error: "Elige si se le descuentan los seguros o no." };
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `participacion.ts` y `vigencia.ts`: en este proyecto los
// DDL los corre Daniel a mano y varios se quedaron pendientes semanas. Sin la
// columna, TODO el módulo sigue funcionando —a todo el mundo se le cobran los
// seguros, o sea como está hoy— y la pantalla dice qué archivo falta.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_SEGUROS = "20260825120000_asistencia_paga_seguros.sql";

/** La columna nueva. Se nombra acá para que el `select` y la detección del
 *  error no se puedan separar. */
export const COLUMNA_PAGA_SEGUROS = "paga_seguros";

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es "todavía no existe la columna"?
 *
 * Hermano de `esColumnaServicioProfesionalFaltante`: `42703` es
 * "undefined_column" de Postgres (lo tira el `select`) y `PGRST204` el de
 * PostgREST cuando la columna no está en su caché de esquema (lo tira el
 * `upsert`).
 *
 * ⚠️ El error tiene que NOMBRAR la columna. Tragarse cualquier error convertiría
 * un problema real —permisos, red, RLS— en una pantalla que miente diciendo
 * "falta la migración".
 */
export function esColumnaPagaSegurosFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!texto.includes(COLUMNA_PAGA_SEGUROS)) return false;

  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionSeguros(): string {
  return (
    "Todavía no se puede quitarle los seguros a nadie: falta preparar la base de "
    + `datos. Pídele a Daniel que corra el archivo ${MIGRACION_SEGUROS} en Supabase. `
    + "Mientras tanto todo lo demás funciona igual y a todas las personas se les "
    + "descuentan el seguro social y el educativo, como hasta ahora."
  );
}
