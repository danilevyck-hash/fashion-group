"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Like useState but persists to sessionStorage.
 * Key format: fg_ui_{module}_{key}
 */
export function usePersistedState<T>(
  module: string,
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `fg_ui_${module}_${key}`;

  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch { /* noop */ }
    return defaultValue;
  });

  // Save to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch { /* noop */ }
  }, [storageKey, state]);

  return [state, setState];
}

/**
 * Saves scroll position on unmount, restores on mount (once).
 * Call after data has loaded by passing dataReady=true.
 */
export function usePersistedScroll(module: string, dataReady: boolean) {
  const storageKey = `fg_ui_${module}_scrollY`;
  const restored = useRef(false);

  // Restore scroll position once data is ready
  useEffect(() => {
    if (!dataReady || restored.current) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) {
        const y = parseInt(saved, 10);
        if (!isNaN(y) && y > 0) {
          // Small delay to let DOM render with data
          requestAnimationFrame(() => {
            window.scrollTo(0, y);
          });
        }
        sessionStorage.removeItem(storageKey);
      }
    } catch { /* noop */ }
    restored.current = true;
  }, [dataReady, storageKey]);

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      try {
        sessionStorage.setItem(storageKey, String(window.scrollY));
      } catch { /* noop */ }
    };
  }, [storageKey]);
}
