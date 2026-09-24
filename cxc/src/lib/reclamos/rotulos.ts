// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — SE DICE **COBRADO**, NUNCA «PAGADO» (24-sep-2026).
//
// Daniel, textual: *«solo hay creado y cobrado, ¿por qué veo pagado?»*.
//
// 🔑 Tenía razón y el sistema ya le daba la razón a medias: la portada dice
// «Cobrado 2026», la lista de una empresa dice «Cobrados», el papel que sale al
// proveedor NO imprime la palabra (se quitó el 20-sep-2026 justo porque «Pagado»
// se le lee al revés). Lo único que seguía diciendo «pagado» era el botón que
// más se toca —14 cobros, 9 en septiembre— y el chip de arriba del reclamo.
//
// 🔴 ES SOLO EL RÓTULO. El estado en la base sigue siendo `"Pagado"`
// (`ESTADO_PAGADO`, `lib/reclamos/pendientes.ts`), la ruta que lo escribe es la
// misma, el payload es el mismo y el papel no cambia. Acá viven las PALABRAS,
// en un solo lugar, y hay barrido (`reclamos-cobrado-no-pagado.test.ts`) que
// pone el build rojo si vuelve a aparecer «pagado» en una pantalla del módulo.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtDate } from "@/lib/format";

/** El botón negro del reclamo abierto: lo que más se hace en todo el módulo. */
export const MARCAR_COBRADO = "Marcar como cobrado";

/** El chip de arriba cuando el reclamo ya no se le debe cobrar a nadie. */
export const CHIP_COBRADO = "Cobrado";

/** Lo que dice la caja ámbar del comprobante, adentro de la ventana de cobro. */
export const COMPROBANTE_OBLIGATORIO = "Foto o PDF — obligatorio para marcar cobrado.";

/** Cuando se intenta cobrar sin comprobante. */
export const FALTA_COMPROBANTE =
  "Adjunta el comprobante (foto o PDF) — es obligatorio para marcar cobrado.";

/** El fallo del servidor al cobrar. */
export const NO_SE_PUDO_COBRAR = "No se pudo marcar como cobrado.";

/** El aviso de que salió bien. */
export const LISTO_COBRADO = "Listo, cobrado";

/**
 * «cobrado el 17 sept 2026» — la línea de la lista de cobrados y del reclamo ya
 * cobrado. Sin fecha no se inventa ninguna: devuelve solo «cobrado».
 */
export function cobradoEl(fecha: string | null | undefined): string {
  return fecha ? `cobrado el ${fmtDate(fecha)}` : "cobrado";
}
