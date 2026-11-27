// ─────────────────────────────────────────────────────────────────────────────
// EL MODAL CABE EN LA PANTALLA (27-nov-2026). Angela, en su computadora de
// 1366×768 con Chrome en Windows, abrió «Editar factura» y no veía ni el
// título ni «Guardar factura»: tuvo que achicar el zoom. Daniel: que valga
// para TODO el sistema.
//
// La regla, en todo modal y toda hoja:
//   1. El alto máximo es el de la ventana (`dvh`, con un margen chico).
//   2. La cabecera queda fija arriba.
//   3. El cuerpo hace scroll por dentro.
//   4. El pie con los botones queda siempre visible.
//
// Las piezas base (`Modal`, `ConfirmModal`, `ConfirmDeleteModal`,
// `ConfirmTypeNameModal`, `BottomSheet`) la traen; los modales hechos a mano
// usan estas clases. Candado: `modal-cabe-en-la-pantalla.test.ts` pone el build
// en rojo si aparece un `fixed inset-0` con panel y sin alto máximo.
//
// `false` = los paneles vuelven a su alto de antes (90–92vh, sin pie fijo).
// ─────────────────────────────────────────────────────────────────────────────

export const MODAL_CABE_2026_11 = true;

/** El panel: nunca más alto que la ventana; lo que sobra se desliza por dentro. */
export const PANEL_CABE =
  "max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain";

/** El panel partido en tres: cabecera · cuerpo con scroll · pie. */
export const PANEL_CABE_COLUMNA =
  "max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden";
/** El cuerpo del panel partido: el único que se desliza. */
export const CUERPO_CON_SCROLL = "flex-1 min-h-0 overflow-y-auto overscroll-contain";

/** Dentro de un `PANEL_CABE`: la cabecera se queda arriba al deslizar. */
export const CABECERA_FIJA = "sticky top-0 z-10 bg-white";
/** Dentro de un `PANEL_CABE`: el pie con los botones se queda abajo, siempre a la vista. */
export const PIE_FIJO = "sticky bottom-0 z-10 bg-white border-t border-gray-100";

/** Lo nuevo con el interruptor prendido; lo de antes con él apagado. */
export function cabe(nuevo: string, antes: string): string {
  return MODAL_CABE_2026_11 ? nuevo : antes;
}
