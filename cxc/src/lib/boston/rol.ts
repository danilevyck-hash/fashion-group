// ─────────────────────────────────────────────────────────────────────────────
// EL ROL DE DAVID — `gerente_boston`. FUENTE ÚNICA.
//
// ═══ LA REGLA, textual (Daniel, 27-ago-2026) ═════════════════════════════════
//
//   *"si crea el usuario david, david debe de ver cxc boston… el es mi hermano
//    y ve toda la operacion de confecciones boston, **no quiero que vea info de
//    fashion group**"*
//
// 🔴 ES EL ESPEJO DE LA REGLA QUE YA EXISTE, Y HAY QUE LEER LAS DOS JUNTAS.
//
//   · La de siempre (§ CLAUDE.md, 12-ago): **Boston no se mezcla con el grupo**.
//     Se cierra en la vista `switch_estadocuenta_aging`, una sola vez, y la
//     vigilan los dos barridos de `cxc-boston-fuera-de-toda-superficie.test.ts`.
//   · La nueva, la de este archivo: **quien ve Boston no ve el grupo**.
//
// Son direcciones opuestas del mismo tabique y NINGUNA reemplaza a la otra:
// la primera protege la PLATA del grupo de las filas de Boston; ésta protege a
// Boston de VER la plata del grupo. Un cambio que "arregle" una rompiendo la
// otra no es un arreglo.
//
// ═══ POR QUÉ EL MOLDE ES `gerente_acs` Y NO ALGO NUEVO ═══════════════════════
//
// Jennifer (`gerente_acs`) ya resolvió este problema exacto: un rol con UN solo
// módulo, auto-redirigido ahí desde `/home`, y con 403 en las rutas de todos
// los demás. No se inventa un mecanismo nuevo — se copia el que ya está probado
// y tiene candado (`multifashion-acceso.test.ts`). El candado gemelo de este
// archivo es `src/__tests__/lib/boston-acceso.test.ts`.
//
// 🔑 Y por eso el permiso vive UNA vez, acá. La lección de `boston-roles.ts` es
// literal: la lista de roles que vivía adentro de un route y la copia que la UI
// no miraba dejaron a los 3 vendedores tocando una pestaña que siempre les
// contestaba 403. Lo que este archivo dice lo leen la navegación, las rutas y
// la pantalla — no hay una segunda lista en ningún lado.
// ─────────────────────────────────────────────────────────────────────────────

/** El rol de David. Es el ÚNICO rol de Confecciones Boston. */
export const ROL_BOSTON = "gerente_boston" as const;

/** La empresa. NO es un parámetro y no viaja por la URL: el módulo ES Boston.
 *  Mismo criterio que Multifashion, que ES `american_classic` y no acepta
 *  `?empresa=` en ninguna de sus 11 rutas. */
export const EMPRESA_BOSTON = "confecciones_boston" as const;

/** La key del módulo en `role_permissions` / `fg_users.modulos_override`. */
export const MODULO_BOSTON = "boston" as const;

/**
 * Quién entra al módulo Boston. `admin` está explícito porque la NAVEGACIÓN no
 * pasa por `requireRole` (que lo deja pasar siempre): sin nombrarlo acá, el
 * dueño se quedaría sin la ficha.
 */
export const ROLES_MODULO_BOSTON = ["admin", ROL_BOSTON] as const;

/** Copia mutable para las APIs que reciben `string[]` (requireRole). */
export const rolesModuloBoston = (): string[] => [...ROLES_MODULO_BOSTON];

/** ¿Este rol es el de David? */
export function esGerenteBoston(rol: string | null | undefined): boolean {
  return rol === ROL_BOSTON;
}

/** ¿Este rol puede abrir el módulo Boston? */
export function puedeVerModuloBoston(rol: string | null | undefined): boolean {
  return typeof rol === "string" && (ROLES_MODULO_BOSTON as readonly string[]).includes(rol);
}

