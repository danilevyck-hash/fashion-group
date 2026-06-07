/**
 * Lightweight sessionStorage cache with 30-minute expiry.
 * Used to show stale data when offline instead of blank screens.
 */

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  ts: number;
}

export function cacheSet<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function cacheHas(key: string): boolean {
  return cacheGet(key) !== null;
}

/**
 * Modo viaje — snapshots PERSISTENTES para lectura offline.
 *
 * A diferencia de cacheSet/cacheGet (sessionStorage, 30min, se pierden al
 * cerrar la pestaña), estos usan localStorage con retención de 7 días, así el
 * dato sobrevive cerrar y reabrir la app sin conexión. persistentCacheGet
 * devuelve también el timestamp del snapshot para el chip "datos de hace X".
 */
const PERSISTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface Snapshot<T> {
  data: T;
  ts: number;
}

export function persistentCacheSet<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage lleno o no disponible — ignorar (el snapshot es best-effort)
  }
}

export function persistentCacheGet<T>(key: string): Snapshot<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > PERSISTENT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { data: entry.data, ts: entry.ts };
  } catch {
    return null;
  }
}

// Cache keys used across the app
export const CACHE_KEYS = {
  HOME_STATS: "fg_cache_home_stats",
  CHEQUES: "fg_cache_cheques",
  // Modo viaje — snapshots persistentes (localStorage, 7d) para lectura offline:
  CXC_AGING: "fg_snap_cxc_aging",
  RECLAMOS: "fg_snap_reclamos",
  MARKETING_MARCAS: "fg_snap_marketing_marcas",
  CHEQUES_SNAP: "fg_snap_cheques",
} as const;
