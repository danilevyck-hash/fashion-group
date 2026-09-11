// ─────────────────────────────────────────────────────────────────────────────
// CUÁNTO DURA UN AVISO EN PANTALLA — un solo número por clase de aviso.
//
// La regla de la casa está escrita en CLAUDE.md desde hace meses: «Toasts:
// errores 8s, éxitos 3s, con botón X para cerrar». Vivía repartida en ~20
// `setTimeout(…, 3000)` escritos a mano pantalla por pantalla, y en el catálogo
// PÚBLICO no vivía en ninguna parte: el aviso salía y se quedaba ahí para
// siempre, encima de la barra del carrito, sin forma de cerrarlo.
//
// Un error dura más a propósito: dice qué hacer y hay que alcanzar a leerlo.
//
// PURO, sin I/O.
// ─────────────────────────────────────────────────────────────────────────────

export const TOAST_MS_EXITO = 3000;
export const TOAST_MS_ERROR = 8000;

/**
 * Milisegundos que un aviso se queda en pantalla antes de irse solo.
 *
 * 🔴 UN AVISO (`warning`) DURA LO QUE UN ERROR (11-sep-2026): dice algo que hay
 * que alcanzar a leer. 🩸 El «pasa el tope de un sueldo» de Préstamos salía
 * como éxito verde y se iba a los 3 s.
 */
export function duracionToastMs(tipo: "success" | "error" | "warning"): number {
  return tipo === "success" ? TOAST_MS_EXITO : TOAST_MS_ERROR;
}
