"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Syncs a state value with a URL search param.
 * Updates URL without full page reload (shallow via router.replace).
 * Returns [value, setValue] like useState.
 *
 * Usage:
 *   const [risk, setRisk] = useUrlState<RiskFilter>("risk", "all");
 *   const [search, setSearch] = useUrlState("search", "");
 *   const [anio, setAnio] = useUrlState("anio", 2026);
 *   const [empresas, setEmpresas] = useUrlState("empresa", [] as string[]);
 */

// String overload (including string union types)
export function useUrlState<T extends string = string>(
  key: string,
  defaultValue: NoInfer<T>
): [T, (value: T) => void];

// Number overload
export function useUrlState(
  key: string,
  defaultValue: number
): [number, (value: number) => void];

// String array overload
export function useUrlState(
  key: string,
  defaultValue: string[]
): [string[], (value: string[]) => void];

// Implementation
export function useUrlState(
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultValue: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): [any, (value: any) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = useMemo(() => {
    if (Array.isArray(defaultValue)) {
      const all = searchParams.getAll(key);
      return all.length > 0 ? all : defaultValue;
    }
    const raw = searchParams.get(key);
    if (raw === null) return defaultValue;
    if (typeof defaultValue === "number") {
      const n = Number(raw);
      return isNaN(n) ? defaultValue : n;
    }
    return raw;
  }, [searchParams, key, defaultValue]);

  const setValue = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newValue: any) => {
      const params = new URLSearchParams(searchParams.toString());

      if (Array.isArray(newValue)) {
        params.delete(key);
        const arr = newValue as string[];
        if (arr.length > 0 && JSON.stringify(arr) !== JSON.stringify(defaultValue)) {
          arr.forEach((v) => params.append(key, v));
        }
      } else {
        // Remove param if it matches the default (keep URL clean)
        if (newValue === defaultValue || newValue === "") {
          params.delete(key);
        } else {
          params.set(key, String(newValue));
        }
      }

      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    },
    [searchParams, key, defaultValue, pathname, router]
  );

  return [value, setValue];
}
