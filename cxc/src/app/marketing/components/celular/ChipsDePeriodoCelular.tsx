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
import { BARRA_CELULAR_2026_10 } from "@/lib/navegacion/barra-controles-celular";

interface Props {
  chips: ReadonlyArray<ChipDePeriodo>;
  elegido: string;
  onElegir: (clave: string) => void;
  etiqueta: string;
}

export default function ChipsDePeriodoCelular({ chips, elegido, onElegir, etiqueta }: Props) {
  if (BARRA_CELULAR_2026_10) {
    // v3.2: control segmentado delgado (36 px a la vista, 44 al tocar). Con
    // muchos cierres se desliza de lado, sin partir ningún rótulo.
    return (
      <div className="px-4 pt-3">
        <div
          className="flex h-9 gap-0.5 overflow-x-auto rounded-lg bg-[#E3E3E8] p-0.5"
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
                className={`relative flex-1 shrink-0 whitespace-nowrap rounded-md px-3 text-[13px] text-gray-900 transition before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] ${
                  activo ? "bg-white font-medium shadow-sm" : "font-medium active:bg-white/60"
                }`}
              >
                {c.rotulo}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
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
