"use client";

// Estado colapsado del sidebar — única fuente de verdad, compartida por el
// propio Sidebar y por el offset de los modales centrados (ModalOverlay).
// Se sincroniza vía un CustomEvent en window para que todos los suscriptores
// reaccionen al toggle sin prop-drilling.

import { useEffect, useState } from "react";

const STORAGE_KEY = "fg_sidebar_collapsed";
const TOGGLE_EVENT = "fg-sidebar-toggle";

export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function writeSidebarCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  window.dispatchEvent(
    new CustomEvent<boolean>(TOGGLE_EVENT, { detail: value }),
  );
}

export function useSidebarCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    const handler = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setCollapsed(Boolean(ce.detail));
    };
    window.addEventListener(TOGGLE_EVENT, handler);
    return () => window.removeEventListener(TOGGLE_EVENT, handler);
  }, []);

  return collapsed;
}
