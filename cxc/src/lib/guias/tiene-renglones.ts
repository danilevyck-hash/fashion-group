// ─────────────────────────────────────────────────────────────────────────────
// ¿ESTA GUÍA TRAE SUS RENGLONES?  (módulo PURO, y a propósito solo)
//
// El listado NO los trae completos: los pide al abrir el acordeón. Imprimir una
// guía sin renglones daría un papel sin envíos, que es peor que no imprimir —
// por eso quien va a imprimir o compartir pregunta primero.
//
// 🩸 VIVE APARTE DE `papel-de-la-guia.ts` POR UNA RAZÓN MEDIDA: ese módulo
// arrastra jsPDF (~148 kB), y con este `if` adentro, `/guias` y `/guias/[id]`
// —las dos pantallas que bodega abre desde el celular todo el día— tenían que
// importarlo de arriba para poder preguntar. La carga inicial pasaba de **196
// kB a 344 kB**. Una pregunta de una línea no puede costar el generador de PDF.
// ─────────────────────────────────────────────────────────────────────────────

import type { Guia } from "@/app/guias/components/types";

export function tieneRenglones(g: Guia | null | undefined): boolean {
  return Boolean(g && Array.isArray(g.guia_items) && g.guia_items.length > 0);
}
