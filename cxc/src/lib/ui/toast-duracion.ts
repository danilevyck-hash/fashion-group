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

/** Milisegundos que un aviso se queda en pantalla antes de irse solo. */
export function duracionToastMs(tipo: "success" | "error"): number {
  return tipo === "error" ? TOAST_MS_ERROR : TOAST_MS_EXITO;
}
