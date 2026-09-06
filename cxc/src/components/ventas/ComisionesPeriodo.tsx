"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <ComisionesPeriodo /> — mes y año en UN SOLO control (estilo iOS).
//
// Antes eran dos cajas sueltas en fila ("Julio" + "2026", 140px + 110px). En
// iOS el período es un control único: un botón que dice "Julio 2026" y abre un
// panel con el año arriba (‹ 2026 ›) y los 12 meses en grilla. Ocupa la mitad
// del ancho y se lee como una sola decisión, que es lo que es.
//
// Reglas de negocio conservadas TAL CUAL del control viejo:
//   - Meses futuros del año en curso NO se pueden elegir (quedan apagados).
//   - Al bajar de año, si el mes quedaba en el futuro, se baja al mes en curso.
//   - Los años disponibles los manda el server (availableYears), nunca > actual.
//
// 🩸 «HOY» ES PANAMÁ, NO EL RELOJ DEL NAVEGADOR (6-sep-2026). Usaba
// `new Date().getFullYear()` / `.getMonth() + 1` para decidir qué meses quedan
// apagados. Panamá es UTC−5 fijo y es invariante de la casa: el 1 de mes, entre
// las 00:00 y las 05:00 UTC, el navegador de alguien en otra zona podía apagar
// el mes que sí se puede pedir (o dejar elegir uno que todavía no empezó).
//
// No cambia ningún número: solo elige qué período se pide.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { hoyPanama } from "@/lib/fecha-panama";
import { mesEnCurso } from "@/lib/comisiones/mes-inicial";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface Props {
  mes: number;
  year: number;
  availableYears: number[];
  onChange: (year: number, mes: number) => void;
  className?: string;
}

export function ComisionesPeriodo({ mes, year, availableYears, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { year: currentYear, mes: currentMonth } = mesEnCurso(hoyPanama());

  const anios = availableYears.filter((y) => y <= currentYear).sort((a, b) => a - b);
  const minAnio = anios.length > 0 ? anios[0] : currentYear;
  const maxAnio = anios.length > 0 ? anios[anios.length - 1] : currentYear;

  const mesApagado = (m: number) => year === currentYear && m > currentMonth;

  // Escape cierra (en escritorio no hay "tocar afuera" en el teclado).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const irAnio = (y: number) => {
    if (y < minAnio || y > maxAnio) return;
    // Mismo ajuste que hacía el selector viejo: nunca dejar un mes futuro.
    const m = y === currentYear && mes > currentMonth ? currentMonth : mes;
    onChange(y, m);
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Período: ${MESES[mes - 1]} ${year}`}
        /* Ancho FIJO en iPhone (w-[110px]): así el control mide lo mismo en
           mayo que en julio y la fila no se reacomoda al cambiar de mes. Con
           ancho automático, "May 2026" es 8.6px más ancho que "Jul 2026" —
           suficiente para que "Actualizar ahora" se partiera en dos líneas y el
           encabezado creciera 6px. Medido, no supuesto. */
        className="inline-flex min-h-[44px] w-[110px] shrink-0 items-center justify-between gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-900 transition hover:border-gray-300 active:scale-[0.97] sm:w-auto sm:justify-start sm:gap-1.5 sm:px-3"
      >
        {/* En iPhone el mes va abreviado para que el ancho del control NO
            dependa del mes: con "Septiembre 2026" la fila se partía en dos y
            el encabezado crecía 52px en septiembre y no en julio. */}
        <span className="whitespace-nowrap sm:hidden">{MESES_CORTOS[mes - 1]} {year}</span>
        <span className="hidden whitespace-nowrap sm:inline">{MESES[mes - 1]} {year}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Elegir período"
            className="absolute left-0 top-full z-20 mt-1 w-[276px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
          >
            {/* Año — stepper, como el selector de mes del calendario de iOS. */}
            <div className="flex items-center justify-between px-1 pb-2">
              <button
                type="button"
                onClick={() => irAnio(year - 1)}
                disabled={year <= minAnio}
                aria-label="Año anterior"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50 active:scale-[0.97] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold tabular-nums text-gray-900">{year}</span>
              <button
                type="button"
                onClick={() => irAnio(year + 1)}
                disabled={year >= maxAnio}
                aria-label="Año siguiente"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50 active:scale-[0.97] disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {MESES_CORTOS.map((corto, i) => {
                const m = i + 1;
                const activo = m === mes;
                return (
                  <button
                    key={corto}
                    type="button"
                    disabled={mesApagado(m)}
                    aria-pressed={activo}
                    aria-label={MESES[i]}
                    onClick={() => { onChange(year, m); setOpen(false); }}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-lg text-sm transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30 ${
                      activo ? "bg-gray-900 font-medium text-white" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {corto}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
