// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CATÁLOGO REEBOK — REVISIÓN DEL 15-nov-2026 (mockups reebok-cat-01..05,
// aprobados por Daniel). Cada interruptor en `false` deja la pantalla —y la
// cuenta— exactamente como estaba.
// ─────────────────────────────────────────────────────────────────────────────

/** 01 · La tarjeta dice «Existencia N» solo cuando es distinta de
 *  «Disponibilidad N» (en 643 de 838 productos eran iguales). */
export const EXISTENCIA_SOLO_SI_DIFIERE_2026_11 = true;

/** 02 · Con productos en el pedido, la barra de pestañas del celular se
 *  esconde y queda solo la barra del pedido, en una línea:
 *  «$X · N producto · N bultos · Ver pedido». */
export const BARRA_PEDIDO_SOLA_2026_11 = true;

/** 03 · «Confirmar pedido» abre con el vendedor ya puesto, sin «Cargando…». */
export const VENDEDOR_PUESTO_2026_11 = true;

/** 04 · Unidades: el renglón dice «código · bulto de N · M u» y la barra de
 *  abajo «N producto · N bultos», como la del catálogo. */
export const UNIDADES_EN_BULTOS_2026_11 = true;

/** catalogo-mas-01 · Arriba a la izquierda del catálogo, «‹ Catálogos» (vuelve
 *  a las cuatro marcas, /catalogos/marcas) en vez de «← Inicio». Las 4 marcas,
 *  celular y computadora. El historial queda espejo del camino. */
export const ATRAS_A_CATALOGOS_2026_11 = true;

/** catalogo-mas-03 · Comprobantes en el celular: «‹ Reebok» + título
 *  «Comprobantes», y cada comprobante en 3 líneas, sin «Del vendedor». */
export const COMPROBANTES_CELULAR_2026_11 = true;

/** catalogo-mas-04 · Computadora: «N productos · Actualizado h:mm pm ↻» en la
 *  línea de los filtros, a la derecha; sale de la barra de arriba y del
 *  buscador. La hora, nunca «hace N h». */
export const ACTUALIZADO_EN_FILTROS_2026_11 = true;

/** catalogo-mas-02b · El precio de «Confirmar pedido» como cápsula gris igual
 *  al stepper, sin lápiz; cambiado, en azul y con «Lista $X» tachado debajo. */
export const PRECIO_CAPSULA_2026_11 = true;

/** El precio de lista a mostrar tachado, o `null` si el precio NO se cambió
 *  (o no se sabe cuál era: el carrito viejo no lo trae, y ahí no se inventa). */
export function listaSiCambio(unitPrice: number, precioLista: number | null | undefined): number | null {
  if (typeof precioLista !== "number" || !(precioLista > 0)) return null;
  return Math.round(unitPrice * 100) === Math.round(precioLista * 100) ? null : precioLista;
}
