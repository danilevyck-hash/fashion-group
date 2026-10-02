// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGOS ESTILO APPLE (`CATALOGOS_APPLE_2026_10`, 1-oct-2026, propuesta del
// mockup «hoy vs recomendación», APAGADA hasta el «sí» de Daniel; reglas en
// docs/diseno.md).
//
// Medido en producción el 1-oct-2026:
//   · Los vendedores y bodega entran a Catálogos SOLO desde el celular (rey 14,
//     edwin 4, bodega 4 visitas desde el 25-sep; 0 desde computadora). Reinaldo
//     armó 51 de los 53 pedidos de Tommy de ago-sep.
//   · «Actualizar ahora» del catálogo: 10 corridas a mano en septiembre contra
//     496 automáticas. Es un dato de frescura, no la tarea de la pantalla.
//
// Lo que cambia, SOLO en la pantalla:
//   1. CATÁLOGO INTERNO (armar pedido) — la pregunta es «¿qué agrego al pedido?»:
//      · «hace X h» · Comprobantes · Compartir suben a la línea del logo (las
//        4 marcas igual). Se va la fila suelta del «hace X h».
//      · Celular: debajo del buscador UNA fila «Filtros › … N productos»;
//        «Ordenar» entra en «Filtros» (que cuenta el orden si no es el de
//        siempre). Computadora: Precio, Ordenar y la cantidad en UNA fila.
//   2. HUB DE MARCAS — una sola acción principal por marca: «Ver catálogo» a
//      lo ancho con «Copiar enlace» al lado (solo el ícono); «Comprobantes ·
//      Administrar» como enlaces de texto debajo.
//
// 🔴 NINGÚN PRECIO, NINGÚN NÚMERO Y NADA DE LO QUE SE GUARDA O ENVÍA CAMBIA.
// El carrito, el checkout y el payload del pedido no importan este archivo
// (candado `catalogos-apple-2026-10.test.tsx`). Los mismos filtros, el mismo
// orden y los mismos botones, con los mismos rótulos y permisos.
//
// 🔴 `false` = Catálogos como estaba el 1-oct-2026.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 El interruptor. `false` = la pantalla de hoy. */
export const CATALOGOS_APPLE_2026_10 = false;

/** El orden por defecto del catálogo: no cuenta como filtro puesto. */
export const ORDEN_POR_DEFECTO = "relevancia";

/**
 * Cuántas cosas cambió la persona dentro de «Filtros». Con la propuesta,
 * «Ordenar» vive adentro en el celular, así que un orden distinto del de
 * siempre suma uno: si no, el botón diría «Filtros» con el orden cambiado.
 */
export function puestosConOrden(filtrosPuestos: number, sortBy: string): number {
  return filtrosPuestos + (sortBy && sortBy !== ORDEN_POR_DEFECTO ? 1 : 0);
}

/**
 * Las clases de cada pieza de la barra de filtros con la propuesta. Un solo
 * contenedor `flex-wrap` y el ORDEN de cada pieza según el ancho:
 *   celular → buscador · [Filtros  Limpiar … N productos] · lo de adentro
 *   sm+     → buscador · filtros · [Precio  Limpiar … Ordenar  N productos]
 * Nada se dibuja dos veces: son los mismos controles, solo cambia el lugar.
 */
export function clasesBarraFiltros(abiertos: boolean) {
  const adentro = abiertos ? "" : "hidden ";
  return {
    contenedor: "flex flex-wrap items-center gap-2 mb-6",
    buscador: "relative w-full order-1",
    botonFiltros: "sm:hidden order-2",
    limpiar: "order-2 sm:order-5",
    cantidad: "order-2 ml-auto sm:order-7 sm:ml-0",
    desplegables: `${adentro}sm:flex lg:hidden w-full flex-wrap items-center gap-2 order-3`,
    pildoras: "hidden lg:flex w-full flex-wrap items-center gap-2 order-3",
    precio: `${adentro}sm:block w-full sm:w-auto order-4 sm:order-5`,
    orden: `${adentro}sm:block order-5 sm:order-6 sm:ml-auto`,
  };
}

/** Las acciones de la línea del logo: «hace X h» · Comprobantes · Compartir. */
export const ACCIONES_EN_EL_ENCABEZADO =
  "flex flex-wrap items-center justify-end gap-2 ml-auto";

/** Hub: «Ver catálogo» a lo ancho (con «Copiar enlace» al lado, solo el
 *  ícono) y Comprobantes · Administrar como enlaces de texto debajo. */
export const HUB_APPLE = {
  contenedor: "mt-5 flex flex-col gap-1",
  filaPrincipal: "flex items-center gap-2",
  principal: "flex-1",
  copiar:
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition active:scale-[0.97]",
  secundarios: "flex flex-wrap items-center gap-x-6",
  enlace:
    "inline-flex min-h-[44px] items-center text-sm font-medium underline-offset-4 opacity-80 hover:underline hover:opacity-100",
} as const;
