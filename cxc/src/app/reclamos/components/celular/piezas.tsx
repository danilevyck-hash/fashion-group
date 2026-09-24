"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PIEZAS DEL CELULAR DE RECLAMOS — la fila, el visto verde, el botón fijo.
//
// 🔴 UNA SOLA FILA PARA TODO EL MÓDULO: la empresa en la portada, el reclamo en
// la lista, el resultado de una búsqueda y las dos filas del reclamo cobrado se
// dibujan con `FilaCel`. Nombre a la izquierda, plata SIEMPRE a la derecha.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";

export function Visto() {
  return (
    <span
      aria-label="cobrado"
      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-emerald-50 text-[13px] text-emerald-700"
    >
      ✓
    </span>
  );
}

export function FilaCel({
  titulo,
  sub,
  monto,
  izquierda,
  chevron,
  onClick,
  marca,
}: {
  titulo: ReactNode;
  sub?: ReactNode;
  /** La plata, ya formateada. Vacío = la fila no lleva número. */
  monto?: string;
  /** Lo que va antes del texto: el visto verde o la casilla de elegir. */
  izquierda?: ReactNode;
  /** `true` dibuja el «›» de «esto abre otra pantalla». */
  chevron?: boolean;
  onClick?: () => void;
  marca?: string;
}) {
  const cuerpo = (
    <>
      {izquierda}
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-tight tracking-tight text-gray-900">
          {titulo}
        </span>
        {sub && <span className="mt-0.5 block text-[14px] text-gray-500">{sub}</span>}
      </span>
      {monto ? (
        <span className="shrink-0 text-[17px] tabular-nums text-gray-900">{monto}</span>
      ) : chevron ? (
        <span aria-hidden className="shrink-0 text-[17px] text-gray-300">›</span>
      ) : null}
    </>
  );
  return (
    <li data-fila={marca} className="border-t border-gray-100 first:border-t-0">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-50"
        >
          {cuerpo}
        </button>
      ) : (
        <div className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3">{cuerpo}</div>
      )}
    </li>
  );
}

/**
 * El botón negro pegado abajo, donde llega el pulgar. Respeta el notch con
 * `env(safe-area-inset-bottom)`, como el resto de la app en iOS.
 *
 * ⚠️ NO usa `CLASE_BARRA_PEGAJOSA`: esa clase es para barras que se pegan
 * DEBAJO del encabezado (`sticky`, z-9). Esto es un botón fijo abajo, que no
 * compite con el encabezado por el mismo espacio.
 */
export function CtaFija({
  children,
  onClick,
  disabled,
  marca,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  marca?: string;
}) {
  return (
    <div
      data-cta={marca ?? "principal"}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 pt-3 backdrop-blur"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="block w-full rounded-xl bg-black px-4 py-3.5 text-center text-[17px] font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {children}
      </button>
    </div>
  );
}

/** El «···» de arriba a la derecha: lo que no es de todos los días. */
export function BotonMas({ onClick, etiqueta }: { onClick: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="grid h-11 w-11 place-items-center rounded-full text-gray-500 active:bg-gray-200"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
      </svg>
    </button>
  );
}

/** La casilla redonda del modo «Elegir» (10c). */
export function Casilla({ marcada }: { marcada: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border text-[13px] ${
        marcada ? "border-black bg-black text-white" : "border-gray-300 text-transparent"
      }`}
    >
      ✓
    </span>
  );
}
