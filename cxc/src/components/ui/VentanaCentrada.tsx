"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA VENTANA DE UN FORMULARIO: CENTRADA, COMO EN RECLAMOS Y MARKETING (2-oct-2026).
 *
 * Daniel, al aprobar la escala v3: «el panel abierto de Nuevo gasto debe ser
 * como lo hace ya el sistema en Reclamos, Marketing; no es así». Ahí un
 * formulario se abre en una ventana CENTRADA —«Registrar gasto» de Marketing,
 * el cobro de Reclamos—, no en un panel pegado al borde derecho. Esta es esa
 * ventana, la misma forma de «Registrar gasto»: fondo oscurecido al 40 %,
 * tarjeta blanca de esquinas `rounded-lg` con borde gris, hasta 2xl de ancho y
 * 90 % del alto, cabecera con el título y la «×» de 44 px, y el pie fijo con
 * las acciones. Escape y tocar el fondo la cierran; enfoca el primer campo.
 *
 * Crece con la escala v3 sola (está dentro de la raíz escalada): nada aquí mide
 * ni escribe posiciones.
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useAutofocusPrimerCampo } from "@/lib/hooks/useAutofocusPrimerCampo";

interface VentanaCentradaProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** La forma de la tarjeta: la MISMA de «Registrar gasto» de Marketing. */
export const CLASE_VENTANA =
  "relative bg-white w-full sm:max-w-2xl rounded-lg max-h-[90vh] flex flex-col border border-gray-200";

export default function VentanaCentrada({ open, onClose, title, children, footer }: VentanaCentradaProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // Espejo de `onClose`: los llamadores la pasan inline y cambia en cada render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useAutofocusPrimerCampo(open, panelRef);

  if (!open || !montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} className={CLASE_VENTANA}>
        <div className="border-b border-gray-100 pl-5 pr-2 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-black active:scale-[0.97] transition"
          >
            <span aria-hidden="true" className="text-xl leading-none">&times;</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div
            className="border-t border-gray-100 px-5 py-3 bg-white rounded-b-lg"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
