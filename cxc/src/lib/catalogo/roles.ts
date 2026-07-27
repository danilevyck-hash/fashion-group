// Roles del módulo Catálogos — FUENTE ÚNICA.
//
// Dos niveles, y solo dos:
//
//   CATALOGO_ROLES        → ver el catálogo interno (hub, catálogo por marca,
//                           armar pedidos). admin, secretaria, vendedor, bodega.
//   CATALOGO_ADMIN_ROLES  → ADMINISTRAR el catálogo de una marca: subir/cambiar
//                           fotos (incluido el ZIP del banco B2B y el selector
//                           de variantes), etiquetas, ocultar productos del
//                           catálogo, y el tab de Pedidos (borrar/editar/
//                           exportar). admin y secretaria — nadie más.
//
// El 27-jul-2026 `secretaria` se sumó a CATALOGO_ADMIN_ROLES por pedido de
// Daniel ("a las secretarias, ponle que puedan ver catálogos como a daniel, con
// administrar también"). Antes la API YA la dejaba entrar a casi todo el admin
// (`requireAdmin` de lib/api-auth = admin+secretaria, que es lo que protege
// products y variantes), pero la UI le escondía el botón "Administrar" y dos
// endpoints seguían solo-admin: `upload` en Joybees/Tommy y el borrado/edición
// de un pedido del link. Esto alinea las tres capas.
//
// REGLA: agregar un rol acá abre TODO el admin de las 3 marcas. El candado
// `src/__tests__/lib/catalogo-roles.test.ts` congela ambas listas y falla si
// aparece un rol nuevo sin haberlo decidido.
//
// Lo que NO se administra desde acá (a propósito): los PRECIOS los manda
// Switch — la allow-list de campos editables a mano es image_url/badge (+name
// solo en Tommy). Ver src/app/api/catalogo/[marca]/products/route.ts.

/** Ven el catálogo interno (no necesariamente lo administran). */
export const CATALOGO_ROLES = ["admin", "secretaria", "vendedor", "bodega"] as const;

/** Administran el catálogo de cualquier marca (fotos, etiquetas, ocultar,
 *  pedidos). Mismo par que `ADMIN_ROLES` de lib/api-auth, que es el que ya
 *  protege products/variantes. */
export const CATALOGO_ADMIN_ROLES = ["admin", "secretaria"] as const;

/** Copias mutables para las APIs que reciben `string[]`. */
export const catalogoRoles = (): string[] => [...CATALOGO_ROLES];
export const catalogoAdminRoles = (): string[] => [...CATALOGO_ADMIN_ROLES];
