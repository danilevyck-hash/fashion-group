"use client";

// Estado colapsado del sidebar — única fuente de verdad, compartida por el
// propio Sidebar y por el offset de los modales centrados (ModalOverlay).
// Se sincroniza vía un CustomEvent en window para que todos los suscriptores
// reaccionen al toggle sin prop-drilling.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MENU_PLEGADO_EN_INICIO_2026_11 } from "@/lib/ui/revision-110-2026-11";

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

/**
 * 🔴 n.º 38 (14-nov-2026, `MENU_PLEGADO_EN_INICIO_2026_11`): en Inicio el menú
 * lateral va SOLO con íconos —las fichas ya son el menú—; dentro de un módulo
 * queda como cada quien lo dejó. No se guarda nada: es por pantalla.
 */
export function plegadoPorPantalla(pathname: string | null | undefined): boolean {
  return MENU_PLEGADO_EN_INICIO_2026_11 && pathname === "/home";
}

export function useSidebarCollapsed(): boolean {
  const pathname = usePathname();
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

  return collapsed || plegadoPorPantalla(pathname);
}
