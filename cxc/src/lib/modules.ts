// Catálogo único de módulos de la app. Fuente de verdad para:
//   - /home (grid de tarjetas con drag-drop + orden por rol)
//   - AppHeader (drawer mobile)
//   - Sidebar (desktop persistente)
//
// Mantener sincronizado con src/app/api/auth/route.ts (permisos por rol)
// y src/middleware.ts (protección de rutas).

import {
  CircleDollarSign,
  RefreshCw,
  Truck,
  Wallet,
  Contact,
  FileText,
  HandCoins,
  AlertTriangle,
  ClipboardList,
  TrendingUp,
  Megaphone,
  BookOpen,
  Shirt,
  type LucideIcon,
} from "lucide-react";

export type ModuleGroup = "dia" | "consulta" | "catalogo" | "admin";

export interface AppModule {
  key: string;
  label: string;
  subtitle?: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
  group: ModuleGroup;
}

export const ALL_MODULES: AppModule[] = [
  { key: "cxc",           label: "Cuentas por Cobrar",  subtitle: "Quién debe, cuánto y desde cuándo", href: "/admin",          icon: CircleDollarSign, roles: ["admin", "secretaria", "director", "vendedor"],                 group: "dia" },
  { key: "upload",        label: "Actualizar Datos",    subtitle: "Subir archivos de Switch Soft",     href: "/upload",         icon: RefreshCw,        roles: ["admin", "secretaria"],                                         group: "dia" },
  { key: "guias",         label: "Guías de Despacho",   subtitle: "Crear y rastrear envíos",           href: "/guias",          icon: Truck,            roles: ["admin", "secretaria", "bodega", "director", "vendedor"],       group: "dia" },
  { key: "caja",          label: "Caja Menuda",         subtitle: "Registrar gastos del día a día",    href: "/caja",           icon: Wallet,           roles: ["admin", "secretaria"],                                         group: "consulta" },
  { key: "directorio",    label: "Directorio",          subtitle: "Clientes y contactos",              href: "/directorio",     icon: Contact,          roles: ["admin", "secretaria", "director", "contabilidad", "vendedor"], group: "consulta" },
  { key: "cheques",       label: "Cheques",             subtitle: "Control de cheques por cobrar",     href: "/cheques",        icon: FileText,         roles: ["admin", "secretaria", "director"],                             group: "dia" },
  { key: "prestamos",     label: "Préstamos",           subtitle: "Adelantos y deducciones",           href: "/prestamos",      icon: HandCoins,        roles: ["admin", "contabilidad"],                                       group: "consulta" },
  { key: "reclamos",      label: "Reclamos",            subtitle: "Reportar y dar seguimiento",        href: "/reclamos",       icon: AlertTriangle,    roles: ["admin", "secretaria", "director"],                             group: "dia" },
  { key: "packing-lists", label: "Packing Lists",       subtitle: "Índices de bultos por estilo",      href: "/packing-lists",  icon: ClipboardList,    roles: ["admin", "secretaria", "bodega", "director", "vendedor"],       group: "dia" },
  { key: "ventas",        label: "Ventas",              subtitle: "Ver por mes y comparar períodos",   href: "/ventas",         icon: TrendingUp,       roles: ["admin", "director", "contabilidad"],                           group: "consulta" },
  { key: "marketing",     label: "Marketing",           subtitle: "Gastos compartidos a marcas",       href: "/marketing",      icon: Megaphone,        roles: ["admin", "secretaria", "director"],                             group: "dia" },
  { key: "catalogos",     label: "Catálogos",           subtitle: "Reebok, Joybees",                   href: "/catalogos",      icon: BookOpen,         roles: ["admin", "vendedor", "cliente", "secretaria"],                  group: "catalogo" },
  { key: "camisetas",     label: "Camisetas Selección", subtitle: "Pedidos y stock",                   href: "/camisetas",      icon: Shirt,            roles: ["admin", "vendedor"],                                           group: "catalogo" },
];

/** Filtra módulos visibles para un rol. Si hay fgModules (permisos custom),
 *  prevalece sobre el default por rol. */
export function getVisibleModules(role: string, fgModules?: string[] | null): AppModule[] {
  if (role === "admin") return ALL_MODULES;
  if (fgModules && fgModules.length > 0) {
    return ALL_MODULES.filter(m => fgModules.includes(m.key));
  }
  return ALL_MODULES.filter(m => m.roles.includes(role));
}

export const GROUP_ORDER: ModuleGroup[] = ["dia", "consulta", "catalogo", "admin"];
export const GROUP_LABELS: Record<ModuleGroup, { title: string; description: string }> = {
  dia:      { title: "Día a día",             description: "Lo que usas todos los días" },
  consulta: { title: "Consultas y reportes",  description: "Información cuando la necesites" },
  catalogo: { title: "Catálogos",             description: "Productos y pedidos" },
  admin:    { title: "Administración",        description: "Configuración del sistema" },
};
