"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL CALENDARIO — `react-day-picker` v9 vestido con Tailwind.
//
// 🔑 Se estiliza con CLASES, no con un CSS propio: por eso se eligió esta
// librería y no `react-datepicker`, que trae su hoja de estilos y hay que
// pelearla. Acá cada parte del calendario es una clase de Tailwind más.
//
// 🔴 BLANCOS TÁCTILES DE 44 px. No es cosmético: es la regla de la casa desde el
// barrido de 17 pantallas, y un calendario es justo donde un blanco chico se
// paga — el dedo gordo elige el día equivocado y el error no se ve hasta que el
// cuadro sale con otro rango.
//
// ⚠️ NO se importa el CSS de la librería. v9 no lo necesita si se pasan todas
// las clases, y el día que alguien lo agregue va a pisar estos estilos.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={es}
      // 🩸 `locale` traduce los NOMBRES (meses, días), no los textos de
      // accesibilidad: los botones de navegación decían «Go to the Previous
      // Month» en una app que es toda en español y cuyos usuarios no son
      // técnicos. Se ve con VoiceOver y en el tooltip del navegador.
      labels={{
        labelPrevious: () => "Mes anterior",
        labelNext: () => "Mes siguiente",
        labelMonthDropdown: () => "Mes",
        labelYearDropdown: () => "Año",
        labelWeekday: (d) => d.toLocaleDateString("es", { weekday: "long" }),
        // El del día decía «3 de agosto de 2026, selected» — media frase en
        // cada idioma.
        labelDayButton: (d, m) =>
          `${d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}` +
          (m?.selected ? ", elegido" : ""),
      }}
      showOutsideDays
      className={cn("select-none", className)}
      classNames={{
        months: "flex flex-col gap-5 sm:flex-row sm:gap-6",
        month: "space-y-2",
        month_caption: "flex h-11 items-center justify-center",
        caption_label: "text-sm font-semibold capitalize text-gray-900",
        nav: "flex items-center gap-1",
        button_previous:
          "absolute left-1 top-0 inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50 active:scale-[0.97] disabled:opacity-30",
        button_next:
          "absolute right-1 top-0 inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50 active:scale-[0.97] disabled:opacity-30",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-11 text-[11px] font-normal uppercase tracking-wide text-gray-400",
        week: "flex w-full",
        // 🔴 44×44 el blanco táctil. El día pintado va adentro.
        day: "relative h-11 w-11 p-0 text-center text-sm",
        day_button:
          "inline-flex h-11 w-11 items-center justify-center rounded-lg tabular-nums transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:pointer-events-none",
        selected: "",
        range_start:
          "[&>button]:bg-black [&>button]:text-white [&>button]:hover:bg-black rounded-l-lg bg-gray-100",
        range_end:
          "[&>button]:bg-black [&>button]:text-white [&>button]:hover:bg-black rounded-r-lg bg-gray-100",
        range_middle: "bg-gray-100 [&>button]:rounded-none [&>button]:hover:bg-gray-200",
        today: "[&>button]:font-semibold [&>button]:underline [&>button]:underline-offset-4",
        outside: "[&>button]:text-gray-300",
        disabled: "[&>button]:text-gray-200",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
