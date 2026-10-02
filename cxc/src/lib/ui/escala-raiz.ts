// ─────────────────────────────────────────────────────────────────────────────
// LA ESCALA DE LA RAÍZ (2-oct-2026, `ESCALA_PANTALLA_2026_10`).
//
// Con la escala prendida, `globals.css` le pone `zoom` a <html> en pantallas
// grandes. El navegador mide (`getBoundingClientRect`, `innerWidth`) en píxeles
// de la PANTALLA, pero un `top`/`left`/`height` escrito en el estilo se vuelve a
// multiplicar por el zoom: un desplegable se pintaría corrido hacia la derecha y
// abajo, o fuera de la pantalla. 🩸 Medido en 1440: el menú del usuario quedaba
// 101 px corrido, cortado por el borde; en 1920, fuera de la pantalla.
//
// Por eso, todo lo que MIDE en la pantalla y ESCRIBE en el estilo pasa por aquí:
// divide entre la escala. Sin escala (celular, interruptor apagado) es 1 y no
// cambia nada.
// ─────────────────────────────────────────────────────────────────────────────

/** El zoom de <html>: 1 si no hay escala (o fuera del navegador). */
export function escalaRaiz(): number {
  if (typeof document === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom || "1");
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** Píxeles medidos en la pantalla → píxeles para escribir en el estilo. */
export function aPxDeEstilo(medido: number, escala: number = escalaRaiz()): number {
  return medido / escala;
}
