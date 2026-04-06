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

// Cache keys used across the app
export const CACHE_KEYS = {
  HOME_STATS: "fg_cache_home_stats",
  CHEQUES: "fg_cache_cheques",
} as const;
