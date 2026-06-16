"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  items: OverflowMenuItem[];
  ariaLabel?: string;
  /** Horizontal anchor of the dropdown relative to the trigger. */
  align?: "left" | "right";
}

const MENU_WIDTH = 180;

/**
 * Kebab (⋯) trigger + dropdown menu. El dropdown se renderiza en un portal con
 * posición fija calculada desde el botón — así NO lo recorta ningún contenedor
 * padre con `overflow-hidden` (ej: la tabla de proyectos en Marketing). Si no
 * cabe hacia abajo, se abre hacia arriba. Cierra con click afuera, ESC, item.
 */
export default function OverflowMenu({
  items,
  ariaLabel = "Más opciones",
  align = "right",
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const estHeight = items.length * 40 + 8;

  const computeCoords = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const openUp =
      r.bottom + estHeight > window.innerHeight && r.top > estHeight;
    const top = openUp ? r.top - estHeight - 4 : r.bottom + 4;
    const left = align === "right" ? r.right - MENU_WIDTH : r.left;
    setCoords({ top, left: Math.max(8, left) });
  }, [align, estHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    computeCoords();
    const onMove = () => computeCoords();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, computeCoords]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2 text-gray-400 hover:text-black transition rounded-md hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <svg width="18" height="4" viewBox="0 0 18 4" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2" r="2" />
          <circle cx="9" cy="2" r="2" />
          <circle cx="16" cy="2" r="2" />
        </svg>
      </button>
      {open &&
        mounted &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: MENU_WIDTH,
            }}
            className="bg-white border border-gray-200 rounded-lg shadow-lg z-[200] py-1"
          >
            {items.map((item, i) => (
              <button
                key={i}
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  item.disabled
                    ? "text-gray-300 cursor-not-allowed"
                    : item.destructive
                      ? "text-red-600 hover:bg-red-50"
                      : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
