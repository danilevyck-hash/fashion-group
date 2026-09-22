// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL CAMINO DE MIGAS ES LA ÚNICA FORMA DE VOLVER (22-sep-2026)
//
// Daniel, mirando la captura de Comprobantes de Reebok del 19-sep-2026: en 100
// píxeles de alto convivían TRES formas de volver.
//
//   1. «← Inicio»   — arriba del todo, al lado del logo (`CatalogoNavbar`).
//   2. El camino     — «Inicio › Catálogos › Marcas › Reebok › Comprobantes».
//   3. «← Catálogo» — justo encima del título (`PedidosListClient`).
//
// 🩸 SE COMPROBÓ A DÓNDE IBA CADA UNA ANTES DE QUITARLAS, y ninguna llevaba a
// un sitio que el camino no ofrezca:
//   · «← Inicio»   → `/home`, igual que el tramo «Inicio».
//   · «← Catálogo» → `theme.catalogoHref` (`/catalogo/reebok`), igual que el
//     tramo de la MARCA — y que el logo de la navbar, que ya es un enlace ahí.
//
// Se queda el camino, que dice dónde estás **y** deja saltar a cualquier nivel.
//
// 🔴 Y POR ESO EL CAMINO TIENE QUE ESTAR COMPLETO EN TODAS. Si es la única
// forma de volver, una pantalla con el camino a medias deja a alguien sin
// salida. Administrar decía «Inicio › Catálogos» —le faltaban TRES tramos— y
// Categorías igual. Los tres caminos del módulo se arman acá, con la misma
// cabecera, para que no puedan separarse.
//
// ⚠️ «← Inicio» NO se borra de la navbar: esa barra envuelve TODAS las
// sub-rutas del catálogo (el catálogo, el checkout, el detalle del pedido, la
// confirmación) y en ésas es la única salida que hay. Se esconde **solo donde
// hay camino de migas**, que es lo que `hayCaminoDeMigas` decide.
//
// Módulo PURO: no importa React. Lo leen la navbar, la pantalla de
// comprobantes, las dos de administrar y sus candados.
// ─────────────────────────────────────────────────────────────────────────────

import { getMarcaTheme, type MarcaUiKey } from "./marcas-ui";
import { PANEL_COMPROBANTES } from "./numeros-pedido";

/** Un tramo del camino. Sin `href` = es donde estás parado. */
export interface TramoDeMigas {
  label: string;
  href?: string;
}

/** Los dos primeros tramos, iguales en las tres pantallas del módulo. */
const RAIZ: readonly TramoDeMigas[] = [
  { label: "Inicio", href: "/home" },
  // `/catalogo` redirige (307) al hub, igual que el breadcrumb del propio hub.
  { label: "Catálogos", href: "/catalogo" },
  { label: "Marcas", href: "/catalogos/marcas" },
];

/** El tramo de la MARCA: su nombre y su catálogo, derivados del tema. */
function tramoDeMarca(marca: MarcaUiKey): TramoDeMigas {
  const theme = getMarcaTheme(marca);
  return { label: theme?.label ?? "", href: theme?.catalogoHref };
}

/** El último tramo de la pantalla de administrar el catálogo. */
export const TRAMO_ADMINISTRAR = "Administrar";

/** El último tramo de la lista de categorías de Reebok. */
export const TRAMO_CATEGORIAS = "Categorías";

/**
 * 🔑 El último tramo de Comprobantes se DERIVA de `PANEL_COMPROBANTES`, el
 * mismo del título de la pantalla y del botón del hub: un cuarto nombre para
 * este lugar sería volver al problema que Daniel arregló el 6-sep-2026.
 */
export function tramosDeComprobantes(marca: MarcaUiKey): TramoDeMigas[] {
  return [...RAIZ, tramoDeMarca(marca), { label: PANEL_COMPROBANTES }];
}

/** Administrar el catálogo de una marca. */
export function tramosDeAdministrar(marca: MarcaUiKey): TramoDeMigas[] {
  return [...RAIZ, tramoDeMarca(marca), { label: TRAMO_ADMINISTRAR }];
}

/** Las categorías por rubro, que cuelgan de Administrar. */
export function tramosDeCategorias(marca: MarcaUiKey): TramoDeMigas[] {
  return [
    ...RAIZ,
    tramoDeMarca(marca),
    { label: TRAMO_ADMINISTRAR, href: `/catalogos/admin/${marca}` },
    { label: TRAMO_CATEGORIAS },
  ];
}

/**
 * Los tramos que le tocan al `breadcrumbs` de `AppHeader`.
 *
 * Esa barra ya pone «Inicio» y el nombre del módulo («Catálogos») por su
 * cuenta, así que se le pasan los tramos de ahí para abajo. Se calcula desde
 * `RAIZ` y no con un `2` escrito a mano: si algún día la raíz cambia, el corte
 * la sigue.
 */
export function migasDeAppHeader(
  tramos: readonly TramoDeMigas[],
  ir: (href: string) => void,
): { label: string; onClick?: () => void }[] {
  return tramos.slice(RAIZ.length - 1).map((t) => ({
    label: t.label,
    onClick: t.href ? () => ir(t.href as string) : undefined,
  }));
}

/**
 * ¿Esta dirección dibuja el camino de migas?
 *
 * 🔴 Es lo ÚNICO que decide esconder «← Inicio» de la navbar del catálogo. Una
 * dirección que no esté acá conserva su flecha: quedarse sin las dos salidas es
 * peor que tener una de más.
 */
export function hayCaminoDeMigas(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // `/catalogo/<marca>/pedidos`, con o sin barra final. Nada de `includes`.
  return /^\/catalogo\/[^/]+\/pedidos\/?$/.test(pathname);
}
