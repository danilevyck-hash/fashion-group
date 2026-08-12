"use client";

// ============================================================================
// La FILA de los tres niveles de Marketing (12-ago-2026).
//
// Daniel, sobre el pie viejo de herramientas: *"se siente separado"* — todo lo
// tocable del módulo (marcas, herramientas, períodos, proyectos) se dibuja con
// ESTA misma fila: título, subtítulo, monto a la derecha y ›. Una sola fuente
// de estilo para que los tres niveles se lean como la misma app.
//
// La fila es un <div role="button">, no un <button>: puede llevar botones
// adentro (ZIP, el menú ···) y anidar <button> en <button> es HTML inválido.
// ============================================================================

import type { KeyboardEvent, ReactNode } from "react";

export function ListaCard({
  titulo,
  children,
}: {
  /** Título chico en mayúsculas ARRIBA de la tarjeta (MARCAS, HERRAMIENTAS…). */
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <section>
      {titulo && (
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          {titulo}
        </div>
      )}
      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

export function FilaNivel({
  chip,
  titulo,
  subtitulo,
  monto,
  acciones,
  onClick,
  ariaLabel,
}: {
  /** Chip de estado (ABIERTO/CERRADO) antes del título. */
  chip?: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Monto a la derecha, tabular. `"—"` cuando no hay. */
  monto?: ReactNode;
  /** Botones propios de la fila (ZIP, ···). No disparan el onClick de la fila. */
  acciones?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const tocable = !!onClick;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!tocable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };
  return (
    <div
      role={tocable ? "button" : undefined}
      tabIndex={tocable ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`flex items-center gap-3 px-4 sm:px-5 py-3 min-h-[56px] ${
        tocable ? "cursor-pointer hover:bg-gray-50 transition-colors" : ""
      }`}
    >
      {chip}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 text-[15px] break-words">
          {titulo}
        </div>
        {subtitulo != null && subtitulo !== "" && (
          <div className="text-[12px] text-gray-500">{subtitulo}</div>
        )}
      </div>
      {monto != null && (
        <div className="tabular-nums text-right font-semibold text-gray-900 shrink-0">
          {monto}
        </div>
      )}
      {acciones && (
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {acciones}
        </div>
      )}
      {tocable && <span className="text-gray-400 shrink-0">›</span>}
    </div>
  );
}

/** El chip ABIERTO / CERRADO de un período. */
export function ChipEstado({ estado }: { estado: "abierto" | "cerrado" }) {
  // text-xs y no menos: la letra nunca baja de 12 px (regla de la casa,
  // candado iphone-targets-operacion).
  return estado === "abierto" ? (
    <span className="shrink-0 rounded-md bg-teal-50 border border-teal-600 text-teal-800 text-xs font-bold uppercase tracking-wider px-2 py-0.5">
      Abierto
    </span>
  ) : (
    <span className="shrink-0 rounded-md bg-gray-100 text-gray-500 text-xs font-bold uppercase tracking-wider px-2 py-0.5">
      Cerrado
    </span>
  );
}
