export function hasModuleAccess(moduleKey: string, allowedRoles: string[]): boolean {
  if (typeof window === "undefined") return false;
  const role = sessionStorage.getItem("cxc_role") || "";
  if (!role) return false;
  if (role === "admin") return true;
  if (allowedRoles.includes(role)) return true;
  try {
    const mods = JSON.parse(sessionStorage.getItem("fg_modules") || "[]");
    return Array.isArray(mods) && mods.includes(moduleKey);
  } catch { return false; }
}
