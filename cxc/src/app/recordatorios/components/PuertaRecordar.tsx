"use client";

/**
 * LA PUERTA ÚNICA — «＋ Recordar» (22-sep-2026).
 *
 * Daniel, textual: ***«cheque es un motivo de recordatorio»***.
 *
 * ── LO QUE ERA ───────────────────────────────────────────────────────────────
 *
 * DOS puertas que no se conocían: un botón negro **«Nuevo Cheque»** arriba a la
 * derecha, que escribía en `cheques`, y una caja **«¿Qué te recuerdo?»** que se
 * llevaba todo el ancho y nueve botones, y escribía en `recordatorios`. Nada en
 * la pantalla decía que las dos cosas eran lo mismo.
 *
 * ── LO QUE ES ────────────────────────────────────────────────────────────────
 *
 * UN botón. Se toca, se elige el MOTIVO, y el formulario de ese motivo pide lo
 * que ese motivo necesita. Nada más.
 *
 * 🔴 **Los motivos salen de `lib/recordatorios/motivos.ts`, no de acá.** Esta
 * ventana no sabe cuántos hay ni cómo se llaman: dibuja la lista que le pasan.
 * Agregar un motivo nuevo es agregar una ficha allá y el formulario que lo
 * atiende — esta pantalla no se toca.
 *
 * 🔴 **Elegir no guarda nada.** Abre el formulario del motivo; guardar sigue
 * siendo el botón del formulario, con sus campos obligatorios de siempre.
 */

import { ModalOverlay } from "@/components/ui";
import { useFormGuard } from "@/lib/hooks/useModalDismiss";
import { MOTIVOS_EN_ORDEN, type Motivo } from "@/lib/recordatorios/motivos";

interface Props {
  open: boolean;
  onCerrar: () => void;
  onElegir: (m: Motivo) => void;
}

export default function PuertaRecordar({ open, onCerrar, onElegir }: Props) {
  // Elegir un motivo no escribe nada y esta ventana no tiene campos, así que
  // el guard de «formulario sucio» nunca frena: cierra con Escape y con el clic
  // afuera, como cualquier ventana del sistema.
  const { panelRef, intentarCerrar } = useFormGuard(open, onCerrar);
  if (!open) return null;

  return (
    <ModalOverlay onBackdropClick={intentarCerrar}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Recordar"
        data-puerta-recordar
        className="bg-white sm:rounded-lg rounded-t-2xl w-full max-w-sm mx-0 sm:mx-4 border border-gray-200"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-medium">¿Qué te recuerdo?</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-2">
          {MOTIVOS_EN_ORDEN.map((f) => (
            <button
              key={f.motivo}
              type="button"
              data-motivo={f.motivo}
              onClick={() => onElegir(f.motivo)}
              className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 min-h-[44px] flex items-start gap-3 hover:border-black hover:bg-gray-50 active:scale-[0.99] transition"
            >
              <span aria-hidden className="text-lg leading-none mt-0.5">
                {f.icono}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{f.label}</span>
                {/* Qué va a pasar, antes de elegir — el patrón del formulario
                    de Reclamos: se dice lo que hace, no se descubre después. */}
                <span className="block text-xs text-gray-500 mt-0.5">{f.queHace}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </ModalOverlay>
  );
}
