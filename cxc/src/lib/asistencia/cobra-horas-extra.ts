/* ─────────────────────────────────────────────────────────────────────────────
 * QUIÉN COBRA HORAS EXTRA — la casilla de la ficha (10-sep-2026).
 *
 * Daniel, textual: *«Cobra horas extra por default a todos sí»*.
 *
 * Módulo PURO: sin base, sin red. Acá vive el DATO y las palabras; el efecto
 * sobre el dinero lo aplica `planilla.ts` (`armarLinea`, que es lo único que
 * decide plata) y el I/O, `config-server.ts`.
 *
 * ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
 *
 * Hay gente que nunca cobra extra —el reloj le mide minutos de más y a nadie
 * se le va a pagar—, y aun así aparecía en Aprobaciones cada quincena, en el
 * aviso ámbar «N colaboradores tienen horas extra sin aprobar» y frenando el
 * cierre. Quien aprueba tenía que decidir «No» sobre la misma persona cada
 * quincena, para siempre. La decisión es de la FICHA, no de cada día.
 *
 * ── LO QUE APAGA, Y LO QUE NO ────────────────────────────────────────────────
 *
 *   APAGA  → hora extra diurna y nocturna, excedente, domingo y feriado: no se
 *            pagan, no salen en Aprobaciones, no cuentan en el aviso ni frenan
 *            el cierre. Es la MISMA mitad que `sinHorasExtra` cierra para el
 *            servicio profesional.
 *   SIGUE  → tardanzas, ausencias y salida antes de la hora: son lo que pasó,
 *            no algo que alguien conceda. Y la persona sigue en planilla con su
 *            quincenal, sus seguros y su neto.
 *
 * ── ⚠️ POR QUÉ NO ES «SERVICIO PROFESIONAL» ──────────────────────────────────
 *
 * El servicio profesional está FUERA de la planilla entera. Acá la persona
 * cobra por planilla, con todo; lo único que no cobra es el recargo.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo se pregunta en la ficha. */
export const PREGUNTA_COBRA_HORAS_EXTRA = "¿Cobra horas extra?";
export const ETIQUETA_COBRA_HORAS_EXTRA = "Sí, pasan por Aprobaciones";
export const ETIQUETA_NO_COBRA_HORAS_EXTRA = "No cobra horas extra";

/** Qué significa apagarla, dicho UNA sola vez. Una línea. */
export const EXPLICACION_NO_COBRA_HORAS_EXTRA =
  "No sale en Aprobaciones y no se le pagan horas extra, domingos ni feriados. "
  + "Tardanzas, ausencias y salidas antes de la hora se siguen contando.";

/** La etiqueta de excepción en la ficha, cuando está apagada. */
export const CHIP_NO_COBRA_HORAS_EXTRA = "No cobra horas extra";

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/** La columna. Se nombra acá para que el `select` y el `upsert` no se separen. */
export const COLUMNA_COBRA_HORAS_EXTRA = "cobra_horas_extra";
export const MIGRACION_COBRA_HORAS_EXTRA =
  "20261105120000_aprobaciones_decision_y_cobra_horas_extra.sql";

/**
 * ¿Esta ficha cobra horas extra?
 *
 * 🔑 SOLO un `false` explícito la apaga. `null`, `undefined` o la columna sin
 * crear significan SÍ, que es como estaban las 46 fichas el día que nació —
 * Daniel: *«por default a todos sí»*. La asimetría va para este lado a
 * propósito: apagarla por accidente es dejar de pagarle a alguien sus extras
 * sin que lo vea nadie.
 */
export function cobraHorasExtra(v: unknown): boolean {
  return !(v === false || v === "false" || v === 0 || v === "0");
}

/**
 * Lo que viene en el cuerpo de un PUT. Mismo criterio que `sueldo-fijo.ts`:
 * el validador recibe `unknown` y decide él. Ausente = `true` (cobra), que es
 * el valor que no le quita nada a nadie.
 */
export function validarCobraHorasExtra(body: unknown): Resultado<boolean> {
  const b = (body ?? {}) as Record<string, unknown>;
  const v = b.cobraHorasExtra;
  if (v === undefined || v === null || v === "") return { ok: true, valor: true };
  if (v === true || v === false) return { ok: true, valor: v };
  if (v === "true" || v === "false") return { ok: true, valor: v === "true" };
  return { ok: false, error: "Elige si cobra horas extra o no." };
}
