"use client";

// El ÚNICO control de tiempo de Multifashion. Ver `src/lib/multifashion/periodo.ts`
// para el porqué (tres controles a la vez, seis píldoras en tres filas en el
// teléfono, y una pestaña cuyo rango lo decidía un selector que no se dibujaba).
//
// Misma forma que Comisiones y Ventas: un desplegable que dice el período con
// todas las letras. Los grupos («Rangos», «2026», «2025»…) son rótulos, no
// opciones: no se pueden tocar.

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { OpcionPeriodo } from "@/lib/multifashion/periodo";

interface PeriodoSelectProps {
  valor: string;
  opciones: OpcionPeriodo[];
  onChange: (valor: string) => void;
  disabled?: boolean;
}

export function PeriodoSelect({ valor, opciones, onChange, disabled }: PeriodoSelectProps) {
  // Los grupos se dibujan en el orden en que aparecen (rangos primero, después
  // los años del más nuevo al más viejo) — el mismo orden que arma `opcionesPeriodo`.
  const grupos: { nombre: string; items: OpcionPeriodo[] }[] = [];
  for (const o of opciones) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nombre === o.grupo) ultimo.items.push(o);
    else grupos.push({ nombre: o.grupo, items: [o] });
  }

  return (
    <Select value={valor} onValueChange={onChange}>
      {/* h-11 = 44 px exactos, la regla táctil de la casa. */}
      <SelectTrigger
        aria-label="Período"
        className="h-11 w-auto min-w-[168px] gap-1.5 text-xs"
        disabled={disabled}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[60vh]">
        {grupos.map((g) => (
          <div key={g.nombre}>
            <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              {g.nombre}
            </div>
            {g.items.map((o) => (
              <SelectItem key={o.valor} value={o.valor} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}
