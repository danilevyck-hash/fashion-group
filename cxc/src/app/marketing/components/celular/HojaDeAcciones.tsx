"use client";

// ============================================================================
// LA HOJA DE ACCIONES DE iOS (24-sep-2026).
//
// Sube desde abajo, al alcance del pulgar, con una opción por renglón y
// «Cancelar» aparte. Es lo que reemplaza al «···» de la tabla en el celular:
// las opciones son EXACTAMENTE las mismas (`OverflowMenuItem`), decididas por
// la pantalla que la abre — acá no se inventa ninguna.
//
// 🔴 Lo destructivo va en rojo y NUNCA es la primera opción.
// ============================================================================

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { OverflowMenuItem } from "@/components/ui/OverflowMenu";

interface Props {
  titulo?: string;
  opciones: ReadonlyArray<OverflowMenuItem>;
  onCerrar: () => void;
}

export default function HojaDeAcciones({ titulo, opciones, onCerrar }: Props) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative mx-2 mb-2">
        <div className="overflow-hidden rounded-[14px] bg-white/95 backdrop-blur">
          {titulo && (
            <div className="border-b border-gray-200 px-4 py-3 text-center text-[13px] text-gray-500">
              {titulo}
            </div>
          )}
          {opciones.map((o, i) => (
            <button
              key={`${o.label}-${i}`}
              type="button"
              onClick={() => {
                onCerrar();
                o.onClick?.();
              }}
              className={`block w-full border-t border-gray-100 px-4 py-4 text-center text-[19px] first:border-t-0 active:bg-gray-100 ${
                o.destructive ? "text-red-600" : "text-blue-600"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="mt-2 w-full rounded-[14px] bg-white px-4 py-4 text-center text-[19px] font-semibold text-blue-600 active:bg-gray-100"
        >
          Cancelar
        </button>
      </div>
    </div>,
    document.body,
  );
}