// ═════════════════════════════════════════════════════════════════════════════
// 🔴 LA PREGUNTA QUE DANIEL TODAVÍA NO CONTESTÓ — Y POR ESO ES UNA LÍNEA
// ═════════════════════════════════════════════════════════════════════════════
//
// ¿David ve los SUELDOS de las 21 personas de la planilla de Boston?
//
// **Por defecto NO**, que es el default seguro: mostrar de más un sueldo no se
// puede deshacer. El día que Daniel diga que sí, el cambio es ESTA LÍNEA y nada
// más — no hay una segunda pantalla que tocar, ni un filtro repartido por las
// consultas, ni una columna que esconder en el navegador.
//
// 🔑 EL RECORTE VA EN EL SERVIDOR, y eso es lo que hace que la línea alcance.
// Es la misma decisión —y el mismo mecanismo— que ya tomó `soloApruebaRoles()`
// para el usuario `bodega` (Julio Garay aprueba horas extra y la ruta le
// contesta SIN el bloque de dinero): esconder la columna en la pantalla dejaría
// el sueldo viajando en el JSON, a un "ver código fuente" de distancia.
//
// ⚠️ Ver los sueldos NO es un módulo nuevo ni una pestaña nueva: David ve la
// MISMA planilla de Boston con o sin la línea. Lo único que cambia es si el
// bloque `dinero` de cada fila —y el cuadro `totales`— viajan o no.
export const VE_SUELDOS_DE_BOSTON = false;

/**
 * ¿A este rol la planilla le contesta SIN el bloque de dinero?
 *
 * Se DERIVA de la línea de arriba en vez de escribirse aparte: una segunda
 * condición que hubiera que acordarse de tocar es exactamente el bug que
 * `soloApruebaRoles()` vino a matar en el módulo de Asistencia.
 */
export function planillaSinDinero(rol: string | null | undefined): boolean {
  return esGerenteBoston(rol) && !VE_SUELDOS_DE_BOSTON;
}

// ═════════════════════════════════════════════════════════════════════════════
// LAS PESTAÑAS DEL MÓDULO
// ═════════════════════════════════════════════════════════════════════════════
//
// La lista que Daniel aprobó: **CXC · Planilla · Préstamos (TODOS) · Inicio de
// Boston · Ventas de Boston · Clientes · Catálogos**, sin guías.
//
// ✅ **Catálogos SE ABRIÓ el 27-ago-2026, y NO como pestaña: como MÓDULO.**
//
// Daniel, textual: ***«catalogo para david si, solo eso»***. El #659 lo había
// dejado afuera con un motivo bueno —las 4 marcas (Reebok, Joybees, Tommy,
// Calvin) son de `active_shoes`, `joystep`, `fashion_shoes` y `vistana`, o sea
// CUATRO EMPRESAS DE FASHION GROUP, y no existe un catálogo de Confecciones
// Boston— y le pasó la decisión. **Él decidió que sí, sabiendo eso.**
//
// 🔴 **PERO SIGUE SIN SER UNA PESTAÑA DE `/boston`, y la lista de abajo no se
// tocó.** Las 6 pestañas son de Confecciones Boston; el catálogo es del grupo.
// Meterlo acá diría que es parte de su empresa, que es falso. Vive donde vive
// para todo el mundo: su ficha en el menú (`modules.ts`) y `/catalogos/marcas`.
//
// 🔑 **Lo que se le abrió es SOLO VER** (`CATALOGO_ROLES` en
// `lib/catalogo/roles.ts`, que DERIVA el rol de este archivo). NO administrar,
// NO la lista de comprobantes y NO armar pedidos: los pedidos de esas 4 marcas
// traen el cliente y el monto de cada venta del grupo. El detalle, ruta por
// ruta, está en el encabezado de `roles.ts`.
export const PESTANAS_BOSTON = [
  { key: "inicio", label: "Inicio" },
  { key: "cxc", label: "Por cobrar" },
  { key: "ventas", label: "Ventas" },
  { key: "clientes", label: "Clientes" },
  { key: "planilla", label: "Planilla" },
  { key: "prestamos", label: "Préstamos" },
] as const;

export type TabBoston = (typeof PESTANAS_BOSTON)[number]["key"];

const KEYS_TAB = new Set<string>(PESTANAS_BOSTON.map((p) => p.key));

/**
 * La pestaña pedida, ya validada. Cualquier basura cae a "inicio".
 *
 * 🔴 La pestaña vive en la URL (`?tab=…`), así que un marcador viejo o un link
 * compartido puede traer cualquier cosa. Mismo criterio que `tabCxcPermitida`.
 */
export function tabBostonValida(valor: string | null | undefined): TabBoston {
  return typeof valor === "string" && KEYS_TAB.has(valor) ? (valor as TabBoston) : "inicio";
}
