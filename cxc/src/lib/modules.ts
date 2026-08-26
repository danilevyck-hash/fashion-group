// Catálogo único de módulos de la app. Fuente de verdad para:
//   - /home (fichas por grupo)
//   - Páginas de grupo (ruta dinámica /g/[grupo])
//   - AppHeader (drawer mobile)
//   - Sidebar (desktop persistente, acordeón: Inicio + grupos)
//
// Mantener sincronizado con src/app/api/auth/route.ts (permisos por rol)
// y src/middleware.ts (protección de rutas).
//
// REGLA: las fichas NO llevan subtítulo descriptivo. El nombre del módulo
// tiene que bastar (auditoría de textos, PR #278). No reintroducir `subtitle`.

import {
  Clock,
  CircleDollarSign,
  Truck,
  Wallet,
  Contact,
  FileText,
  HandCoins,
  AlertTriangle,
  ClipboardList,
  TrendingUp,
  ShoppingBag,
  Megaphone,
  Receipt,
  BookOpen,
  PackagePlus,
  Users,
  Briefcase,
  BarChart3,
  Settings,
  Coins,
  Building2,
  LayoutDashboard,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { asistenciaRoles } from "@/lib/asistencia/roles";

export type ModuleGroup =
  | "ventas-clientes"
  | "operacion"
  | "administracion";

export interface AppModule {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
  group: ModuleGroup;
}

export interface AppGroup {
  key: ModuleGroup;
  label: string;
  href: string;
  icon: LucideIcon;
}

// Las páginas de grupo viven en una ruta dinámica /g/[grupo] para evitar
// colisión con rutas de módulo (ej: grupo "ventas" vs módulo /ventas).
// Los slugs viejos de 6 grupos redirigen en next.config.js.
export const GROUPS: AppGroup[] = [
  { key: "ventas-clientes", label: "Ventas y clientes", href: "/g/ventas-clientes", icon: BarChart3 },
  { key: "operacion",       label: "Operación",         href: "/g/operacion",       icon: Briefcase },
  { key: "administracion",  label: "Administración",    href: "/g/administracion",  icon: Settings },
];

export const ALL_MODULES: AppModule[] = [
  // Ventas y clientes
  { key: "vista-general", label: "Vista General",      href: "/vista-general",    icon: LayoutDashboard,  roles: ["admin"],                                     group: "ventas-clientes" },
  { key: "ventas",        label: "Ventas",             href: "/ventas",           icon: TrendingUp,       roles: ["admin"],                                     group: "ventas-clientes" },
  // 🔴 COMISIONES VIVE EN «VENTAS Y CLIENTES» (25-ago-2026).
  //
  // Daniel, textual: *"Comisiones debe de estar en ventas. Y también debe de
  // verse empresa por empresa y todas las empresas."* Y al día siguiente,
  // nombrando el grupo: *"comisiones debería de estar en ventas y clientes
  // no?"*. Las dos cosas se hicieron y NO son la misma:
  //   1. La FICHA se mudó de «Operación» a este grupo — es esta línea. Va
  //      pegada a Ventas porque es su pariente más cercano: la comisión sale de
  //      la venta (`subtotal_con_descuento` de las facturas con utilidad > 20%).
  //   2. La PESTAÑA `/ventas?tab=comisiones` monta el MISMO `ComisionesView`.
  //      Es una puerta más, no un cálculo nuevo.
  //
  // 🔴 LA FICHA NO SE RETIRA Y LA `key` NO CAMBIA — las dos cosas están
  // MEDIDAS, no supuestas:
  //   · `ventas` es `roles: ["admin"]` y `/ventas/page.tsx` manda a `/home` a
  //     todo el que no sea admin. **`/comisiones` es la ÚNICA puerta de la
  //     secretaria**, que sí tiene este módulo. Sacar la ficha —o redirigir
  //     `/comisiones` a la pestaña, como se hizo con `/saldos-banco`— la
  //     dejaría sin comisiones. Ahí la mudanza fue segura porque los dos
  //     módulos tenían los MISMOS roles; acá no los tienen.
  //   · La `key` `comisiones` está en `role_permissions` y en
  //     `fg_users.modulos_override`: renombrarla rompe permisos sin comprar
  //     nada. Mismo precedente que Cheques→Recordatorios y Asistencia→Planilla.
  // Abrirle `/ventas` a la secretaria para darle la pestaña tampoco es una
  // opción: el SSR de esa página trae Resumen y Clientes EN EL HTML, así que le
  // entregaría datos que hoy no puede ver. Sería un permiso nuevo.
  //
  // ⚠️ Mover el GRUPO no mueve un centavo: `href`, `roles` e `icon` quedan
  // iguales y el cálculo vive en `comision_b2b_v5`, que ni se enteró. Lo único
  // que cambia es en qué caja del menú aparece la ficha.
  { key: "comisiones",    label: "Comisiones",         href: "/comisiones",       icon: Coins,            roles: ["admin", "secretaria"],                       group: "ventas-clientes" },
  // Referencia con ruta propia (12-ago-2026). Daniel: *"habilita referencia
  // para los vendedores y bodega"*. Nació como 5ª pestaña de /ventas y ESTA es
  // ahora la única puerta: la pestaña se retiró el mismo día (*"dejar solo la
  // del menú y quitar la pestaña de Ventas"*) y `/ventas?tab=referencia`
  // redirige acá. Vendedor/bodega NO ven el margen (*"quita margen, lo demas
  // dejalo"* — gate en /api/ventas/referencia, no en la vista).
  { key: "referencia",    label: "Referencia",         href: "/referencia",       icon: ScanSearch,       roles: ["admin", "vendedor", "bodega"],               group: "ventas-clientes" },
  { key: "cxc",           label: "Cuentas por Cobrar", href: "/admin",            icon: CircleDollarSign, roles: ["admin", "vendedor"],                         group: "ventas-clientes" },
  { key: "multifashion",  label: "Multifashion",       href: "/multifashion",     icon: ShoppingBag,      roles: ["admin", "gerente_acs"],                      group: "ventas-clientes" },
  { key: "directorio",    label: "Clientes",           href: "/clientes",         icon: Contact,          roles: ["admin", "secretaria", "vendedor"],           group: "ventas-clientes" },
  { key: "proveedores",   label: "Proveedores",        href: "/proveedores",      icon: Building2,        roles: ["admin", "contabilidad"],                     group: "ventas-clientes" },
  { key: "catalogos",     label: "Catálogos",          href: "/catalogos/marcas", icon: BookOpen,         roles: ["admin", "secretaria", "vendedor", "bodega"], group: "ventas-clientes" },

  // Operación
  { key: "guias",          label: "Guías de Despacho", href: "/guias",            icon: Truck,         roles: ["admin", "secretaria", "bodega", "vendedor"], group: "operacion" },
  { key: "packing-lists",  label: "Packing Lists",     href: "/packing-lists",    icon: ClipboardList, roles: ["admin", "secretaria", "bodega"],             group: "operacion" },
  // "Asistencia y Planilla" (13-ago-2026). Daniel, textual: *"y asistencia se
  // debe de llamar asistencia y planilla"*. El módulo ya calculaba la planilla
  // (sueldos, extras, deducciones, el Excel y el PDF que firma la contadora) y
  // el nombre solo hablaba de las marcaciones. 🔴 La `key` NO cambia: está en
  // `role_permissions` y en `fg_users.modulos_override`, y renombrarla rompería
  // los permisos sin comprar nada.
  { key: "asistencia",     label: "Asistencia y Planilla", href: "/asistencia",   icon: Clock,         roles: asistenciaRoles(),                       group: "operacion" },
  { key: "reclamos",       label: "Reclamos",          href: "/reclamos",         icon: AlertTriangle, roles: ["admin", "secretaria"],                       group: "operacion" },
  { key: "cargar",         label: "Depurador",         href: "/productos/cargar", icon: PackagePlus,   roles: ["admin", "secretaria"],                       group: "operacion" },
  { key: "marketing",      label: "Marketing",         href: "/marketing",        icon: Megaphone,     roles: ["admin", "secretaria"],                       group: "operacion" },
  { key: "caja",           label: "Caja Menuda",       href: "/caja",             icon: Wallet,        roles: ["admin", "secretaria"],                       group: "operacion" },
  // "Gastos" a secas: es el ÚNICO módulo de gastos que queda, y desde el
  // 13-ago-2026 tiene DOS pestañas — *Gastos* y *Saldos de banco*. Daniel,
  // textual: *"y debeeria estar en un solo modulo"*. La `key` sigue siendo
  // `gastos-contabilidad` a propósito — la migración y la fila de
  // role_permissions ya corrieron con ese nombre y renombrarla no compra nada.
  //
  // `saldos-banco` fue módulo suelto SOLO 2 días (#465/#467): existió para que
  // el módulo viejo "Gastos de Empresa" se pudiera retirar sin dejar a
  // Contabilidad sin el único dato que usaba. Esa mudanza terminó, así que la
  // ficha suelta se retira y el dato vive como pestaña. `/saldos-banco`
  // redirige en next.config.js.
  { key: "gastos-contabilidad", label: "Gastos",         href: "/gastos-contabilidad", icon: Receipt,   roles: ["admin", "contabilidad"],                     group: "operacion" },
  { key: "prestamos",      label: "Préstamos",         href: "/prestamos",        icon: HandCoins,     roles: ["admin", "contabilidad"],                     group: "operacion" },
  // 🔴 La `key` sigue siendo `cheques` y NO puede cambiar: está en
  // `role_permissions` y en `fg_users.modulos_override`, así que renombrarla
  // rompe permisos y overrides sin comprar nada. Lo único que cambió es el LABEL
  // (24-ago-2026): adentro conviven los cheques por depositar —intactos— y los
  // recordatorios sueltos. Misma decisión que "Asistencia y Planilla".
  { key: "cheques",        label: "Recordatorios",     href: "/cheques",          icon: FileText,      roles: ["admin", "secretaria"],                       group: "operacion" },

  // Administración
  //
  // 🔴 UN SOLO MÓDULO, Y EL GRUPO SE QUEDA (13-ago-2026). "Data Health" dejó de
  // ser una ficha suelta y pasó a ser la 2ª PESTAÑA de Usuarios
  // (`/admin/usuarios?tab=data-health`; la dirección vieja redirige en
  // next.config.js). No se perdió nada: la pantalla es la misma, movida.
  //
  // Por qué el grupo NO se disuelve mudando Usuarios a "Operación":
  //   · "Administración" es admin-only — el único que lo ve es Daniel. Mudarlo a
  //     Operación metería un módulo suyo entre los 13 que usan todos los días
  //     secretaria/bodega/vendedor/contabilidad: no lo acerca, lo entierra.
  //   · Borrar el grupo rompe `/g/administracion` (y encadena el redirect viejo
  //     `/g/sistema` a una URL muerta) — un segundo marcador roto en el mismo PR,
  //     justo lo contrario de la regla de que la dirección vieja siga andando.
  //   · Lo que se pidió fue MENOS MÓDULOS en el menú, y eso ya está: el grupo
  //     pasa de 2 fichas a 1.
  // El auto-redirect de "rol con un solo módulo" NO se toca: cuenta MÓDULOS
  // VISIBLES, no grupos, y admin está exento (`if (role === "admin") return`).
  { key: "usuarios",    label: "Usuarios",    href: "/admin/usuarios",    icon: Users,       roles: ["admin"], group: "administracion" },
];

/** Lista de keys de todos los módulos del sistema. */
export const ALL_MODULE_KEYS: string[] = ALL_MODULES.map(m => m.key);

/** Roles del sistema. Fuente de verdad para validación server-side de `role`
 *  (antes vivía solo en el endpoint /api/admin/usuarios, ya retirado). */
export const SYSTEM_ROLES: { key: string; label: string }[] = [
  { key: "admin", label: "Administrador" },
  { key: "contabilidad", label: "Contabilidad" },
  { key: "secretaria", label: "Secretaria" },
  { key: "bodega", label: "Bodega" },
  { key: "vendedor", label: "Vendedor" },
  // Gerente de American Classic: SOLO Multifashion. Sus módulos salen de
  // role_permissions (fila gerente_acs) como los demás roles; el roles[] del
  // módulo arriba es el fallback si la tabla no responde.
  { key: "gerente_acs", label: "Gerente ACS" },
];

/** Lista de keys de todos los roles del sistema. */
export const SYSTEM_ROLE_KEYS: string[] = SYSTEM_ROLES.map(r => r.key);

/** Devuelve los módulos por defecto para un rol, derivado de `roles[]` por módulo.
 *  Admin recibe todo. Para otros roles, retorna las keys de los módulos cuyo
 *  `roles[]` incluye ese rol. Esta es la única fuente de verdad para defaults
 *  cuando role_permissions no responde. */
export function getDefaultModulesForRole(role: string): string[] {
  if (role === "admin") return ALL_MODULE_KEYS;
  return ALL_MODULES.filter(m => m.roles.includes(role)).map(m => m.key);
}

/** Un módulo que SE MUDÓ de casa hereda el permiso del módulo del que salió,
 *  mientras la DDL que agrega su key a `role_permissions` no haya corrido.
 *
 *  🩸 POR QUÉ EXISTE: `role_permissions.contabilidad.modulos` es una lista de
 *  keys guardada en la base, y el login la copia a `fg_modules`. Un módulo
 *  NUEVO no está en esa lista, así que su ficha NO aparece en el menú de
 *  contabilidad hasta que alguien corra la migración a mano. Y las 52 filas de
 *  `bancos_saldos` las carga justamente **contabilidad** (`created_by` =
 *  "Contabilidad" en las 52), no admin: sin esto, el día que se retire
 *  "Gastos de Empresa" la persona que carga los saldos se queda sin ninguna
 *  puerta al dato. Este repo tiene DDLs pendientes de correr desde hace
 *  semanas — la pantalla tiene que funcionar ANTES de que corra, como el resto.
 *
 *  Se retira cuando la DDL esté corrida (verificable en `role_permissions`), o
 *  cuando el módulo prestado deja de existir. Quitarlo antes se ve exactamente
 *  igual que "a contabilidad le desapareció un módulo".
 *
 *  ✅ RETIRADA la entrada `"saldos-banco": "gastos-empresa"` (13-ago-2026), y
 *  se retira por las DOS razones a la vez, no por una:
 *    1. `saldos-banco` YA NO ES UN MÓDULO — es una pestaña de "Gastos", así que
 *       no hay ficha que encender y la entrada quedaba zombi (`fgModulesIncluye`
 *       solo se pregunta por módulos del catálogo).
 *    2. La puerta al dato es ahora `gastos-contabilidad`, y contabilidad la
 *       tiene POR DERECHO PROPIO. Medido en producción el 13-ago-2026:
 *       `role_permissions.contabilidad.modulos` =
 *       ["asistencia","gastos-empresa","prestamos","proveedores","ventas",
 *        "saldos-banco","gastos-contabilidad"]. O sea que ni siquiera hacía
 *       falta la herencia para el caso que la justificaba.
 *    (`gastos-empresa` y `saldos-banco` quedan ahí como keys INERTES: no están
 *     en ALL_MODULES, así que no pintan nada. Las barre la migración
 *     20260813140000, que NO es bloqueante.) */
export const MODULO_HEREDA_PERMISO_DE: Record<string, string> = {
  // Referencia para vendedor/bodega (12-ago-2026): mientras la DDL
  // 20260812120000 no corra, la ficha se enciende para quien ya tiene
  // `catalogos` — que es el módulo que TODOS los roles destino tienen. El
  // candado de a QUIÉN alcanza la herencia es el `roles[]` del módulo (ver
  // `fgModulesIncluye`): secretaria también tiene catalogos y NO debe ver una
  // ficha que la página le rebota.
  "referencia": "catalogos",
};

/** ¿La lista de módulos guardada le da acceso a este módulo? Directo, o
 *  heredado del módulo del que éste salió.
 *
 *  🔴 LA HERENCIA ES VISIBILIDAD PRESTADA Y SOLO VALE PARA ROLES QUE EL MÓDULO
 *  DECLARA en su `roles[]`. El permiso DIRECTO (la key en fg_modules) sigue
 *  mandando sin mirar roles — es lo que un admin asignó a mano. Sin este
 *  recorte, "referencia hereda de catalogos" le pintaría la ficha a secretaria
 *  (que tiene catalogos), y una ficha que la página rebota es peor que
 *  ninguna. */
function fgModulesIncluye(fgModules: string[], modulo: AppModule, role: string): boolean {
  if (fgModules.includes(modulo.key)) return true;
  const heredaDe = MODULO_HEREDA_PERMISO_DE[modulo.key];
  return heredaDe ? fgModules.includes(heredaDe) && modulo.roles.includes(role) : false;
}

/** Filtra módulos visibles para un rol. Si hay fgModules (permisos custom),
 *  prevalece sobre el default por rol. */
export function getVisibleModules(role: string, fgModules?: string[] | null): AppModule[] {
  if (role === "admin") return ALL_MODULES;
  if (fgModules && fgModules.length > 0) {
    return ALL_MODULES.filter(m => fgModulesIncluye(fgModules, m, role));
  }
  return ALL_MODULES.filter(m => m.roles.includes(role));
}

/** Filtra los grupos visibles: solo aparecen los grupos que tienen al menos
 *  un módulo visible para el rol. */
export function getVisibleGroups(role: string, fgModules?: string[] | null): AppGroup[] {
  const visible = getVisibleModules(role, fgModules);
  const seen = new Set(visible.map(m => m.group));
  return GROUPS.filter(g => seen.has(g.key));
}

/** Módulos visibles dentro de un grupo dado. */
export function getModulesInGroup(group: ModuleGroup, role: string, fgModules?: string[] | null): AppModule[] {
  return getVisibleModules(role, fgModules).filter(m => m.group === group);
}

export const GROUP_ORDER: ModuleGroup[] = ["ventas-clientes", "operacion", "administracion"];
export const GROUP_LABELS: Record<ModuleGroup, { title: string }> = {
  "ventas-clientes": { title: "Ventas y clientes" },
  operacion:         { title: "Operación" },
  administracion:    { title: "Administración" },
};
