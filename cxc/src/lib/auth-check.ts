/**
 * ¿Este rol puede entrar a este módulo? — LA REGLA, en un solo lugar.
 *
 * 🔴 UNA SOLA REGLA PARA EL SERVIDOR Y EL NAVEGADOR (19-sep-2026). Antes la
 * regla vivía adentro de `hasModuleAccess`, pegada a `sessionStorage`, y por
 * eso el servidor no podía preguntarla: `useAuth` arrancaba en «no sé» y 30
 * pantallas mandaban su HTML VACÍO. Ahora la regla es `tieneAccesoAlModulo`,
 * pura, y la leen los dos lados: el navegador con lo que guardó el login y el
 * servidor con lo que trae la cookie firmada (`lib/sesion-semilla.ts`). Si un
 * lado dijera que sí y el otro que no, se vería un parpadeo — o algo peor.
 */
export function tieneAccesoAlModulo(
  role: string,
  modules: unknown,
  moduleKey: string,
  allowedRoles: readonly string[],
): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  if (allowedRoles.includes(role)) return true;
  return Array.isArray(modules) && modules.includes(moduleKey);
}

/** La misma regla, leída de lo que el login dejó en `sessionStorage`. */
export function hasModuleAccess(moduleKey: string, allowedRoles: string[]): boolean {
  if (typeof window === "undefined") return false;
  const role = sessionStorage.getItem("cxc_role") || "";
  let mods: unknown = [];
  try {
    mods = JSON.parse(sessionStorage.getItem("fg_modules") || "[]");
  } catch { mods = []; }
  return tieneAccesoAlModulo(role, mods, moduleKey, allowedRoles);
}
