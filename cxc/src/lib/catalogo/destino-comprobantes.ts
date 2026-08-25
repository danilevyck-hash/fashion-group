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
// 🩸 Y EL BOTÓN NO PUEDE SER UNO SOLO, porque la confirmación NO la ve un solo
// rol. La ven los tres que pueden armar pedidos (`createRoles` = admin,
// secretaria y vendedor) y `/catalogos/admin/<marca>` es de
// `CATALOGO_ADMIN_ROLES` (admin + secretaria): mandar ahí a un vendedor es
// mandarlo a una pantalla cuyas peticiones mueren en 403 en el servidor. El
// vendedor tiene SU lista —`/catalogo/<marca>/pedidos`, la de siempre— y ahí
// va, con el nombre que esa pantalla ya usa.
//
// Por eso el destino y su rótulo salen del MISMO lugar: un `href` y un `label`
// que se separen es exactamente un botón que dice una cosa y lleva a otra.
//
// Módulo PURO: no importa React. Lo usan la confirmación y sus candados.
// ─────────────────────────────────────────────────────────────────────────────

import { CATALOGO_ADMIN_ROLES } from "./roles";
import { PANEL_COMPROBANTES, TAB_COMPROBANTES_KEY } from "./numeros-pedido";

/** Lo mínimo del tema de la marca para saber a dónde ir. */
export interface RutasDeMarca {
  /** `/catalogo/<marca>/pedidos` — la lista que ve cualquiera que arma pedidos. */
  pedidosHref: string;
  /** `/catalogos/admin/<marca>` — solo admin y secretaria. */
  adminHref: string;
}

export interface DestinoLista {
  href: string;
  label: string;
  /** `true` = va al panel de Comprobantes del admin. Para los candados. */
  esPanelAdmin: boolean;
}

/** «Ver comprobantes» — el panel del admin, que es el que cambió de nombre. */
export const BOTON_COMPROBANTES = `Ver ${PANEL_COMPROBANTES.toLowerCase()}`;

/** «Ver pedidos» — la lista del vendedor, que se sigue llamando Pedidos. */
export const BOTON_PEDIDOS = "Ver pedidos";

/**
 * A dónde lleva el botón de la confirmación, según el rol de la sesión.
 *
 * 🔴 El default es la lista NO-admin: un rol desconocido (o una sesión sin
 * `cxc_role` todavía leído) va a la pantalla que no da 403. El modo de fallo
 * aceptable es mandar a alguien a una lista que puede ver, nunca a una que le
 * va a rebotar.
 */
export function destinoLista(rutas: RutasDeMarca, role: string | null | undefined): DestinoLista {
  const esAdmin = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(String(role ?? ""));
  return esAdmin
    ? {
        href: `${rutas.adminHref}?tab=${TAB_COMPROBANTES_KEY}`,
        label: BOTON_COMPROBANTES,
        esPanelAdmin: true,
      }
    : { href: rutas.pedidosHref, label: BOTON_PEDIDOS, esPanelAdmin: false };
}
