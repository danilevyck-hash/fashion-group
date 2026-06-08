"use client";

import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { ClienteHoverCard, type HistorialState } from "./ClienteHoverCard";

/**
 * Mobile bottom-sheet para el detalle de cliente — equivalente del HoverCard
 * desktop. Diseñado para `md:hidden` (≤ 768px). Sin drag-to-dismiss ni half/full
 * mode: es un sheet info-only que se cierra con backdrop tap o Escape.
 *
 * El cuerpo es el mismo `<ClienteHoverCard>` que se monta en el HoverCard
 * desktop — un solo lugar de verdad para el contenido (incluyendo el chip
 * CXC que se fetcha internamente).
 */
interface ClienteSheetProps {
  open: boolean;
  onClose: () => void;
  nombre: string;
  codigo: string;
  empresa: string;
  empresaScope: string;
  historial: HistorialState;
  onFirstHover: () => void;
}

export function ClienteSheet({
  open,
  onClose,
  nombre,
  codigo,
  empresa,
  empresaScope,
  historial,
  onFirstHover,
}: ClienteSheetProps) {
  // Animate in/out
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while sheet is open (hook compartido con ref-count).
  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ease-out"
        style={{ transform: visible ? "translateY(0)" : "translateY(100%)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex w-full justify-center pt-3 pb-2"
        >
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </button>
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <ClienteHoverCard
            nombre={nombre}
            codigo={codigo}
            empresa={empresa}
            empresaScope={empresaScope}
            historial={historial}
            onFirstHover={onFirstHover}
          />
        </div>
      </div>
    </div>
  );
}
