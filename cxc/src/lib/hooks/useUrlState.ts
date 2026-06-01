"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Syncs a state value with a URL search param.
 * Updates URL without full page reload (shallow via the Next router).
 * Returns [value, setValue] like useState.
 *
 * History mode (convención del sistema):
 *   - "replace" (default): cambios de filtro/tab/sort en el MISMO nivel.
 *     No crean entrada de historial → el Back del navegador no cicla por ellos.
 *   - "push": drill-down a un nivel más profundo. Crea entrada de historial
 *     → el Back del navegador deshace ese nivel (espejo del breadcrumb).
 *
 * Usage:
 *   const [risk, setRisk] = useUrlState<RiskFilter>("risk", "all");          // replace (filtro)
 *   const [search, setSearch] = useUrlState("search", "");
 *   const [anio, setAnio] = useUrlState("anio", 2026);
 *   const [empresas, setEmpresas] = useUrlState("empresa", [] as string[]);
 *   const [step, setStep] = useUrlState("step", "list", { history: "push" }); // drill-down
 */

type UrlStateOptions = { history?: "push" | "replace" };

// String overload (including string union types)
export function useUrlState<T extends string = string>(
  key: string,
  defaultValue: NoInfer<T>,
  options?: UrlStateOptions
): [T, (value: T) => void];

// Number overload
export function useUrlState(
  key: string,
  defaultValue: number,
  options?: UrlStateOptions
): [number, (value: number) => void];

// String array overload
export function useUrlState(
  key: string,
  defaultValue: string[],
  options?: UrlStateOptions
): [string[], (value: string[]) => void];

// Implementation
export function useUrlState(
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultValue: any,
  options?: UrlStateOptions
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
      if (options?.history === "push") {
        router.push(url, { scroll: false });
      } else {
        router.replace(url, { scroll: false });
      }
    },
    [searchParams, key, defaultValue, pathname, router, options?.history]
  );

  return [value, setValue];
}
