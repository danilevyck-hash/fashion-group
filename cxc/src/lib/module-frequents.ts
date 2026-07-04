// "Tus frecuentes": aprende los módulos más usados por el usuario desde sus
// clics reales, guardados en localStorage por usuario. Cero backend, cero write
// a DB. Por-dispositivo a propósito (cada quien usa 1 dispositivo). El top se
// intersecta SIEMPRE con getVisibleModules → cada rol ve solo lo suyo, y un
// módulo que el usuario ya no puede ver desaparece del top aunque tenga clics.

import { getVisibleModules, type AppModule } from "@/lib/modules";

const KEY_PREFIX = "fg_module_clicks_";

/** Clave por usuario (evita mezclar contadores si un dispositivo se comparte). */
function storageKey(userName?: string | null): string {
  const u = userName && userName.trim() ? userName.trim().toLowerCase() : "anon";
  return `${KEY_PREFIX}${u}`;
}

/** Suma +1 al contador de clics de un módulo. No lanza. */
export function recordModuleClick(moduleKey: string, userName?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(userName);
    const counts: Record<string, number> = JSON.parse(localStorage.getItem(key) || "{}");
    counts[moduleKey] = (counts[moduleKey] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(counts));
  } catch { /* ignore */ }
}

/**
 * Top N módulos más usados por el usuario, SOLO entre los visibles para su rol.
 * Devuelve [] si aún no hay historial (para no mostrar la fila vacía/arbitraria).
 */
export function getFrequentModules(
  role: string,
  fgModules: string[] | null | undefined,
  userName: string | null | undefined,
  limit = 4,
): AppModule[] {
  if (typeof window === "undefined") return [];
  let counts: Record<string, number> = {};
  try {
    counts = JSON.parse(localStorage.getItem(storageKey(userName)) || "{}");
  } catch { /* ignore */ }
  return getVisibleModules(role, fgModules)
    .filter((m) => (counts[m.key] || 0) > 0)
    .sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0))
    .slice(0, limit);
}
