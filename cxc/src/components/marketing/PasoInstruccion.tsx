"use client";

import { ReactNode } from "react";

type Variant = "primary" | "secondary";

interface PasoAccion {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: Variant;
}

interface PasoInstruccionProps {
  numero: number;
  titulo: string;
  descripcion?: string;
  accion?: PasoAccion;
  completado?: boolean;
  children?: ReactNode;
}

/**
 * Instrucción paso a paso VISIBLE (no tooltip, no collapsed).
 * Usada en forms y flujos críticos del módulo Marketing.
 *
 * Círculo con número → verde con check si completado.
 * Título + descripción opcional + acción opcional a la derecha.
 * Los children se renderizan debajo del header del paso (ej: uploader, inputs).
 */
export function PasoInstruccion({
  numero,
  titulo,
  descripcion,
  accion,
  completado = false,
  children,
}: PasoInstruccionProps) {
  const circuloClase = completado
    ? "bg-emerald-500 text-white"
    : "bg-gray-100 text-gray-700";

  const tituloClase = completado
    ? "line-through text-gray-400"
    : "text-gray-900";

  const descClase = completado
    ? "line-through text-gray-400"
    : "text-gray-600";

  const disabled = Boolean(accion?.disabled);
  const wrapperClase = `border border-gray-200 rounded-lg p-4 ${
    disabled && !completado ? "opacity-60" : ""
  }`;

  const botonBase =
    "rounded-md px-3 py-2 text-sm transition active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed";
  const botonVariante =
    accion?.variant === "secondary"
      ? "bg-white border border-gray-300 text-gray-900 hover:bg-gray-50"
      : "bg-black text-white hover:bg-gray-800";

  return (
    <div className={wrapperClase}>
      <div className="flex items-start gap-4">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${circuloClase}`}
          aria-hidden="true"
        >
          {completado ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            numero
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${tituloClase}`}>{titulo}</div>
          {descripcion && (
            <div className={`text-xs mt-0.5 ${descClase}`}>{descripcion}</div>
          )}
        </div>

        {accion && (
          <button
            type="button"
            onClick={accion.onClick}
            disabled={disabled}
            className={`${botonBase} ${botonVariante} shrink-0`}
          >
            {accion.label}
          </button>
        )}
      </div>

      {children && <div className="mt-4 ml-12">{children}</div>}
    </div>
  );
}

export default PasoInstruccion;
