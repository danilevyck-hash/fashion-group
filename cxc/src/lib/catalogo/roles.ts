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
// 🔴 QUIÉN VE LA LISTA DE COMPROBANTES — BODEGA ENTRÓ (25-ago-2026)
//
// Daniel, textual: ***"Dale acceso a bodega a la lista de pedidos."***
//
// ### Este bloque CAMBIÓ DE DIRECCIÓN, no se borró
//
// Hasta hoy decía lo contrario, y con razón: bodega recibía **403** del feed
// (`GET /api/catalogo/<marca>/orders`), así que ponerle el botón «Pedidos»
// habría sido mandarlo a una pantalla en ceros — y **abrirle la lista era un
// permiso NUEVO, y eso lo decide Daniel**. Daniel lo decidió. Lo que se movió
// es la decisión suya, no el mecanismo: la lista sigue siendo UNA, las tres
// capas se siguen derivando de acá, y **ninguna acción de escritura cambió de
// mano**.
//
// ### 🔴 BODEGA SOLO MIRA — y por eso hay DOS listas, no una
//
// `COMPROBANTES_ROLES`        → VER la lista.       admin · secretaria · vendedor · **bodega**
// `COMPROBANTES_EDITAR_ROLES` → TRABAJAR el pedido. admin · secretaria · vendedor (bodega **no**)
//
// La segunda existe porque la pantalla ofrecía «Editar» y «Duplicar» en TODAS
// las filas: para bodega serían **dos botones muertos** (`PUT /orders/<id>` →
// `EDIT_ROLES`; `POST /pedidos-publicos/<id>/convertir` y `POST /orders` →
// 403). Un botón que muere en 403 es peor que no tenerlo: hace creer que se
// perdió el trabajo. A bodega la fila le dice **«Ver»** y la abre en el detalle
// de SOLO LECTURA que `PedidoDetalleClient` ya sabía dibujar (`isEditorRole`,
// que existe desde antes y no se tocó); si la fila es un pedido del LINK sin
// convertir, se abre la vista pública —que es lo que esa fila ES— en vez de
// llamar a `convertir`, que le respondería 403.
//
// ### Lo que sigue cerrado, y se midió que sigue cerrado
//
// Borrar (individual y masivo) · exportar a Excel · mandar a Switch · editar ·
// duplicar · crear · `/catalogos/admin/**` (`CATALOGO_ADMIN_ROLES` NO se tocó:
// sigue siendo admin + secretaria) · `pedidos-unificado`.
//
// **MEDIDO el 25-ago-2026 con cookies FIRMADAS, contra los handlers REALES y en
// las 4 marcas:** bodega → **200 con filas** en el GET de `orders` (4/4, era
// 403) y **403 en las 10 rutas de escritura** (40/40); admin/secretaria/
// vendedor → 200 (12/12, sin cambio); sin cookie → 401. Los 403 prueban algo:
// las mismas rutas dejan entrar a admin.
//
// El candado `src/__tests__/lib/hub-marcas-pedidos.test.tsx` compara estas
// listas contra lo que hace el servidor y contra el gate del catálogo: si una
// de las tres se mueve sola, el build se pone rojo.
// ─────────────────────────────────────────────────────────────────────────────

/** Ven la lista de comprobantes de una marca (`/catalogo/<marca>/pedidos`).
 *  🔴 bodega SÍ está desde el 25-ago-2026 — **solo para mirar**. */
export const COMPROBANTES_ROLES = ["admin", "secretaria", "vendedor", "bodega"] as const;

/** Copia mutable para quien reciba `string[]`. */
export const comprobantesRoles = (): string[] => [...COMPROBANTES_ROLES];

/** TRABAJAN un comprobante desde la lista: «Editar» y «Duplicar». Es el mismo
 *  trío que ya aceptaban `EDIT_ROLES` de `orders/[id]`, el `convertir` de un
 *  pedido del link y el POST de `orders` — 🔴 bodega NO está, y su ausencia acá
 *  es lo que evita ofrecerle un botón que muere en 403. */
export const COMPROBANTES_EDITAR_ROLES = ["admin", "secretaria", "vendedor"] as const;

/** Copia mutable para quien reciba `string[]`. */
export const comprobantesEditarRoles = (): string[] => [...COMPROBANTES_EDITAR_ROLES];
