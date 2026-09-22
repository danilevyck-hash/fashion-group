// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS NÚMEROS QUE LA LISTA DE COMPROBANTES DICE DE SÍ MISMA (22-sep-2026)
//
// Mirando la pantalla de Reebok en producción el 19-sep-2026, arriba decía
// «Todos 13 · Del cliente 1 · Del vendedor 12» y al lado «Pedidos 13 ·
// Borradores 2». 13 + 2 = 15, pero «Todos» decía 13. Y abajo del todo,
// «Ver más (5)». Quien mira no sabía si había 13, 15 o 18.
//
// 🩸 MEDIDO CONTRA PRODUCCIÓN (reebok, al 19-sep-2026): **20 comprobantes
// vivos**. 15 caen dentro de la ventana de la lista (13 pedidos + 2
// borradores) y **5 quedan detrás de «Ver más»** — los cinco pedidos del link
// que nadie confirmó, del 7 al 13 de julio, que a los 30 días salen de la
// lista. Esos 5 **no los contaba NINGÚN chip**: son «Del cliente» y son
// «Pedidos», así que el chip «Del cliente 1» estaba describiendo 1 de 6. Por
// eso el Excel del día siguiente bajó 20 filas contra las 13 de la pantalla.
//
// Dos arreglos, y los dos son la MISMA regla de la casa —*«o el total sigue al
// filtro, o no hay buscador»*—, la que Guías estrenó el 19-sep con su pie
// «47 guías de 236» y volvió a pagar el 22-sep con los bultos:
//
//   1. **El pie dice cuántas se ven de cuántas hay**: «13 comprobantes de 20».
//      Sale de `lib/ui/pie-de-lista.ts`, el MISMO módulo que usa Guías: la
//      regla se mudó allá en vez de escribirse una segunda vez.
//   2. **Lo que se selecciona y lo que se borra DICEN a cuántas filas
//      afectan**: «Seleccionar todos (13)» · «Eliminar seleccionados (13)».
//
// 🩸 Y «Seleccionar todos» NO seleccionaba todos: cubría solo las filas de los
// meses ABIERTOS. En la captura del 19-sep, con septiembre abierto (2) y julio
// plegado (11), tocarlo marcaba **2 de 13** y el botón rojo decía «(2)». El
// pliegue de un mes es un pliegue, no un filtro: lo que se selecciona son las
// filas que pasan los DOS filtros, y el rótulo lo dice con su número.
//
// Módulo PURO: números entran, textos salen. Los textos viven acá y no sueltos
// en la pantalla porque el candado los mide, y porque un rótulo que promete
// «todos» tiene que poder compararse contra la lista que de verdad se toca.
// ─────────────────────────────────────────────────────────────────────────────

import { textoDelPie } from "@/lib/ui/pie-de-lista";

/** Cómo se nombra lo que esta lista cuenta. El contenedor es «Comprobantes». */
const PALABRAS = { singular: "comprobante", plural: "comprobantes" } as const;

/**
 * El pie de la lista.
 *
 * `mostradas` = las filas que sobreviven a los dos filtros y a la ventana —lo
 * que suman los encabezados de mes, estén plegados o no—.
 * `total` = TODOS los comprobantes vivos que el servidor mandó, antes de la
 * búsqueda, de los chips y del «Ver más».
 */
export function textoPieDeComprobantes(mostradas: number, total: number): string {
  return textoDelPie(mostradas, total, PALABRAS);
}

/** El rótulo pelado, sin número. Se conserva para que nadie lo teclee aparte. */
export const ROTULO_SELECCIONAR_TODOS = "Seleccionar todos";

/**
 * 🔴 «Seleccionar todos (13)» — el rótulo DICE a cuántas filas alcanza.
 *
 * Con cero seleccionables no se le cuelga un «(0)»: el bloque ni siquiera se
 * dibuja cuando la lista está vacía, y un cero entre paréntesis se lee como un
 * dato que no cargó.
 */
export function textoSeleccionarTodos(seleccionables: number): string {
  return seleccionables > 0 ? `${ROTULO_SELECCIONAR_TODOS} (${seleccionables})` : ROTULO_SELECCIONAR_TODOS;
}

/** 🔴 El botón destructivo DICE a cuántas filas afecta. Nunca sale sin número. */
export function textoEliminarSeleccionados(seleccionados: number): string {
  return `Eliminar seleccionados (${seleccionados})`;
}
