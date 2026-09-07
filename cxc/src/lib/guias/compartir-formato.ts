// ─────────────────────────────────────────────────────────────────────────────
// COMPARTIR UNA GUÍA: ¿IMAGEN O PDF?  (módulo PURO)
//
// Daniel, 5-sep-2026: *«en el grupo de WhatsApp siempre ponen compartir cuando
// terminan (llega en pdf)»* — y eligió la imagen, con corte.
//
// 🔑 POR QUÉ HAY CORTE. Una imagen se VE dentro del chat, sin abrir nada; un
// PDF hay que tocarlo para leerlo. Pero WhatsApp achica la imagen, así que con
// muchos renglones la letra se pierde y el PDF vuelve a ser mejor.
//
// Medido contra producción el 5-sep-2026 sobre las 222 guías vivas:
//   · **60%** tienen UN renglón · **79%** tres o menos · **94%** seis o menos.
//   · Solo el **6%** tiene 7 o más.
// O sea: con el corte en 6, 19 de cada 20 guías se comparten como imagen y se
// leen en el chat, y las pocas gordas siguen yendo en PDF.
//
// 🔴 Y DESDE EL 7-SEP-2026 TAMBIÉN MIRA EL APARATO. Daniel: **celular → imagen
// hasta 6 renglones (lo de siempre); computadora → SIEMPRE el PDF.** La imagen
// existe para WhatsApp, que la muestra dentro del chat; en la computadora el
// archivo se adjunta, se archiva y se imprime, y ahí el PDF gana siempre.
//
// ⚠️ EL BOTÓN SIGUE LLAMÁNDOSE «Compartir» Y DECIDE SOLO. No se le pregunta
// nada a nadie: la persona no tiene por qué saber cuántos renglones tiene la
// guía ni con qué aparato está mirando. Imprimir no cambia — el papel es y
// sigue siendo el PDF, en los dos mundos.
// ─────────────────────────────────────────────────────────────────────────────

import type { Aparato } from "@/lib/aparato";

/** Hasta cuántos renglones se comparte como imagen. Ver la medición de arriba. */
export const MAX_RENGLONES_PNG = 6;

export type FormatoCompartir = "png" | "pdf";

/**
 * El formato con el que sale «Compartir».
 *
 *   · en el CELULAR: `png` hasta 6 renglones, `pdf` de ahí para arriba;
 *   · en la COMPUTADORA: `pdf` siempre.
 *
 * ⚠️ Cero renglones cae en `pdf`: una guía sin envíos no se comparte (la
 * pantalla lo frena antes con `tieneRenglones`), y si algún día llegara acá es
 * mejor el documento completo que una imagen vacía.
 *
 * ⚠️ Sin decir el aparato se asume `celular`, que es el corte de siempre: este
 * módulo es puro y no mira el navegador — quien lo llama pregunta con
 * `aparatoDeQuienMira()`.
 */
export function formatoParaCompartir(
  cantidadRenglones: number,
  aparato: Aparato = "celular",
): FormatoCompartir {
  if (aparato !== "celular") return "pdf";
  const n = Number(cantidadRenglones);
  if (!Number.isFinite(n) || n <= 0) return "pdf";
  return n <= MAX_RENGLONES_PNG ? "png" : "pdf";
}
