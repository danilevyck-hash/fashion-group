"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Remembers the last value used in a form field or filter via localStorage.
 * Key is stored as `fg_last_{key}`.
 * Returns [value, setValue] — setValue persists to localStorage automatically.
 *
 * SSR-safe: el estado arranca con `defaultValue` (idéntico en server y cliente,
 * sin mismatch de hidratación) y el valor guardado se aplica en un useEffect
 * después de montar. Leer localStorage en el initializer de useState NO funciona
 * en el App Router de Next: el render del server cae al default y ese default
 * queda pegado tras hidratar, así que el valor recordado nunca se aplicaba.
 */
export function useLastUsed(key: string, defaultValue: string = ""): [string, (v: string) => void] {
  const storageKey = `fg_last_${key}`;

  const [value, _setValue] = useState<string>(defaultValue);

  // Hidratar desde localStorage una vez montado en el cliente.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) _setValue(stored);
    } catch {
      // localStorage no disponible — quedarse con el default.
    }
  }, [storageKey]);

  const setValue = useCallback((v: string) => {
    _setValue(v);
    try {
      if (v) {
        localStorage.setItem(storageKey, v);
      }
    } catch {
      // localStorage no disponible
    }
  }, [storageKey]);

  return [value, setValue];
}
