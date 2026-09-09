// ─────────────────────────────────────────────────────────────────────────────
// COMPARTIR UNA GUÍA: SIEMPRE PDF  (módulo PURO)
//
// 🔴 9-SEP-2026 — SE ACABÓ LA IMAGEN. Daniel, textual: *«en guía, quiero todo
// PDF, quita lo de PNG que lo enredó»*. El botón «Compartir» manda un PDF en el
// celular y en la computadora, tenga los renglones que tenga.
//
// 🔑 POR QUÉ SE VA algo que estaba medido y funcionaba: eran DOS documentos con
// dos formas para la misma guía, y cuál salía dependía del aparato y de cuántos
// renglones tenía — o sea, de cosas que quien toca el botón no ve. La guía que
// se comparte y la que se imprime ahora son **el mismo archivo**, siempre.
//
// ⚠️ QUÉ SE CONSERVA DE ESA HISTORIA, para que se entienda por qué existió:
// una imagen se LEE dentro del chat de WhatsApp y un PDF hay que abrirlo, y
// medido el 5-sep-2026 sobre las 222 guías vivas el **94% tenía 6 renglones o
// menos** — por eso el corte estaba en 6 y por eso en la computadora ya salía
// PDF desde el 7-sep. El dibujo de la imagen sigue en `png-guia.ts`, sin
// lectores; lo que se retiró es la decisión, no el código.
//
// ⚠️ IMPRIMIR NO CAMBIA (y nunca cambió): el papel es y sigue siendo el PDF.
// ─────────────────────────────────────────────────────────────────────────────

import type { Aparato } from "@/lib/aparato";

/**
 * Hasta cuántos renglones se compartía como imagen.
 *
 * 🔄 RETIRADA el 9-sep-2026: ya no la mira nadie. Se conserva —como las
 * columnas de una función retirada— para que la medición que la fijó (94% de
 * las guías con 6 renglones o menos) no se pierda con ella.
 */
export const MAX_RENGLONES_PNG = 6;

export type FormatoCompartir = "png" | "pdf";

/**
 * El formato con el que sale «Compartir». **Siempre `pdf`**, en el celular y en
 * la computadora, con uno o con cien renglones (Daniel, 9-sep-2026).
 *
 * Los dos parámetros se conservan: quien llama sigue preguntando lo mismo y la
 * decisión sigue viviendo acá, en un módulo puro, en vez de quedar como un
 * `return` suelto adentro de la pantalla.
 */
export function formatoParaCompartir(
  _cantidadRenglones: number,
  _aparato: Aparato = "celular",
): FormatoCompartir {
  return "pdf";
}
