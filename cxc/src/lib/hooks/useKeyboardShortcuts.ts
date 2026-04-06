"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────

type ShortcutHandler = () => void;

interface ShortcutDef {
  key: string;
  label: string;
  handler: ShortcutHandler;
  /** Only active when a table context is provided */
  tableOnly?: boolean;
}

interface UseKeyboardShortcutsOptions {
  /** Open the search bar / command palette */
  onOpenSearch?: () => void;
  /** Show keyboard shortcuts help modal */
  onShowHelp?: () => void;
  /** Table interaction callbacks (optional, for pages with tables) */
  table?: {
    rowCount: number;
    selectedIndex: number;
    onSelect: (index: number) => void;
    onExpand: (index: number) => void;
    onCollapse: () => void;
    onEdit?: (index: number) => void;
  };
}

// ── Shortcut definitions (for the help modal) ─────────────────────

export interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navegación global",
    shortcuts: [
      { keys: ["⌘K", "/"], description: "Abrir búsqueda" },
      { keys: ["G", "H"], description: "Ir a Inicio" },
      { keys: ["G", "C"], description: "Ir a CXC" },
      { keys: ["G", "G"], description: "Ir a Guías" },
      { keys: ["G", "Q"], description: "Ir a Cheques" },
      { keys: ["G", "R"], description: "Ir a Reclamos" },
      { keys: ["G", "J"], description: "Ir a Caja" },
      { keys: ["G", "V"], description: "Ir a Ventas" },
      { keys: ["G", "P"], description: "Ir a Préstamos" },
      { keys: ["?"], description: "Mostrar atajos de teclado" },
    ],
  },
  {
    title: "Tabla (cuando hay lista visible)",
    shortcuts: [
      { keys: ["J"], description: "Siguiente fila" },
      { keys: ["K"], description: "Fila anterior" },
      { keys: ["Enter", "Espacio"], description: "Expandir / colapsar fila" },
      { keys: ["E"], description: "Editar fila seleccionada" },
      { keys: ["Escape"], description: "Deseleccionar / cerrar" },
    ],
  },
];

// ── Hook ───────────────────────────────────────────────────────────

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const router = useRouter();
  const { onOpenSearch, onShowHelp, table } = options;

  // "G then X" chord: track if "G" was pressed recently
  const gPressedRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGChord = useCallback(() => {
    gPressedRef.current = false;
    if (gTimerRef.current) {
      clearTimeout(gTimerRef.current);
      gTimerRef.current = null;
    }
  }, []);

  const startGChord = useCallback(() => {
    gPressedRef.current = true;
    if (gTimerRef.current) clearTimeout(gTimerRef.current);
    // 800ms window for second key
    gTimerRef.current = setTimeout(() => {
      gPressedRef.current = false;
    }, 800);
  }, []);

  useEffect(() => {
    function isInputFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Never intercept when modifier keys are held (except for ⌘K)
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

      // ⌘K / Ctrl+K — open search (let SearchBar handle it, but also support "/")
      // SearchBar already listens for ⌘K, so we skip that here.

      // "/" to open search (only when not in input)
      if (e.key === "/" && !hasModifier && !isInputFocused()) {
        e.preventDefault();
        onOpenSearch?.();
        return;
      }

      // "?" to show help (Shift+/ on US keyboard)
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !isInputFocused()) {
        e.preventDefault();
        onShowHelp?.();
        return;
      }

      // Skip everything below if input is focused or modifier is held
      if (isInputFocused() || hasModifier) return;

      const key = e.key.toLowerCase();

      // ── G-chord navigation ──────────────────────────────────────
      if (gPressedRef.current) {
        const routes: Record<string, string> = {
          h: "/plantillas",
          c: "/admin",
          g: "/guias",
          q: "/cheques",
          r: "/reclamos",
          j: "/caja",
          v: "/ventas",
          p: "/prestamos",
        };
        if (routes[key]) {
          e.preventDefault();
          clearGChord();
          router.push(routes[key]);
          return;
        }
        // If it's not a valid second key, cancel the chord
        clearGChord();
      }

      // Start G chord
      if (key === "g" && !gPressedRef.current) {
        startGChord();
        return;
      }

      // ── Table shortcuts ─────────────────────────────────────────
      if (table && table.rowCount > 0) {
        if (key === "j") {
          e.preventDefault();
          const next = Math.min(table.selectedIndex + 1, table.rowCount - 1);
          table.onSelect(next);
          return;
        }
        if (key === "k") {
          e.preventDefault();
          const prev = Math.max(table.selectedIndex - 1, 0);
          table.onSelect(prev);
          return;
        }
        if ((e.key === "Enter" || e.key === " ") && table.selectedIndex >= 0) {
          e.preventDefault();
          table.onExpand(table.selectedIndex);
          return;
        }
        if (key === "e" && table.selectedIndex >= 0 && table.onEdit) {
          e.preventDefault();
          table.onEdit(table.selectedIndex);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          table.onCollapse();
          table.onSelect(-1);
          return;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearGChord();
    };
  }, [router, onOpenSearch, onShowHelp, table, clearGChord, startGChord]);
}
