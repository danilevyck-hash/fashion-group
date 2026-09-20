/* ─────────────────────────────────────────────────────────────────────────────
 * EL TABLERO DE CIERRE — una línea por empresa. Módulo PURO.
 *
 * Sin base, sin red, sin `new Date()`.
 *
 * ── 🩸 QUÉ REEMPLAZA (19-sep-2026) ──────────────────────────────────────────
 *
 * Con «Todas» elegido, la Planilla decía *«Elige una empresa arriba para armar
 * su planilla: con «Todas» no se paga nada»* y **no mostraba nada más**. Para
 * saber cómo venía la quincena había que entrar empresa por empresa, generar y
 * mirar — cuatro veces, seis veces al mes.
 *
 * Ahora «Todas» muestra **una línea por empresa**: personas · neto · qué falta
 * para cerrar · el botón de cerrar.
 *
 * ── 🔴 LO QUE NO SE NEGOCIA ─────────────────────────────────────────────────
 *
 *   · **NUNCA UN TOTAL DEL GRUPO.** El tablero muestra ESTADO, no totales: no
 *     hay una fila «Total», ni un pie, ni un número que sume dos empresas. Este
 *     módulo no tiene una sola operación de suma entre filas, y hay candado que
 *     lo barre. Sumar cuatro planillas produce un número que nadie paga.
 *   · **Cada cierre sigue siendo el de SU empresa, por su propia puerta.** El
 *     botón de una fila cierra ESA empresa con el MISMO `POST` de siempre
 *     (`/api/asistencia/planilla-guardada`, `{ empresa, desde, hasta }`). No
 *     existe un «cerrar todas».
 *   · **Solo se cierran quincenas** (`frenoSoloQuincenas`): el tablero se arma
 *     con los mismos cuatro botones de quincena de la pantalla, y el servidor
 *     lo vuelve a frenar igual.
 * ────────────────────────────────────────────────────────────────────────── */

import type { TotalesPlanilla } from "./planilla";

/** En qué está la quincena de esa empresa. */
export type EstadoFila =
  /** Todavía no contestó. */
  | "cargando"
  /** No se pudo leer: se DICE, nunca se disfraza de «no hay nadie». */
  | "error"
  /** No hay nadie en esa empresa para esas fechas. */
  | "vacia"
  /** Hay cuadro y falta algo antes de cerrar. */
  | "con-pendientes"
  /** Hay cuadro y no falta nada. */
  | "lista"
  /** Ya está cerrada. */
  | "cerrada";

export interface FilaTablero {
  empresa: string;
  etiqueta: string;
  estado: EstadoFila;
  /** Cuánta gente entra al cuadro de ESA empresa. */
  personas: number;
  /** El neto de ESA empresa. 🔴 Nunca se suma con el de otra. */
  neto: number;
  /**
   * Los totales completos de ESA empresa, para que la ventana de confirmación
   * sea la MISMA que la de la Planilla. 🔴 No se suman con los de otra.
   */
  totales: TotalesPlanilla | null;
  /** Cuántas cosas hay que arreglar antes de cerrar. */
  arreglar: number;
  /** La primera de ellas, dicha con palabras. `null` = no falta nada. */
  primeroQueFalta: string | null;
  /** Lo que se dijo al fallar la lectura. */
  error: string | null;
}

/** Lo que dice la columna «Qué falta». */
export const TODO_LISTO_TABLERO = "Todo listo para cerrar";
export const YA_CERRADA = "Ya está cerrada";
export const SIN_NADIE = "No hay nadie en estas fechas";
export const TODAVIA_CARGANDO = "Cargando…";

/**
 * Qué se lee en la columna «Qué falta para cerrar».
 *
 * 🔴 SE DICE LO QUE FALTA, NO UN NÚMERO PELADO. «3 cosas» manda a adivinar; «3
 * cosas · 2 con horas extra sin decidir» dice por dónde empezar.
 */
export function textoQueFalta(f: FilaTablero): string {
  switch (f.estado) {
    case "cargando": return TODAVIA_CARGANDO;
    case "error": return f.error ?? "No se pudo leer";
    case "vacia": return SIN_NADIE;
    case "cerrada": return YA_CERRADA;
    case "lista": return TODO_LISTO_TABLERO;
    case "con-pendientes": {
      const cuantas = f.arreglar === 1 ? "1 cosa" : `${f.arreglar} cosas`;
      return f.primeroQueFalta ? `${cuantas} · ${f.primeroQueFalta}` : cuantas;
    }
  }
}

/**
 * ¿Se le puede tocar «Cerrar» a esta fila?
 *
 * 🔑 Falta algo ≠ no se puede cerrar: los avisos que FRENAN los decide el
 * SERVIDOR (contesta 409 con sus motivos), no esta pantalla. Acá solo se apaga
 * el botón donde no hay nada que cerrar.
 */
export function sePuedeCerrar(f: FilaTablero, puedeElRol: boolean): boolean {
  if (!puedeElRol) return false;
  return f.estado === "con-pendientes" || f.estado === "lista";
}

/** El `aria-label` del botón: qué empresa cierra. Nunca un «Cerrar» pelado. */
export function etiquetaCerrar(f: FilaTablero): string {
  return `Cerrar la quincena de ${f.etiqueta}`;
}

/** La línea de arriba del tablero. 🔴 No dice un total: dice cuántas empresas. */
export function encabezadoDelTablero(filas: readonly FilaTablero[]): string {
  const n = filas.length;
  return n === 1 ? "1 empresa" : `${n} empresas`;
}

/**
 * 🔴 LA LÍNEA QUE EXPLICA POR QUÉ NO HAY UN TOTAL. Sin ella, el primer
 * instinto de cualquiera que mire cuatro netos en columna es sumarlos.
 */
export const POR_QUE_NO_HAY_TOTAL =
  "Cada empresa se cierra por su lado y paga su propia planilla: aquí no se suman.";

/** La fila en blanco de una empresa, antes de que conteste. */
export function filaVacia(empresa: string, etiqueta: string): FilaTablero {
  return {
    empresa, etiqueta, estado: "cargando",
    personas: 0, neto: 0, totales: null, arreglar: 0, primeroQueFalta: null, error: null,
  };
}
