// Catálogo único de módulos de la app. Fuente de verdad para:
//   - /home (cards de grupos)
//   - Páginas de grupo (ruta dinámica /g/[grupo])
//   - AppHeader (drawer mobile)
//   - Sidebar (desktop persistente, acordeón: Inicio + grupos)
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
  Users,
  Briefcase,
  BarChart3,
  Settings,
  ShieldCheck,
  Coins,
  type LucideIcon,
} from "lucide-react";

export type ModuleGroup = "finanzas" | "ventas" | "operacion" | "productos" | "sistema";

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

// Las páginas de grupo viven en una ruta dinámica /g/[grupo] para evitar
// colisión con rutas de módulo (ej: grupo "ventas" vs módulo /ventas).
export const GROUPS: AppGroup[] = [
  { key: "finanzas",  label: "Finanzas",  href: "/g/finanzas",  icon: Wallet },
  { key: "ventas",    label: "Ventas",    href: "/g/ventas",    icon: BarChart3 },
  { key: "operacion", label: "Operación", href: "/g/operacion", icon: Briefcase },
  { key: "productos", label: "Productos", href: "/g/productos", icon: ShoppingBag },
  { key: "sistema",   label: "Sistema",   href: "/g/sistema",   icon: Settings },
];

export const ALL_MODULES: AppModule[] = [
  // Finanzas
  { key: "comisiones",    label: "Comisiones",          subtitle: "Comisión por vendedor (venta y cobro)",              href: "/comisiones",     icon: Coins,            roles: ["admin", "secretaria"],                             group: "finanzas" },
  { key: "cheques",       label: "Cheques",             subtitle: "Control de cheques por cobrar",                      href: "/cheques",        icon: FileText,         roles: ["admin", "secretaria"],                             group: "finanzas" },
  { key: "prestamos",     label: "Préstamos",           subtitle: "Adelantos y deducciones de empleados",               href: "/prestamos",      icon: HandCoins,        roles: ["admin", "contabilidad"],                           group: "finanzas" },
  { key: "caja",          label: "Caja Menuda",         subtitle: "Registrar gastos del día a día",                     href: "/caja",           icon: Wallet,           roles: ["admin", "secretaria"],                             group: "finanzas" },

  // Ventas
  { key: "ventas",        label: "Ventas",              subtitle: "Ver por mes y comparar períodos",                    href: "/ventas",         icon: TrendingUp,       roles: ["admin"],                                           group: "ventas" },
  { key: "cxc",           label: "Cuentas por Cobrar",  subtitle: "Quién debe, cuánto y desde cuándo",                  href: "/admin",          icon: CircleDollarSign, roles: ["admin", "vendedor"],                               group: "ventas" },
  { key: "multifashion",  label: "Multifashion",        subtitle: "Retail tienda física · vendedoras y clientes",       href: "/multifashion",   icon: ShoppingBag,      roles: ["admin"],                                           group: "ventas" },
  { key: "marketing",     label: "Marketing",           subtitle: "Gastos compartidos a marcas (Tommy, Calvin, Reebok)",href: "/marketing",      icon: Megaphone,        roles: ["admin", "secretaria"],                             group: "ventas" },
  { key: "directorio",    label: "Clientes",            subtitle: "Datos fiscales, contacto y CXC actual",              href: "/clientes",       icon: Contact,          roles: ["admin", "secretaria", "vendedor"],                 group: "ventas" },

  // Operación
  { key: "guias",         label: "Guías de Despacho",   subtitle: "Crear y rastrear envíos",                            href: "/guias",          icon: Truck,            roles: ["admin", "secretaria", "bodega", "vendedor"],       group: "operacion" },
  { key: "packing-lists", label: "Packing Lists",       subtitle: "Índices de bultos por estilo",                       href: "/packing-lists",  icon: ClipboardList,    roles: ["admin", "secretaria", "bodega"],                   group: "operacion" },
  { key: "reclamos",      label: "Reclamos",            subtitle: "Reportar y dar seguimiento",                         href: "/reclamos",       icon: AlertTriangle,    roles: ["admin", "secretaria"],                             group: "operacion" },

  // Productos
  { key: "catalogos",     label: "Catálogos",           subtitle: "Reebok, Joybees",                                    href: "/catalogos/marcas",icon: BookOpen,        roles: ["admin", "secretaria", "vendedor", "bodega"],       group: "productos" },

  // Sistema
  { key: "usuarios",      label: "Usuarios",            subtitle: "Gestión de usuarios y permisos",                     href: "/admin/usuarios", icon: Users,            roles: ["admin"],                                           group: "sistema" },
  { key: "data-health",   label: "Data Health",         subtitle: "Monitoreo automático de integridad de datos",        href: "/admin/data-health", icon: ShieldCheck,   roles: ["admin"],                                           group: "sistema" },
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

export const GROUP_ORDER: ModuleGroup[] = ["finanzas", "ventas", "operacion", "productos", "sistema"];
export const GROUP_LABELS: Record<ModuleGroup, { title: string; description: string }> = {
  finanzas:  { title: "Finanzas",  description: "Cobros, pagos y gastos del grupo" },
  ventas:    { title: "Ventas",    description: "Ventas, cuentas por cobrar y clientes" },
  operacion: { title: "Operación", description: "Despachos, bultos y reclamos" },
  productos: { title: "Productos", description: "Catálogos y pedidos" },
  sistema:   { title: "Sistema",   description: "Configuración y administración" },
};
