// ─────────────────────────────────────────────────────────────────────────────
// ¿ESTO ES UN CELULAR O UNA COMPUTADORA?
//
// Lo pregunta «Compartir» de Guías (7-sep-2026): en el celular sale una IMAGEN
// —que WhatsApp muestra dentro del chat— y en la computadora, SIEMPRE el PDF,
// que es lo que ahí se adjunta, se archiva y se imprime.
//
// 🔑 SE PREGUNTA POR EL DEDO, NO POR EL NOMBRE DEL APARATO. `(pointer: coarse)`
// dice que el puntero PRINCIPAL es grueso: eso es un dedo. Mirar el
// `userAgent` no alcanza —el iPad moderno se anuncia como «Macintosh»— y una
// laptop con pantalla táctil sigue reportando su mouse como puntero principal,
// así que sigue siendo computadora.
//
// ⚠️ Ante la duda, COMPUTADORA (el PDF): un PDF se lee en cualquier parte, una
// imagen achicada por WhatsApp no siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { esIOS } from "@/lib/imprimir-pdf";

/** Qué aparato tiene la persona en la mano. */
export type Aparato = "celular" | "computadora";

/**
 * `celular` para lo que se maneja con el dedo (iPhone, Android, iPad);
 * `computadora` para todo lo demás y para el servidor.
 */
export function aparatoDeQuienMira(): Aparato {
  if (typeof window === "undefined") return "computadora";
  try {
    if (window.matchMedia?.("(pointer: coarse)").matches) return "celular";
  } catch {
    /* un navegador sin matchMedia cae al plan B de abajo */
  }
  // Plan B: el mismo reconocimiento de iPhone/iPad que ya usa la impresión.
  return esIOS() ? "celular" : "computadora";
}
