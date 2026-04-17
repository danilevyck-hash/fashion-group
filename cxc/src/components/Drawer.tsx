"use client";

import { ReactNode, useEffect, useRef } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Right-side slide-in drawer. 480px desktop, 100% mobile. ESC + overlay click close. */
export default function Drawer({ open, onClose, title, children, footer }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Autofocus first focusable input inside panel
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
      first?.focus();
    }, 50);
    // Lock body scroll behind drawer
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white z-50 shadow-xl transition-transform duration-200 ease-out flex flex-col ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-medium">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-black transition p-1 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-gray-200 px-5 py-3 bg-white">{footer}</footer>}
      </div>
    </>
  );
}
