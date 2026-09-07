// ─────────────────────────────────────────────────────────────────────────────
// DÓNDE **NO** VA LA BARRA LATERAL — una sola lista, DERIVADA de las marcas.
//
// 🩸 POR QUÉ EXISTE (6-sep-2026). La lista vivía escrita a mano en tres lugares
// distintos y decía `["/catalogo-publico", "/pedido-reebok"]` — de cuando Reebok
// era la única marca con página pública. Consecuencia medida: un cliente de
// Tommy, Calvin o Joybees abría su pedido en el iPad y la página nacía corrida
// contra una franja vacía de **224 px** (el ancho de la barra, `w-56`), porque
// `/pedido-tommy`, `/pedido-calvin` y `/pedido-joybees` nunca se agregaron.
// Es el mismo defecto que `InstallPrompt` ya había arreglado para su lado en
// jul-2026 derivando la lista del tema de cada marca; acá se termina el trabajo.
//
// 🔑 LA REGLA: nada de rutas escritas a mano. Se derivan de `MARCAS_UI`, así que
// **la quinta marca queda cubierta el día que nace**, sin que nadie se acuerde.
//
// Son DOS listas, no una, porque contestan dos preguntas distintas:
//
//   · `esRutaDelCliente`  → ¿del otro lado hay un CLIENTE, sin sesión?
//     Ahí no se le ofrece instalar el ERP interno (lo usa `InstallPrompt`).
//
//   · `sinBarraLateral`   → ¿esta pantalla se dibuja a ancho completo?
//     Es la del cliente **más el catálogo con sesión** (`/catalogo/...`):
//     el vendedor mira el MISMO catálogo que el cliente y la barra le comía
//     224 px de los 834 del iPad, dejándole la tarjeta de producto en 160 px
//     contra los 235 del cliente — más chica en el iPad que en el iPhone (173).
//     Daniel eligió la opción A: sacarlo de la barra. El camino de vuelta no se
//     pierde: `CatalogoNavbar` ya trae su «← Inicio».
//
// ⚠️ EL PREFIJO SE COMPARA POR SEGMENTO, no con un `startsWith` pelado:
// `/catalogos/marcas` empieza con `/catalogo` y es el HUB, que sí lleva barra.
// ─────────────────────────────────────────────────────────────────────────────

import { MARCA_THEME, MARCAS_UI } from "@/lib/catalogo/marcas-ui";

/** La raíz del catálogo con sesión: `/catalogo/<marca>` y todo lo que cuelga. */
const CATALOGO_CON_SESION = "/catalogo";

/** Rutas donde del otro lado hay un CLIENTE, sin sesión. */
export const RUTAS_DEL_CLIENTE: string[] = [
  "/catalogo-publico",
  ...MARCAS_UI.map((m) => MARCA_THEME[m].pedidoPublicoBase),
];

/** Rutas que se dibujan a ancho completo (sin barra lateral). */
export const RUTAS_SIN_BARRA: string[] = [
  ...RUTAS_DEL_CLIENTE,
  CATALOGO_CON_SESION,
];

/** ¿`pathname` es esa ruta o cuelga de ella? Por SEGMENTO, nunca por prefijo
 *  suelto — si no, `/catalogos/...` (el hub) entraría por `/catalogo`. */
function cuelgaDe(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + "/");
}

/** ¿Del otro lado de esta pantalla hay un cliente, sin sesión? */
export function esRutaDelCliente(pathname: string): boolean {
  return RUTAS_DEL_CLIENTE.some((p) => cuelgaDe(pathname, p));
}

/** ¿Esta pantalla se dibuja a ancho completo, sin barra lateral?
 *  `/` es el login, que nunca la tuvo. */
export function sinBarraLateral(pathname: string): boolean {
  return pathname === "/" || RUTAS_SIN_BARRA.some((p) => cuelgaDe(pathname, p));
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS DIRECCIONES DEL CLIENTE, DERIVADAS DE LA MARCA (7-sep-2026).
//
// El catálogo público vive en `/catalogo-publico/<marca>` y —desde hoy— su
// pantalla de REVISAR en `/catalogo-publico/<marca>/revisar`. Se derivan por la
// misma razón que la lista de arriba: escribirlas marca por marca es lo que
// dejó a tres marcas afuera la vez pasada. Nada que agregar el día que nazca
// la quinta.
//
// ⚠️ `revisar` cuelga de `/catalogo-publico`, así que YA entra en
// `esRutaDelCliente` y en `sinBarraLateral` sin tocar ninguna de las dos listas
// (se comparan por segmento).
// ─────────────────────────────────────────────────────────────────────────────

/** Segmento de la pantalla donde el cliente revisa antes de confirmar. */
export const SEGMENTO_REVISAR = "revisar";

/** `/catalogo-publico/<marca>` — el link que se comparte. */
export function rutaCatalogoPublico(marca: string): string {
  return `/catalogo-publico/${marca}`;
}

/** `/catalogo-publico/<marca>/revisar` — lo que va a pedir, antes de confirmar. */
export function rutaRevisarPublico(marca: string): string {
  return `${rutaCatalogoPublico(marca)}/${SEGMENTO_REVISAR}`;
}
