"use client";

import { useEffect, useRef, useState } from "react";

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

/**
 * Kebab (⋯) trigger + dropdown menu. Reusable across header, table rows,
 * mobile cards, etc. Closes on outside click, ESC, or item activation.
 */
export default function OverflowMenu({
  items,
  ariaLabel = "Más opciones",
  align = "right",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
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
      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1 ${align === "right" ? "right-0" : "left-0"} bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] py-1`}
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
        </div>
      )}
    </div>
  );
}
