"use client";

// ============================================================================
// LA BARRA DE PERÍODOS (23-sep-2026, el período manda — mockup aprobado).
//
//   [Abierto · 3] [mid 2026 · PVH · 1] [Todos · 4]
//
// Arriba de la ficha de la tienda y de la lista de Tiendas: arriba se elige
// el período, abajo se ve lo de ese período. Los chips llegan ya armados
// (`chipsDePeriodos`, salidos de los gastos reales); acá solo se dibujan. Es
// un filtro del MISMO nivel: quien la monta lo guarda con `replace`.
// ============================================================================

import type { ChipDePeriodo } from "@/lib/marketing/periodo-manda";

interface Props {
  chips: ReadonlyArray<ChipDePeriodo>;
  elegido: string;
  onElegir: (clave: string) => void;
  /** Para el lector de pantalla. */
  etiqueta: string;
}

export default function BarraDePeriodos({ chips, elegido, onElegir, etiqueta }: Props) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5"
      role="tablist"
      aria-label={etiqueta}
      data-fg-barra-periodos
    >
      {chips.map((c) => {
        const activo = elegido === c.clave;
        return (
          <button
            key={c.clave}
            type="button"
            role="tab"
            aria-selected={activo}
            data-fg-periodo={c.clave}
            onClick={() => onElegir(c.clave)}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 px-3 rounded-lg text-xs font-medium border transition whitespace-nowrap ${
              activo
                ? "bg-blue-700 border-blue-700 text-white"
                : c.cerrado
                  ? "bg-white border-blue-200 text-blue-700 hover:border-blue-500"
                  : "bg-white border-blue-300 text-blue-800 hover:border-blue-600"
            }`}
          >
            {c.rotulo}
            <span className={`tabular-nums ${activo ? "opacity-80" : "opacity-70"}`}>{c.cantidad}</span>
          </button>
        );
      })}
    </div>
  );
}
