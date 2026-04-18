// Catálogo único de módulos de la app. Fuente de verdad para:
//   - /home (grid de tarjetas con drag-drop + orden por rol)
//   - AppHeader (drawer mobile)
//   - Sidebar (desktop persistente)
//
// Mantener sincronizado con src/app/api/auth/route.ts (permisos por rol)
// y src/middleware.ts (protección de rutas).

export type ModuleGroup = "dia" | "consulta" | "catalogo" | "admin";

export interface AppModule {
  key: string;
  label: string;
  subtitle?: string;
  href: string;
  // SVG path "d" para ícono 24x24 stroke-based (lucide-compatible).
  icon: string;
  roles: string[];
  group: ModuleGroup;
}

export const ALL_MODULES: AppModule[] = [
  { key: "cxc",           label: "Cuentas por Cobrar",    subtitle: "Quién debe, cuánto y desde cuándo", href: "/admin",           icon: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",                         roles: ["admin", "secretaria", "director", "vendedor"],            group: "dia" },
  { key: "upload",        label: "Actualizar Datos",      subtitle: "Subir archivos de Switch Soft",     href: "/upload",          icon: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12",               roles: ["admin", "secretaria"],                                    group: "dia" },
  { key: "guias",         label: "Guías de Despacho",     subtitle: "Crear y rastrear envíos",           href: "/guias",           icon: "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7",               roles: ["admin", "secretaria", "bodega", "director", "vendedor"],  group: "dia" },
  { key: "caja",          label: "Caja Menuda",           subtitle: "Registrar gastos del día a día",    href: "/caja",            icon: "M21 4H3a1 1 0 00-1 1v14a1 1 0 001 1h18a1 1 0 001-1V5a1 1 0 00-1-1zM1 10h22",   roles: ["admin", "secretaria"],                                    group: "consulta" },
  { key: "directorio",    label: "Directorio",            subtitle: "Clientes y contactos",              href: "/directorio",      icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z",         roles: ["admin", "secretaria", "director", "contabilidad", "vendedor"], group: "consulta" },
  { key: "cheques",       label: "Cheques",               subtitle: "Control de cheques por cobrar",     href: "/cheques",         icon: "M2 17l10 5 10-5M2 12l10 5 10-5M12 2L2 7l10 5 10-5-10-5z",                       roles: ["admin", "secretaria", "director"],                        group: "dia" },
  { key: "prestamos",     label: "Préstamos",             subtitle: "Adelantos y deducciones",           href: "/prestamos",       icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z",         roles: ["admin", "contabilidad"],                                  group: "consulta" },
  { key: "reclamos",      label: "Reclamos",              subtitle: "Reportar y dar seguimiento",        href: "/reclamos",        icon: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01", roles: ["admin", "secretaria", "director"], group: "dia" },
  { key: "packing-lists", label: "Packing Lists",         subtitle: "Índices de bultos por estilo",      href: "/packing-lists",   icon: "M3 3h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V5a2 2 0 012-2z M1 9h22 M9 21V9", roles: ["admin", "secretaria", "bodega", "director", "vendedor"], group: "dia" },
  { key: "ventas",        label: "Ventas",                subtitle: "Ver por mes y comparar períodos",   href: "/ventas",          icon: "M22 12h-4l-3 9L9 3l-3 9H2",                                                     roles: ["admin", "director", "contabilidad"],                      group: "consulta" },
  { key: "catalogos",     label: "Catálogos",             subtitle: "Reebok, Joybees",                   href: "/catalogos",       icon: "M4 4h16v16H4z M4 10h16 M10 4v16",                                               roles: ["admin", "vendedor", "cliente", "secretaria"],             group: "catalogo" },
  { key: "camisetas",     label: "Camisetas Selección",   subtitle: "Pedidos y stock",                   href: "/camisetas",       icon: "M20.38 3.46L16 2 12 5 8 2 3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z", roles: ["admin", "vendedor"], group: "catalogo" },
  { key: "usuarios",      label: "Usuarios",              subtitle: "Crear y asignar permisos",          href: "/admin/usuarios",  icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87", roles: ["admin"], group: "admin" },
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
