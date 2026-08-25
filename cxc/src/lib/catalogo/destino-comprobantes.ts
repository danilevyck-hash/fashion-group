// ─────────────────────────────────────────────────────────────────────────────
// 🔴 DESDE LA CONFIRMACIÓN A LA LISTA, EN UN TOQUE — Y CADA ROL A DONDE PUEDE
// ENTRAR (25-ago-2026)
//
// Daniel, textual: *"al terminar un pedido, un botón para ver los
// comprobantes… o dejarlo volver a catálogo"*. Antes de esto, desde la
// confirmación había que volver al catálogo, salir a Catálogos, elegir la
// marca, tocar «Administrar» y recién ahí la pestaña: CUATRO toques para ver la
// lista de lo que uno acaba de mandar.
//
// 🔴 Y DESDE EL 25-ago-2026 EL BOTÓN SÍ ES UNO SOLO — porque la pantalla es
// una sola. Antes esto tenía que bifurcar: la lista del admin
// (`/catalogos/admin/<marca>?tab=pedidos`) le respondía 403 al vendedor en el
// servidor, así que mandarlo ahí era mandarlo a una pantalla en ceros. Ahora
// los comprobantes viven en `/catalogo/<marca>/pedidos`, a la que llegan los
// TRES roles que arman pedidos (`createRoles` = admin, secretaria y vendedor),
// y lo que cada uno puede hacer adentro lo decide su rol.
//
// La función SIGUE recibiendo el rol y sigue existiendo: es el candado de que
// nadie vuelva a mandar a un vendedor al panel de administrar. Lo que cambió es
// que ahora los tres van al mismo lado, y `esPanelAdmin` es false SIEMPRE.
//
// El destino y su rótulo salen del MISMO lugar: un `href` y un `label` que se
// separen es exactamente un botón que dice una cosa y lleva a otra.
//
// Módulo PURO: no importa React. Lo usan la confirmación y sus candados.
// ─────────────────────────────────────────────────────────────────────────────

import { PANEL_COMPROBANTES } from "./numeros-pedido";

/** Lo mínimo del tema de la marca para saber a dónde ir. */
export interface RutasDeMarca {
  /** `/catalogo/<marca>/pedidos` — la lista que ve cualquiera que arma pedidos. */
  pedidosHref: string;
  /** `/catalogos/admin/<marca>` — el panel de FOTOS, solo admin y secretaria.
   *  Ya NO es destino de esta función; se conserva porque el tema de la marca
   *  lo expone y el candado comprueba que nadie vuelva a apuntar acá. */
  adminHref: string;
}

export interface DestinoLista {
  href: string;
  label: string;
  /** `true` = va al panel de Comprobantes del admin. Para los candados. */
  esPanelAdmin: boolean;
}

/** «Ver comprobantes» — la pantalla, que es una sola para todos. */
export const BOTON_COMPROBANTES = `Ver ${PANEL_COMPROBANTES.toLowerCase()}`;

/** Nombre viejo del rótulo del vendedor. Hoy los dos dicen lo mismo. */
export const BOTON_PEDIDOS = BOTON_COMPROBANTES;

/**
 * A dónde lleva el botón de la confirmación. Desde que los comprobantes son UNA
 * pantalla, los tres roles van al mismo lado y el rótulo es el mismo.
 *
 * 🔴 Sigue recibiendo el rol A PROPÓSITO: es lo que deja escrito —y medible—
 * que NINGÚN rol, ni el admin, se va al panel de administrar. `esPanelAdmin`
 * false para todos es el invariante que el candado exige.
 */
export function destinoLista(rutas: RutasDeMarca, _role?: string | null): DestinoLista {
  void _role;
  return { href: rutas.pedidosHref, label: BOTON_COMPROBANTES, esPanelAdmin: false };
}
