"use client";

// El calendario de UN día: el interior de `CampoFecha`. Se carga bajo demanda,
// igual que `CalendarioRango` (ver su nota sobre `react-day-picker`).
// CALENDARIO_SIMPLE_2026_10: un toque elige y el control cierra.

import { Calendar } from "./calendar";
import { aIso, deIso } from "./rango-fechas-iso";

export default function CalendarioDia({ valor, min, max, onDia }: {
  valor: string;
  min?: string;
  max?: string;
  onDia: (iso: string) => void;
}) {
  const disabled = [
    ...(min ? [{ before: deIso(min) }] : []),
    ...(max ? [{ after: deIso(max) }] : []),
  ];
  return (
    <Calendar
      mode="single"
      selected={valor ? deIso(valor) : undefined}
      defaultMonth={deIso(valor || max || aIso(new Date()))}
      numberOfMonths={1}
      disabled={disabled}
      onDayClick={(d, m) => { if (!m.disabled) onDia(aIso(d)); }}
      modifiersClassNames={{ selected: "[&>button]:bg-black [&>button]:text-white [&>button]:hover:bg-black" }}
    />
  );
}
