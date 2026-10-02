// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGOS ESTILO APPLE · TERCERA VUELTA (`CATALOGOS_APPLE_2026_10_B`,
// 2-oct-2026). Propuesta del mockup «hoy vs recomendación», APAGADA hasta el
// «sí» de Daniel. Reglas en docs/diseno.md › «Detalles aprendidos»: el logo o
// el título van en la línea de «← Volver», sin franjas, y lo primero que se ve
// es el contenido.
//
// Daniel, 2-oct-2026: *«¿el buscador no puede ir al nivel de los filtros para
// optimizar? ¿Qué haría Steve Jobs?»*, y que la misma idea se aplique «donde
// sea lógico». Un interruptor por grupo, para aprobarlos uno por uno:
//
//   buscadorEnUnaFila   A  · Catálogo interno: «[Buscar…] [Filtros] [↕]» en
//                            UNA fila, con la cantidad en gris dentro del campo.
//                            Filtros y Orden son botones de 44 px.
//   catalogoPublico     B1 · El catálogo que se manda al cliente: el logo, el
//                            sello «Fashion Group» y «Descargar PDF» en UNA
//                            fila, y el buscador como en A.
//   revisarPedido       B2 · «Revisar pedido» del cliente: «← Seguir viendo» y
//                            el logo en la misma línea; sin el nombre de la
//                            marca repetido debajo del título.
//   subpaginasInternas  B3 · Comprobantes, Ver pedido y el detalle: la barra de
//                            arriba lleva el camino o «← Volver» con el título;
//                            se van la fila vacía y la flecha repetida.
//   administrar         B4 · Catálogos › Administrar: «Actualizar ahora» sube a
//                            la línea del título, con los demás botones.
//
// No se tocan (el porqué va en el mockup): el pedido público (es el comprobante
// que guarda el cliente y entra entero en la primera pantalla), la confirmación
// (ya es barra + contenido), el «FG» doble (ya se fue con la estructura del
// 1-oct), el Inicio (el logo ya se fue; la fecha en la línea del saludo sube
// 15 px en la computadora y 2 en el celular: no vale el cambio) y los títulos
// grandes del celular (decisión de Daniel del 24-sep: solo se propone, con
// captura; achicarlos sube 15 px).
//
// 🔴 NINGÚN PRECIO, NINGÚN NÚMERO Y NADA DE LO QUE SE GUARDA O ENVÍA CAMBIA.
// Mismos controles, mismos permisos y mismos destinos; solo cambia el lugar.
// Candado: `catalogos-apple-2026-10-b.test.tsx`.
//
// 🔴 `false` = la pantalla de hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { parsePrecio, type FiltroPrecio } from "./filtros-extra";

export interface InterruptoresB {
  readonly buscadorEnUnaFila: boolean;
  readonly catalogoPublico: boolean;
  readonly revisarPedido: boolean;
  readonly subpaginasInternas: boolean;
  readonly administrar: boolean;
}

/** 🔴 Los interruptores. Todos en `false` = las pantallas de hoy. */
export const CATALOGOS_APPLE_2026_10_B: InterruptoresB = {
  buscadorEnUnaFila: false,
  catalogoPublico: false,
  revisarPedido: false,
  subpaginasInternas: false,
  administrar: false,
};

/** Lo que dibuja la barra de arriba del catálogo con sesión en cada sub-ruta.
 *  `migas` = el camino completo (Comprobantes) · `volver` = una flecha al
 *  padre, con el título de la pantalla si lo tiene · `null` = como hoy. */
export type BarraDeSubruta =
  | { tipo: "migas" }
  | { tipo: "volver"; href: string; label: string; titulo?: string }
  | null;

/**
 * Qué va en la barra de arriba según la dirección. Puro: lo leen la barra, las
 * pantallas (para no dibujar lo mismo dos veces) y su candado.
 *   /catalogo/<m>/pedidos       → el camino de migas (el título es su último tramo)
 *   /catalogo/<m>/pedido/<id>   → «← Comprobantes»
 *   /catalogo/<m>/checkout      → «← Catálogo» · «Confirmar pedido»
 * Cualquier otra (el catálogo, la confirmación) sigue como hoy.
 */
export function barraDeSubruta(
  pathname: string | null | undefined,
  rutas: { pedidosHref: string; catalogoHref: string },
  prendido: boolean = CATALOGOS_APPLE_2026_10_B.subpaginasInternas,
): BarraDeSubruta {
  if (!prendido || !pathname) return null;
  if (/^\/catalogo\/[^/]+\/pedidos\/?$/.test(pathname)) return { tipo: "migas" };
  if (/^\/catalogo\/[^/]+\/pedido\/[^/]+\/?$/.test(pathname)) {
    return { tipo: "volver", href: rutas.pedidosHref, label: "Comprobantes" };
  }
  if (/^\/catalogo\/[^/]+\/checkout\/?$/.test(pathname)) {
    return { tipo: "volver", href: rutas.catalogoHref, label: "Catálogo", titulo: "Confirmar pedido" };
  }
  return null;
}

// ── «Precio ▾» como chip (buscadorEnUnaFila, 2-oct-2026) ─────────────────────
// Daniel: «al tocar filtro, precio desde/hasta ¿no debería estar al nivel de
// categoría? Y desde/hasta no combina con el módulo».

/** Lo que se manda al tocar «Aplicar»: el MISMO par que escribía el filtro de
 *  antes. Con solo «Desde», «Hasta» toma el mismo número (el espejo del
 *  24-ago-2026: escribir un precio filtra ese precio exacto). */
export function precioAlAplicar(b: FiltroPrecio): FiltroPrecio {
  const desde = b.desde.trim();
  const hasta = b.hasta.trim();
  return { desde, hasta: hasta || desde };
}

/** El texto del chip con el filtro puesto: «$25», «$20–$40», «Desde $20» o
 *  «Hasta $40». `null` = sin filtro (el chip dice «Precio»). */
export function textoChipPrecio(p: FiltroPrecio): string | null {
  const min = parsePrecio(p.desde);
  const max = parsePrecio(p.hasta);
  const $ = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return min === max ? $(min) : `${$(min)}–${$(max)}`;
  return min !== null ? `Desde ${$(min)}` : `Hasta ${$(max as number)}`;
}
