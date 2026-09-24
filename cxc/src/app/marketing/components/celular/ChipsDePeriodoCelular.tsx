"use client";

// ============================================================================
// LA BARRA «Abierto · cada cierre · Todos», en el celular (24-sep-2026).
//
// 🔴 LA BARRA SE QUEDA. Daniel la aprobó en el mockup de la ficha (2a): *«la
// barra Abierto · cierres · Todos se queda»*. Es la misma regla del 23-sep
// —arriba se elige el período, abajo se ve lo de ese período—: acá solo cambia
// cómo se dibuja, en píldoras de iOS que se deslizan de lado.
//
// Los chips llegan armados de `periodo-manda.ts` (salidos de los gastos
// REALES). Acá no se decide ninguno.
// ============================================================================

import type { ChipDePeriodo } from "@/lib/marketing/periodo-manda";

interface Props {
  chips: ReadonlyArray<ChipDePeriodo>;
  elegido: string;
  onElegir: (clave: string) => void;
  etiqueta: string;
}

export default function ChipsDePeriodoCelular({ chips, elegido, onElegir, etiqueta }: Props) {
  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 pt-4 pb-0.5"
      role="tablist"
      aria-label={etiqueta}
      data-fg-chips-periodo-celular
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
            className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-4 text-[14px] transition active:scale-[0.97] ${
              activo ? "bg-gray-900 text-white" : "bg-[#E9E9EB] text-gray-900"
            }`}
          >
            {c.rotulo}
          </button>
        );
      })}
    </div>
  );
}
