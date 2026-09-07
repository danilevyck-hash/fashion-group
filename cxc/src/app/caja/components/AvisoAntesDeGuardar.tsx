"use client";

import type { MouseEvent } from "react";

/**
 * AVISAR, NUNCA BLOQUEAR (7-sep-2026).
 *
 * Un cuadro para las dos cosas que el sistema nota pero no puede decidir:
 *   · **el mismo recibo cargado dos veces** — medido: Super 99 el 9-jul con la
 *     MISMA factura, dos filas creadas con 39 segundos de diferencia; La
 *     Parrillada el 13-ago, 6 segundos. Pero también hay CUATRO recibos reales
 *     de Market Fresh de $5 el mismo día, cada uno con su factura;
 *   · **la fecha fuera del período** — 25 de los 26 recibos del período Nº3 son
 *     anteriores a su apertura, porque el papel llega tarde.
 *
 * En los dos casos el sistema no sabe más que la persona: se dice el hecho y se
 * ofrece **«Guardar igual»**. Nunca frena.
 */
interface Props {
  mensajes: string[];
  onConfirm: () => void;
  onCancel: () => void;
  /** Handlers de `useBackdropDismiss`: clic fuera = Cancelar, NUNCA guardar. */
  backdropProps?: {
    onMouseDown: (e: MouseEvent) => void;
    onClick: (e: MouseEvent) => void;
  };
}

export default function AvisoAntesDeGuardar({ mensajes, onConfirm, onCancel, backdropProps }: Props) {
  return (
    <div
      className="skin-caja fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60]"
      {...backdropProps}
    >
      <div
        className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4"
        style={{ border: "1px solid var(--caja-border-default)" }}
      >
        <h3 className="text-base font-medium mb-3" style={{ color: "var(--caja-fg-strong)" }}>
          {mensajes.length > 1 ? "Antes de guardar" : "Revisa esto antes de guardar"}
        </h3>
        <ul className="mb-6 space-y-2">
          {mensajes.map((m) => (
            <li key={m} className="text-sm" style={{ color: "var(--caja-fg-default)" }}>
              {m}
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium text-white active:scale-[0.97] transition-all min-h-[44px]"
            style={{ background: "var(--caja-accent)" }}
          >
            Guardar igual
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-md text-sm transition-all min-h-[44px]"
            style={{
              background: "#fff",
              color: "var(--caja-fg-default)",
              border: "1px solid var(--caja-border-default)",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
