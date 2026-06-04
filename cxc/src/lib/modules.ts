// Catálogo único de módulos de la app. Fuente de verdad para:
//   - /home (4 cards de grupos)
//   - Páginas de grupo (/operaciones, /reportes, /catalogos, /sistema)
//   - AppHeader (drawer mobile)
//   - Sidebar (desktop persistente, 5 items: Inicio + 4 grupos)
//
// Mantener sincronizado con src/app/api/auth/route.ts (permisos por rol)
// y src/middleware.ts (protección de rutas).

import {
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
  BookOpen,
  Shirt,
  Users,
  Briefcase,
  BarChart3,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type ModuleGroup = "operaciones" | "reportes" | "catalogos" | "sistema";

export interface AppModule {
  key: string;
  label: string;
  subtitle?: string;
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

export const GROUPS: AppGroup[] = [
  { key: "operaciones", label: "Operaciones", href: "/operaciones", icon: Briefcase },
  { key: "reportes",    label: "Reportes",    href: "/reportes",    icon: BarChart3 },
  { key: "catalogos",   label: "Catálogos",   href: "/catalogos",   icon: BookOpen },
  { key: "sistema",     label: "Sistema",     href: "/sistema",     icon: Settings },
];

export const ALL_MODULES: AppModule[] = [
  // Operaciones
  { key: "guias",         label: "Guías de Despacho",   subtitle: "Crear y rastrear envíos",                            href: "/guias",          icon: Truck,            roles: ["admin", "secretaria", "bodega", "vendedor"],       group: "operaciones" },
  { key: "cheques",       label: "Cheques",             subtitle: "Control de cheques por cobrar",                      href: "/cheques",        icon: FileText,         roles: ["admin", "secretaria"],                             group: "operaciones" },
  { key: "reclamos",      label: "Reclamos",            subtitle: "Reportar y dar seguimiento",                         href: "/reclamos",       icon: AlertTriangle,    roles: ["admin", "secretaria"],                             group: "operaciones" },
  { key: "packing-lists", label: "Packing Lists",       subtitle: "Índices de bultos por estilo",                       href: "/packing-lists",  icon: ClipboardList,    roles: ["admin", "secretaria", "bodega"],                   group: "operaciones" },
  { key: "caja",          label: "Caja Menuda",         subtitle: "Registrar gastos del día a día",                     href: "/caja",           icon: Wallet,           roles: ["admin", "secretaria"],                             group: "operaciones" },

  // Reportes
  { key: "cxc",           label: "Cuentas por Cobrar",  subtitle: "Quién debe, cuánto y desde cuándo",                  href: "/admin",          icon: CircleDollarSign, roles: ["admin", "vendedor"],                               group: "reportes" },
  { key: "ventas",        label: "Ventas",              subtitle: "Ver por mes y comparar períodos",                    href: "/ventas",         icon: TrendingUp,       roles: ["admin"],                                           group: "reportes" },
  { key: "multifashion",  label: "Multifashion",        subtitle: "Retail tienda física · vendedoras y clientes",       href: "/multifashion",   icon: ShoppingBag,      roles: ["admin"],                                                       group: "reportes" },
  { key: "marketing",     label: "Marketing",           subtitle: "Gastos compartidos a marcas (Tommy, Calvin, Reebok)",href: "/marketing",      icon: Megaphone,        roles: ["admin", "secretaria"],                             group: "reportes" },
  { key: "prestamos",     label: "Préstamos",           subtitle: "Adelantos y deducciones de empleados",               href: "/prestamos",      icon: HandCoins,        roles: ["admin", "contabilidad"],                           group: "reportes" },
  { key: "directorio",    label: "Clientes",            subtitle: "Datos fiscales, contacto y CXC actual",              href: "/clientes",       icon: Contact,          roles: ["admin", "secretaria", "vendedor", "bodega"],       group: "reportes" },

  // Catálogos
  { key: "catalogos",     label: "Catálogos",           subtitle: "Reebok, Joybees",                                    href: "/catalogos/marcas",icon: BookOpen,        roles: ["admin", "secretaria", "vendedor", "bodega"],       group: "catalogos" },
  { key: "camisetas",     label: "Camisetas Selección", subtitle: "Pedidos y stock",                                    href: "/camisetas",      icon: Shirt,            roles: ["admin", "vendedor"],                               group: "catalogos" },

  // Sistema
  // "Actualizar Datos" (upload manual de CSV) OCULTO — deprecado. El sync de
  // Switch API ya cubre la carga. La página /upload y los endpoints
  // (/api/cxc/upload, /api/ventas/upload) siguen VIVOS y accesibles por URL
  // directa (admin/secretaria pasan vía allowedRoles en useAuth, no por esta
  // lista). Solo se esconde la entrada visual para que nadie suba CSV por error.
  // { key: "upload",        label: "Actualizar Datos",    subtitle: "Subir archivos de Switch Soft",                      href: "/upload",         icon: RefreshCw,        roles: ["admin", "secretaria"],                             group: "sistema" },
  { key: "usuarios",      label: "Usuarios",            subtitle: "Gestión de usuarios y permisos",                     href: "/admin/usuarios", icon: Users,            roles: ["admin"],                                                       group: "sistema" },
  { key: "data-health",   label: "Data Health",         subtitle: "Monitoreo automático de integridad de datos",        href: "/admin/data-health", icon: ShieldCheck,   roles: ["admin"],                                                       group: "sistema" },
];

/** Lista de keys de todos los módulos del sistema. */
export const ALL_MODULE_KEYS: string[] = ALL_MODULES.map(m => m.key);

/** Devuelve los módulos por defecto para un rol, derivado de `roles[]` por módulo.
 *  Admin recibe todo. Para otros roles, retorna las keys de los módulos cuyo
 *  `roles[]` incluye ese rol. Esta es la única fuente de verdad para defaults
 *  cuando role_permissions no responde. */
export function getDefaultModulesForRole(role: string): string[] {
  if (role === "admin") return ALL_MODULE_KEYS;
  return ALL_MODULES.filter(m => m.roles.includes(role)).map(m => m.key);
}

/** Filtra módulos visibles para un rol. Si hay fgModules (permisos custom),
 *  prevalece sobre el default por rol. */
export function getVisibleModules(role: string, fgModules?: string[] | null): AppModule[] {
  if (role === "admin") return ALL_MODULES;
  if (fgModules && fgModules.length > 0) {
    return ALL_MODULES.filter(m => fgModules.includes(m.key));
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

export const GROUP_ORDER: ModuleGroup[] = ["operaciones", "reportes", "catalogos", "sistema"];
export const GROUP_LABELS: Record<ModuleGroup, { title: string; description: string }> = {
  operaciones: { title: "Operaciones", description: "Lo que usas todos los días" },
  reportes:    { title: "Reportes",    description: "Información cuando la necesites" },
  catalogos:   { title: "Catálogos",   description: "Productos y pedidos" },
  sistema:     { title: "Sistema",     description: "Configuración y administración" },
};
