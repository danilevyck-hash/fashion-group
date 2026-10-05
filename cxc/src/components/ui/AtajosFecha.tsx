"use client";

// Los atajos de un toque del calendario (CALENDARIO_SIMPLE_2026_10). Viven
// aparte para que `RangoFechas` y `CampoFecha` los compartan sin importarse.

import { ATAJOS_FECHA, rangoDeAtajoFecha } from "@/lib/ui/calendario-simple";
import { hoyPanama } from "@/lib/fecha-panama";

/** CALENDARIO_SIMPLE_2026_10: la guía y los atajos van encima del mes. */
export const ALTO_GUIA_Y_ATAJOS = 120;

/**
 * 🔴 CALENDARIO_SIMPLE_2026_10 — los atajos de un toque. Se aplican y cierran
 * al instante, como el segundo toque del calendario. Los usa también
 * `CampoFecha` (solo Hoy y Ayer, que son días sueltos).
 */
export function Atajos({ claves, onElegir, enRango }: {
  claves?: readonly string[];
  onElegir: (desde: string, hasta: string) => void;
  /** El atajo cae dentro de los límites del campo (min/max). */
  enRango?: (desde: string, hasta: string) => boolean;
}) {
  const hoy = hoyPanama();
  return (
    // 🔴 UNA fila (Daniel, 5-oct-2026). Si un día no entra, se desliza ESTA fila,
    // nunca la página.
    <div className="flex flex-nowrap gap-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none]" data-atajos-calendario>
      {ATAJOS_FECHA.filter((a) => !claves || claves.includes(a.clave)).map((a) => {
        const r = rangoDeAtajoFecha(a.clave, hoy);
        if (enRango && !enRango(r.desde, r.hasta)) return null;
        return (
          <button
            key={a.clave}
            type="button"
            onClick={() => onElegir(r.desde, r.hasta)}
            className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full bg-gray-100 px-2 text-sm sm:px-2.5 text-gray-700 transition hover:bg-gray-200 active:scale-[0.97] lg:min-h-9"
          >
            {a.rotulo}
          </button>
        );
      })}
    </div>
  );
}
