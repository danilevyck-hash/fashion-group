// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGOS ESTILO APPLE · V2 (`CATALOGOS_APPLE_V2_2026_10`, 6-oct-2026).
// Propuesta del mockup «hoy vs recomendación»; Daniel la aprobó el 6-oct-2026.
// Se construye ENCIMA de la v1 y de la tercera vuelta (las dos prendidas):
// no deshace nada de lo aprobado. Reglas en docs/diseno.md.
//
// Las MISMAS tres pantallas, 2 a 4 cambios cada una:
//
//   ADMINISTRAR — la pregunta es «¿qué producto necesita atención?»
//     1. «Subir fotos» plegado en UNA fila con › mientras no haya nada subiendo
//        (las 4 marcas en 0 sin foto: la caja punteada empujaba la lista).
//        Arrastrar encima de la fila sigue subiendo.
//     2. Buscador, Género y Bulto en UNA fila (computadora).
//     3. Los chips de estado como los del catálogo: redondos, blancos con
//        borde y el seleccionado en negro (paleta), 44 px como hoy.
//
//   ARMADO DEL PEDIDO (vendedor) — «¿cuánto llevo?»
//     1. El total como número con UNA línea gris («3 productos · 12 bultos»),
//        sin ícono de carrito ni «9+».
//     2. La barra de vidrio y el botón negro del checkout: las dos pantallas
//        del pedido terminan en la MISMA barra.
//
//   CHECKOUT — «¿a quién se lo envío?»
//     1. «Datos del pedido» (Cliente · Vendedor) ARRIBA de los productos: es lo
//        que falta casi siempre y con un carrito largo quedaba fuera de vista.
//     2. La barra dice «3 productos · 36 u» bajo el total; el rótulo de la
//        lista ya no repite la cantidad.
//     3. Preventa y error del servidor con `<Aviso>`, la caja única.
//
// 🔴 NINGÚN PRECIO, NINGÚN NÚMERO Y NADA DE LO QUE SE GUARDA O ENVÍA CAMBIA.
// El interruptor llega por PROP a la barra del carrito y al checkout (el
// candado `catalogos-apple-2026-10` prohíbe que el carrito importe el diseño),
// y el catálogo PÚBLICO no la pasa nunca. Candado
// `catalogos-apple-v2-2026-10.test.tsx`.
//
// 🔴 `false` = las pantallas de hoy.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 El interruptor. `false` = la pantalla de antes.
 *  Daniel aprobó las capturas el 6-oct-2026: prendido (Marketing V2 sigue apagado). */
export const CATALOGOS_APPLE_V2_2026_10 = true;

/** Plural de siempre: «1 producto» · «3 productos». */
function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * La línea gris bajo el total del pedido. Armado: «3 productos · 12 bultos».
 * Checkout: «3 productos · 36 u». Solo junta números que ya están en pantalla.
 */
export function lineaDelPedido(p: { productos: number; bultos?: number; unidades?: number }): string {
  const partes = [plural(p.productos, "producto", "productos")];
  if (p.bultos != null) partes.push(plural(p.bultos, "bulto", "bultos"));
  if (p.unidades != null) partes.push(`${p.unidades} u`);
  return partes.join(" · ");
}

/** Forma y color del chip de estado de Administrar: redondo, como los del
 *  catálogo, seleccionado en negro (paleta). El tamaño lo pone la pantalla. */
export function claseChipAdmin(activo: boolean): string {
  return `rounded-full text-[13px] ${
    activo ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-700 hover:border-gray-400"
  }`;
}
