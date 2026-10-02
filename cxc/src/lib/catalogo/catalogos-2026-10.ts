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
// v2 (2-oct-2026, Daniel aprobó y pidió más: «siento que ocupa mucho espacio
// arriba antes de ver fotos, digo poner el logo al nivel de inicio… En Reebok
// veo doble logo»). Reglas en docs/diseno.md › «Detalles aprendidos»:
//   · El logo vive en la barra de «← Inicio» y es el ÚNICO de la pantalla
//     (Reebok tenía dos). El catálogo no dibuja franja de logo.
//   · Las acciones también van en esa barra: en la computadora «hace X h» ·
//     Comprobantes · Compartir; en el celular un solo «···» con lo mismo.
//   · Celular: «Filtros › · ↕ Relevancia … N productos» en UNA fila; el orden
//     queda a la vista como chip (el `select` real va encima, transparente).
//     Abiertos, los filtros son UNA fila de chips («Género», no «Género:
//     Todos») y UNA de precio.
//   · Medido: la primera foto sube de 455 → 219 px (Tommy) y 399 → 219
//     (Reebok) en el celular; de 467 → 271 (Tommy) y 463 → 271 (Reebok) en la
//     computadora.
//
// 🔴 NINGÚN PRECIO, NINGÚN NÚMERO Y NADA DE LO QUE SE GUARDA O ENVÍA CAMBIA.
// El carrito, el checkout y el payload del pedido no importan este archivo
// (candado `catalogos-apple-2026-10.test.tsx`). Los mismos filtros, el mismo
// orden y los mismos botones, con los mismos rótulos y permisos.
//
// 🔴 `false` = Catálogos como estaba el 1-oct-2026.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 El interruptor. `false` = la pantalla de hoy. */
// Daniel aprobó las capturas el 2-oct-2026: "sí".
export const CATALOGOS_APPLE_2026_10 = true;

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
    contenedor: "flex flex-wrap items-center gap-2 mb-4",
    buscador: "relative w-full order-1",
    botonFiltros: "max-sm:inline-flex hidden order-2",
    // Celular: el orden es un chip al lado de «Filtros» (el `select` real va
    // encima, transparente: se toca y abre la lista nativa del teléfono).
    orden: "relative order-2 sm:order-6 sm:ml-auto",
    ordenChip: "max-sm:inline-flex hidden pointer-events-none",
    ordenSelect: "max-sm:absolute max-sm:inset-0 max-sm:opacity-0 max-sm:[&>select]:h-full max-sm:[&>select]:w-full",
    limpiar: "order-2 sm:order-5",
    cantidad: "order-2 ml-auto sm:order-7 sm:ml-0",
    desplegables: `${adentro}sm:flex lg:hidden w-full flex-wrap items-center gap-2 order-3`,
    pildoras: "hidden lg:flex w-full flex-wrap items-center gap-2 order-3",
    precio: `${adentro}sm:block w-full sm:w-auto order-4 sm:order-5`,
  };
}

// ── v2 (2-oct-2026, Daniel: «poner el logo al nivel de inicio») ──────────────

/** El hueco de la barra de «← Inicio» donde el catálogo monta sus acciones. */
export const ID_ACCIONES_EN_LA_BARRA = "catalogo-acciones-en-la-barra";

/** Las acciones en la barra: en la computadora las tres de siempre; en el
 *  celular un solo «···» con las mismas cosas adentro. */
export const CLASES_MENU_MAS = {
  computadora: "hidden sm:flex items-center gap-2",
  celular: "relative max-sm:block hidden",
  boton:
    "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-black/10 text-lg leading-none tracking-widest",
  panel:
    "absolute right-0 top-full z-50 mt-1 w-60 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg",
} as const;

/** El orden visible en el chip del celular: corto, sin «Ordenar:». */
const ORDEN_CORTO: Record<string, string> = {
  relevancia: "Relevancia",
  "precio-asc": "Precio ↑",
  "precio-desc": "Precio ↓",
  "nombre-az": "A-Z",
};
export function textoOrdenCorto(sortBy: string): string {
  return ORDEN_CORTO[sortBy] ?? ORDEN_CORTO.relevancia;
}

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
