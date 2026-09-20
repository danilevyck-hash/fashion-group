/* ─────────────────────────────────────────────────────────────────────────────
 * LA COLUMNA «EXTRAS» DICE CUÁNTO ESTÁ APROBADO (16-sep-2026). Módulo PURO.
 *
 * Daniel, preguntado si la columna tenía que decir las dos cosas: *«Si»*.
 *
 * 🩸 EL PROBLEMA. La columna mostraba los minutos que midió el RELOJ, y quien
 * la mira puede creer que es plata que se va a pagar. No lo es: la planilla
 * paga **solo lo aprobado** (regla de la contadora, *«Sólo se pagan las horas
 * extras autorizadas»*). Medido el 16-sep-2026, ventana 26-ago → 10-sep: Kener
 * Hernández (17) tenía **386,50 minutos medidos**, de los cuales la contable
 * aprobó **314,05** y rechazó **72,45**. La pantalla decía «386,5» y nada más.
 *
 * ── 🔴 NO CAMBIA QUÉ SE PAGA, SOLO LO QUE SE MUESTRA ─────────────────────────
 *
 * La decisión ya existe y ya manda: vive en `asistencia_horas_extra_aprobadas`
 * (`decision`: si · no · null = pendiente) y la aplica el motor de la planilla.
 * Acá solo se REPARTE el número que la columna ya sumaba, día por día, según la
 * decisión de ese día.
 *
 * 🔑 SE REPARTE `extraMin` DEL DÍA, que es exactamente lo que suma la columna
 * (`resumen.extraMin`). Por construcción **aprobado + rechazado + pendiente es
 * el total**: no es una segunda cuenta que pueda separarse de la primera.
 * ────────────────────────────────────────────────────────────────────────── */

import { claveDia, type Decision } from "./aprobaciones";

export interface ExtrasDecididas {
  aprobadoMin: number;
  rechazadoMin: number;
  /** Nadie decidió todavía: no se paga, y ES lo único que frena el cierre. */
  pendienteMin: number;
}

export const EXTRAS_SIN_DECIDIR: ExtrasDecididas = {
  aprobadoMin: 0, rechazadoMin: 0, pendienteMin: 0,
};

/** Lo mínimo que la regla le pide a un día. */
export interface DiaConExtra {
  fecha: string;
  extraMin: number;
}

/**
 * Reparte las horas extra medidas de UNA persona entre las tres decisiones.
 *
 * `decisiones` es `codigo|fecha → 'si' | 'no'`; una fecha que no esté es
 * PENDIENTE, que es lo que significa no tener fila (ver `estaAprobado`).
 */
export function repartirExtras(
  codigo: string,
  dias: readonly DiaConExtra[],
  decisiones: ReadonlyMap<string, Decision>,
): ExtrasDecididas {
  const out: ExtrasDecididas = { aprobadoMin: 0, rechazadoMin: 0, pendienteMin: 0 };
  for (const d of dias) {
    if (!(d.extraMin > 0)) continue;
    const decision = decisiones.get(claveDia(codigo, d.fecha)) ?? null;
    if (decision === "si") out.aprobadoMin += d.extraMin;
    else if (decision === "no") out.rechazadoMin += d.extraMin;
    else out.pendienteMin += d.extraMin;
  }
  return out;
}

/** Los minutos como se escriben debajo del total: sin decimales. */
function min(n: number): string {
  return String(Math.round(n));
}

/**
 * La segunda línea de la celda: «314 aprobados · 72 rechazados».
 *
 * `null` cuando no hay horas extra, o cuando está TODO pendiente y no hay nada
 * decidido que contar — ahí el aviso de «sin aprobar» de la planilla ya lo dice
 * y repetirlo en cada celda sería ruido.
 *
 * 🔴 LO PENDIENTE SE DICE, y se dice primero cuando existe: es lo único que
 * frena el cierre de la quincena.
 */
export function textoExtrasDecididas(e: ExtrasDecididas): string | null {
  const partes: string[] = [];
  if (e.pendienteMin > 0) partes.push(`${min(e.pendienteMin)} sin decidir`);
  if (e.aprobadoMin > 0) partes.push(`${min(e.aprobadoMin)} aprobados`);
  if (e.rechazadoMin > 0) partes.push(`${min(e.rechazadoMin)} rechazados`);
  if (partes.length === 0) return null;
  // Con TODO pendiente y nada decidido, la línea no agrega nada al número de
  // arriba: son los mismos minutos dichos dos veces.
  if (e.aprobadoMin === 0 && e.rechazadoMin === 0) return null;
  return partes.join(" · ");
}

/** El título de la celda: qué de esos minutos se paga. */
export function tituloExtrasDecididas(e: ExtrasDecididas): string {
  return (
    `La planilla paga solo lo aprobado: ${min(e.aprobadoMin)} min. `
    + `Rechazados ${min(e.rechazadoMin)} min · sin decidir ${min(e.pendienteMin)} min. `
    + "Se decide en Aprobaciones."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 DECIDIR DESDE EL REPORTE (19-sep-2026)
//
// Daniel: las horas extra se deciden en la misma fila del día, sin ir a la
// pestaña Aprobaciones. 🔴 **Al aprobar manda el SERVIDOR**: es el MISMO
// endpoint (`POST /api/asistencia/aprobaciones`) con el MISMO cuerpo y las
// mismas reglas (el alcance del aprobador, el filtro por empresa, todo o nada).
// Acá no se calcula ni se decide nada nuevo: solo se dice DÓNDE se ofrecen los
// dos botones.
//
// ⚠️ La pestaña Aprobaciones NO se toca, y sigue siendo la única que ofrece el
// DOMINGO y el FERIADO trabajados: esos minutos viven en `domingoMin` y
// `feriadoMin` (`clasificarDia`), no en el `extraMin` que muestra esta columna.
// Ofrecerlos acá pediría rehacer la clasificación en la pantalla — o sea, una
// segunda verdad.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Este día ofrece los botones Sí/No en el Reporte?
 *
 * @param extraMin   los minutos que la columna «Extra» de ese día muestra
 * @param conExtra   `false` = no cobra horas extra (casilla de su ficha): la
 *                   columna va con raya y no hay nada que decidir
 */
export function seDecideEnElReporte(extraMin: number, conExtra: boolean): boolean {
  return conExtra && Number.isFinite(extraMin) && extraMin > 0;
}

/** El `aria-label` de los dos botones: de quién y de qué día se decide. */
export function etiquetaDecidirExtra(persona: string, fechaCorta: string): string {
  return `${persona} · ${fechaCorta}`;
}

/** Lo que dice la celda al pasar el cursor sobre los dos botones. */
export const TITULO_DECIDIR_EXTRA =
  "Sí se paga · No no se paga. Es la misma decisión de Aprobaciones.";
