// Reclamos — fuente única de "¿esto sigue pendiente de cobrar al proveedor?".
//
// 🔴 POR QUÉ EXISTE ESTE MÓDULO: la condición `estado !== "Pagado"` estaba
// escrita a mano en 6 lugares, y los botones ↓Excel / ↓PDF de la tarjeta de
// empresa eran justo los DOS que se la habían olvidado: la tarjeta mostraba
// solo lo pendiente y el archivo bajaba TODOS los reclamos, pagados incluidos.
// Medido contra producción (24-ago-2026): 5 de los 33 reclamos vivos ya estaban
// Pagados ($5.306,62) y se colaban igual en los archivos que se le mandan al
// proveedor — o sea, cobrarle dos veces. En Fashion Shoes el archivo pesaba 2,7
// veces lo que decía la tarjeta de al lado.
// La regla vive acá y en ningún otro lado.

/** Estado terminal del pipeline Creado → En proceso → Pagado. */
export const ESTADO_PAGADO = "Pagado";

/** true si el reclamo todavía se le debe cobrar al proveedor (no está Pagado). */
export function esPendiente(r: { estado?: string | null }): boolean {
  return (r.estado ?? "") !== ESTADO_PAGADO;
}

/** Los reclamos que siguen pendientes de cobro, en el mismo orden. */
export function soloPendientes<T extends { estado?: string | null }>(reclamos: readonly T[]): T[] {
  return reclamos.filter(esPendiente);
}
