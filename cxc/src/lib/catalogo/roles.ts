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

/** QUIRK heredado: Reebok todavía lista 'cliente' en `createRoles`. NO es un
 *  rol del sistema (`SYSTEM_ROLES` no lo tiene) y ningún usuario puede tenerlo,
 *  pero mientras esté en la lista hay que nombrarlo para poder excluirlo. */
export const ROL_LEGACY_CLIENTE = "cliente";

/**
 * Roles que pueden ELEGIR el cliente de Switch de un pedido (12-ago-2026).
 *
 * Daniel, textual: *"un vendedor TIENE que elegir un cliente de switch, todos
 * siempre no solo vendedor"*. Antes el selector y su endpoint estaban gated a
 * admin+secretaria, así que el vendedor —que es quien arma el pedido— no podía
 * elegir y TODO se iba a Contado.
 *
 * La lista se DERIVA de quién puede armar pedidos (`cfg.createRoles`), para que
 * abrir el pedido a un rol nuevo no deje el selector cerrado por olvido. Lo
 * único que se saca es el 'cliente' legacy: ese camino existe para que un
 * comprador arme su propio pedido, y darle el directorio ENTERO de clientes de
 * la empresa sería una fuga — el pedido del link sigue yendo a Contado.
 */
export function clienteSwitchRoles(createRoles: readonly string[]): string[] {
  return createRoles.filter((r) => r !== ROL_LEGACY_CLIENTE);
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUIÉN VE LA LISTA DE COMPROBANTES (25-ago-2026)
//
// Daniel, textual: *"En el card donde están las marcas. Hay catálogo,
// administrar, debe de estar también pedidos para acceso directo."*
//
// El acceso directo del hub necesita saber a quién mostrárselo, y la respuesta
// NO es ninguna de las dos listas de arriba:
//   · `CATALOGO_ROLES` incluye a **bodega**, y bodega recibe **403** del feed
//     de la lista (`GET /api/catalogo/<marca>/orders`, `VIEW_ROLES`). Ponerle
//     el botón sería mandarlo a una pantalla en ceros.
//   · `CATALOGO_ADMIN_ROLES` deja afuera al **vendedor**, que es justamente
//     quien más entra a ver lo que acaba de armar (#611).
//
// Así que es su propia lista, y vale EXACTAMENTE lo que ya valía el servidor:
// admin, secretaria y vendedor. Esto no abre un permiso nuevo — le pone nombre
// al que ya existía en `orders/route.ts` y en el botón «Pedidos» del catálogo
// (`CatalogoVendedorPage`), para que las tres capas no puedan derivar.
//
// MEDIDO el 25-ago-2026 con cookies FIRMADAS, contra el handler real de
// `orders` y en las 4 marcas: admin, secretaria y vendedor → HTTP 200 con
// filas (12/12); bodega → HTTP 403 {"error":"Sin permiso"} (4/4). Abrirle la
// lista a bodega sería un permiso NUEVO, y eso lo decide Daniel.
//
// El candado `src/__tests__/lib/hub-marcas-pedidos.test.tsx` compara esta lista
// contra el literal `VIEW_ROLES` de la ruta y contra el gate del catálogo: si
// una de las tres se mueve sola, el build se pone rojo.
// ─────────────────────────────────────────────────────────────────────────────

/** Ven la lista de comprobantes de una marca (`/catalogo/<marca>/pedidos`).
 *  Mismo trío que `VIEW_ROLES` del GET de `orders`. 🔴 bodega NO está. */
export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor"] as const;

/** Copia mutable para quien reciba `string[]`. */
export const comprobantesRoles = (): string[] => [...COMPROBANTES_ROLES];
