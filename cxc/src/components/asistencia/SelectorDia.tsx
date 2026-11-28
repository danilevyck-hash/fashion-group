"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * EL SELECTOR DE UN DÍA (Asistencia › Marcaciones, 27-nov-2026).
 *
 *     ‹  📅 jue 26 nov  ›
 *
 * El mismo dibujo del selector de período del módulo, pero de UN día: las
 * flechas saltan de a un día y el 📅 abre el calendario de una fecha de la casa
 * (`CampoFecha`). Nunca pasa de hoy. La regla vive en
 * `lib/ui/marcaciones-dia-2026-11.ts`; acá solo se dibuja.
 * ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import CampoFecha from "@/components/ui/CampoFecha";
import { CLASE_PERIODO_EN_LA_BARRA } from "@/components/asistencia/SelectorPeriodo";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { hoyPanama } from "@/lib/fecha-panama";
import { fechaDelDia } from "@/lib/asistencia/marcaciones-por-dia";
import { PARAM_DIA, diaElegido, diaVecino } from "@/lib/ui/marcaciones-dia-2026-11";

/** El día que se mira (`?dia=`, replace) y hoy en Panamá. */
export function useDiaMarcaciones(): { dia: string; hoy: string; elegir: (d: string) => void } {
  const hoy = useMemo(() => hoyPanama(), []);
  const [crudo, setCrudo] = useUrlState<string>(PARAM_DIA, "");
  return { dia: diaElegido(crudo, hoy), hoy, elegir: (d) => setCrudo(diaElegido(d, hoy)) };
}

export default function SelectorDia({ anchoCompleto = false }: { anchoCompleto?: boolean }) {
  const { dia, hoy, elegir } = useDiaMarcaciones();
  const flecha = "flex h-11 w-9 shrink-0 items-center justify-center text-gray-500 transition hover:text-black active:scale-[0.97] disabled:opacity-25";
  return (
    <div className={`flex shrink-0 items-center rounded-md border border-gray-300 bg-white ${anchoCompleto ? `${CLASE_PERIODO_EN_LA_BARRA} h-9 justify-between` : ""}`}>
      <button type="button" onClick={() => elegir(diaVecino(dia, -1, hoy))} aria-label="Día anterior" className={flecha}>
        ‹
      </button>
      <CampoFecha
        value={dia}
        max={hoy}
        aria-label="Día"
        rotulo={<span className="font-medium tabular-nums">{fechaDelDia(dia)}</span>}
        onChange={(e) => elegir(e.target.value)}
        className={`min-h-[36px] justify-center px-1 ${anchoCompleto ? "flex-1 text-[13px]" : "min-w-[132px] text-sm"}`}
      />
      <button type="button" onClick={() => elegir(diaVecino(dia, 1, hoy))} disabled={dia >= hoy} aria-label="Día siguiente" className={flecha}>
        ›
      </button>
    </div>
  );
}
