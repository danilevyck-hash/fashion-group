"use client";

import { useState, useCallback } from "react";

/**
 * Remembers the last value used in a form field via localStorage.
 * Key is stored as `fg_last_{key}`.
 * Returns [value, setValue] — setValue persists to localStorage automatically.
 */
export function useLastUsed(key: string, defaultValue: string = ""): [string, (v: string) => void] {
  const storageKey = `fg_last_${key}`;

  const [value, _setValue] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? stored : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setValue = useCallback((v: string) => {
    _setValue(v);
    try {
      if (v) {
        localStorage.setItem(storageKey, v);
      }
    } catch {
      // localStorage not available
    }
  }, [storageKey]);

  return [value, setValue];
}
