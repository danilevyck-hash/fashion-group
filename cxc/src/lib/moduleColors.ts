/**
 * Module accent colors for visual focus mode.
 * Each module gets a subtle color identity so the user
 * subconsciously knows which workspace they're in.
 */

export interface ModuleColor {
  /** Tailwind border-color class (e.g. "border-blue-500") */
  border: string;
  /** Tailwind text-color class for icon tint */
  text: string;
  /** Raw hex for inline styles when needed */
  hex: string;
}

const MODULE_COLORS: Record<string, ModuleColor> = {
  cxc:        { border: "border-blue-500",    text: "text-blue-500",    hex: "#3b82f6" },
  guias:      { border: "border-emerald-500", text: "text-emerald-500", hex: "#10b981" },
  cheques:    { border: "border-amber-500",   text: "text-amber-500",   hex: "#f59e0b" },
  reclamos:   { border: "border-orange-500",  text: "text-orange-500",  hex: "#f97316" },
  caja:       { border: "border-violet-500",  text: "text-violet-500",  hex: "#8b5cf6" },
  directorio: { border: "border-cyan-500",    text: "text-cyan-500",    hex: "#06b6d4" },
  prestamos:  { border: "border-rose-500",    text: "text-rose-500",    hex: "#f43f5e" },
  ventas:     { border: "border-indigo-500",  text: "text-indigo-500",  hex: "#6366f1" },
  reebok:     { border: "border-red-500",     text: "text-red-500",     hex: "#ef4444" },
};

/** Map pathname to module key */
export function getModuleKeyFromPath(pathname: string): string | null {
  if (pathname.startsWith("/admin"))           return "cxc";
  if (pathname.startsWith("/guias"))           return "guias";
  if (pathname.startsWith("/cheques"))         return "cheques";
  if (pathname.startsWith("/reclamos"))        return "reclamos";
  if (pathname.startsWith("/caja"))            return "caja";
  if (pathname.startsWith("/directorio"))      return "directorio";
  if (pathname.startsWith("/prestamos"))       return "prestamos";
  if (pathname.startsWith("/ventas"))          return "ventas";
  if (pathname.startsWith("/catalogo/reebok")) return "reebok";
  if (pathname.startsWith("/camisetas"))       return null; // no color assigned
  return null;
}

/** Get the accent color for the current module based on pathname */
export function getModuleColor(pathname: string): ModuleColor | null {
  const key = getModuleKeyFromPath(pathname);
  return key ? MODULE_COLORS[key] ?? null : null;
}
