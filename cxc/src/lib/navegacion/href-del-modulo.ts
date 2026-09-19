// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL BREADCRUMB LLEVA A LA DIRECCIÓN DEL MÓDULO, NO AL PRIMER TRAMO DE LA
// DIRECCIÓN (18-sep-2026).
//
// 🩸 El encabezado armaba el enlace del módulo recortando la URL a su primer
// tramo (`pathname.split("/").slice(0, 2)`). Para 19 de los 22 módulos eso da
// justo su dirección, y por eso nunca se notó. Para los otros TRES da una
// dirección que no es la del módulo:
//
//   · `/productos/cargar`  (Plantilla Switch) → `/productos`  → NO EXISTE: 404
//   · `/admin/usuarios`    (Usuarios)         → `/admin`      → redirige a CXC,
//                                                que es OTRO módulo
//   · `/catalogos/marcas`  (Catálogos)        → `/catalogos`  → vive solo por el
//                                                redirect que se le puso el
//                                                17-sep-2026
//
// El postmortem del 17-sep ya lo había medido («dos de ellas son a donde apunta
// el breadcrumb de sus propias pantallas») y lo tapó con redirects. Esto lo
// arregla en el origen: la dirección de un módulo la dice `modules.ts`, que es
// donde vive, y no se vuelve a adivinar de la URL.
//
// 🔑 FALLA ABIERTA: una dirección que no es de ningún módulo (por ejemplo
// `/catalogo/reebok/pedidos`) se resuelve como siempre, recortando. Esto no
// puede dejar el encabezado sin enlace.
// ─────────────────────────────────────────────────────────────────────────────

import { ALL_MODULES } from "@/lib/modules";
import { moduloDeRuta } from "@/lib/novedades/seleccion";

/**
 * La dirección a la que tiene que llevar el nombre del módulo en el breadcrumb.
 *
 * Sale de `modules.ts` cuando la ruta es de un módulo conocido; si no, del
 * primer tramo de la dirección, que es lo que se hacía antes.
 */
export function hrefDelModulo(pathname: string): string {
  const key = moduloDeRuta(pathname, ALL_MODULES);
  const modulo = key ? ALL_MODULES.find((m) => m.key === key) : null;
  if (modulo) return modulo.href;
  return pathname.split("/").slice(0, 2).join("/") || "/home";
}
