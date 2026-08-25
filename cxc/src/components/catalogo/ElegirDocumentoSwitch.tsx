"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL BOTÓN "ENVIAR A SWITCH" AHORA TIENE DOS SALIDAS — Y LA PANTALLA DICE
// LA DIFERENCIA ANTES DE MANDAR (24-ago-2026).
//
// Daniel pidió poder mandar una COTIZACIÓN además del pedido, textual:
// ***"que estén los dos"***. O sea: se elige cada vez.
//
// 🔴 POR QUÉ ES UN PASO Y NO DOS BOTONES AL LADO. La diferencia entre las dos
// salidas no se ve: una APARTA la mercancía y la otra no. Dos botones gemelos
// se tocan sin leer —y el que se toca de más manda 500 pares a Switch de la
// forma equivocada—, así que la elección cuesta UN toque más y ese toque trae
// la explicación pegada. No es un flujo nuevo: es el mismo botón de siempre,
// que ahora pregunta qué.
//
// Los textos NO viven acá: vienen de `lib/catalogo/documento-switch.ts`, que es
// la única definición. Esta pieza la usan las TRES pantallas que mandan a
// Switch (checkout, detalle del pedido y confirmación) en las 4 marcas —
// Reebok, Joybees, Tommy y Calvin comparten exactamente este componente.
//
// Patrón de modal del repo: createPortal + inset-0 + useBodyScrollLock, SIN
// autoFocus (en iOS abre el teclado y tapa la pantalla). Táctil mínimo 44 px y
// ningún texto por debajo de 12 px.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import {
  type DocumentoSwitch,
  OPCIONES_DOCUMENTO,
  esCotizacion,
} from "@/lib/catalogo/documento-switch";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se llama con lo elegido. El envío lo dispara la pantalla que la usa. */
  onElegir: (documento: DocumentoSwitch) => void;
  /** Mientras se manda: el modal se queda pero no se puede volver a tocar. */
  enviando?: boolean;
}

export default function ElegirDocumentoSwitch({ open, onClose, onElegir, enviando = false }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, enviando, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => { if (!enviando) onClose(); }}
    >
      <div
        data-medir="elegir-documento"
        role="dialog"
        aria-modal="true"
        aria-label="Elegir qué mandar a Switch"
        className="w-full max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-medium">¿Qué mandas a Switch?</h2>
        </div>

        <div className="space-y-2 p-4">
          {OPCIONES_DOCUMENTO.map((o) => (
            <button
              key={o.clave}
              data-medir={`documento-${o.clave}`}
              disabled={enviando}
              onClick={() => onElegir(o.clave)}
              className={`block w-full rounded-lg border-2 px-4 py-3 text-left transition active:scale-[0.98] disabled:opacity-40 ${
                esCotizacion(o.clave)
                  ? "border-amber-300 bg-amber-50/50 hover:border-amber-400"
                  : "border-emerald-300 bg-emerald-50/50 hover:border-emerald-400"
              }`}
            >
              <span className="block text-sm font-semibold text-gray-900">{o.titulo}</span>
              {/* 🔴 LA ADVERTENCIA VA ACÁ, PEGADA A LA OPCIÓN, no en un aviso
                  aparte que se lee después de haber decidido. */}
              <span className="mt-0.5 block text-xs leading-snug text-gray-700">{o.queHace}</span>
              {o.detalle && (
                <span className="mt-1 block text-xs leading-snug text-gray-500">{o.detalle}</span>
              )}
            </button>
          ))}
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <button
            onClick={onClose}
            disabled={enviando}
            className="min-h-[44px] w-full rounded-md border border-gray-200 text-sm text-gray-600 transition hover:border-gray-300 disabled:opacity-40"
          >
            {enviando ? "Enviando…" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
