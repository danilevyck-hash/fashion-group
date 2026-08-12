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
  Landmark,
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
  ShieldCheck,
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
  { key: "asistencia",     label: "Asistencia",        href: "/asistencia",       icon: Clock,         roles: asistenciaRoles(),                       group: "operacion" },
  { key: "reclamos",       label: "Reclamos",          href: "/reclamos",         icon: AlertTriangle, roles: ["admin", "secretaria"],                       group: "operacion" },
  { key: "cargar",         label: "Depurador",         href: "/productos/cargar", icon: PackagePlus,   roles: ["admin", "secretaria"],                       group: "operacion" },
  { key: "comisiones",     label: "Comisiones",        href: "/comisiones",       icon: Coins,         roles: ["admin", "secretaria"],                       group: "operacion" },
  { key: "marketing",      label: "Marketing",         href: "/marketing",        icon: Megaphone,     roles: ["admin", "secretaria"],                       group: "operacion" },
  { key: "caja",           label: "Caja Menuda",       href: "/caja",             icon: Wallet,        roles: ["admin", "secretaria"],                       group: "operacion" },
  // "Gastos" a secas: es el ÚNICO módulo de gastos que queda. La `key` sigue
  // siendo `gastos-contabilidad` a propósito — la migración y la fila de
  // role_permissions ya corrieron con ese nombre y renombrarla no compra nada.
  { key: "gastos-contabilidad", label: "Gastos",         href: "/gastos-contabilidad", icon: Receipt,   roles: ["admin", "contabilidad"],                     group: "operacion" },
  { key: "saldos-banco",   label: "Saldos de Banco",   href: "/saldos-banco",     icon: Landmark,      roles: ["admin", "contabilidad"],                     group: "operacion" },
  { key: "prestamos",      label: "Préstamos",         href: "/prestamos",        icon: HandCoins,     roles: ["admin", "contabilidad"],                     group: "operacion" },
  { key: "cheques",        label: "Cheques",           href: "/cheques",          icon: FileText,      roles: ["admin", "secretaria"],                       group: "operacion" },

  // Administración
  { key: "usuarios",    label: "Usuarios",    href: "/admin/usuarios",    icon: Users,       roles: ["admin"], group: "administracion" },
  { key: "data-health", label: "Data Health", href: "/admin/data-health", icon: ShieldCheck, roles: ["admin"], group: "administracion" },
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
 *  Se retira cuando la DDL esté corrida (verificable: `role_permissions` de
 *  contabilidad contiene 'saldos-banco'). Quitarlo antes se ve exactamente
 *  igual que "a contabilidad le desapareció un módulo". */
export const MODULO_HEREDA_PERMISO_DE: Record<string, string> = {
  // Los saldos de banco eran una sección de "Gastos de Empresa", que ya se
  // retiró. La key vieja SIGUE en `role_permissions.contabilidad.modulos`
  // mientras nadie corra la migración, así que la herencia es justamente lo
  // que hace que retirar el módulo NO le apague el menú a quien carga los
  // saldos. Se quita cuando la DDL esté corrida y verificada.
  "saldos-banco": "gastos-empresa",
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
 *  ninguna. Para `saldos-banco` no cambia nada: contabilidad está en su
 *  `roles[]`. */
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
