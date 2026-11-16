"use client";

// La gráfica de ventas diarias de `MULTIFASHION_GRAFICA_2026_10` (ver
// `lib/multifashion/grafica-mes.ts`). La misma pieza en la computadora y en el
// celular: barras por día sin eje, el promedio en una línea tenue y el día
// tocado (o con el mouse encima) arriba, en una línea.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { MULTIFASHION_VS_ANIO_PASADO, etiquetaEnCelular, graficaDelMes, lineaDeLaGrafica, type EstadoDia } from "@/lib/multifashion/grafica-mes";

const BARRA: Record<EstadoDia, string> = {
  venta: "bg-gray-400",
  ultimo: "bg-gray-900",
  "sin-venta": "bg-amber-500",
  cerrado: "bg-gray-200",
  hoy: "border border-dashed border-gray-400 bg-transparent",
  futuro: "bg-gray-100",
};

/** Hoy, con venta: oscuro como el destacado y rayado, porque el día no cerró. */
const BARRA_HOY_EN_CURSO = "bg-[repeating-linear-gradient(135deg,#111827_0_3px,#6b7280_3px_6px)]";

export function GraficaDelMes({
  dias, year, mes, esMesActual, diaActual, feriados, alta = false, ventaHoy = null,
}: {
  dias: readonly { dia: number; ventas: number; n_tickets: number; ventas_anio_anterior?: number | null }[];
  year: number;
  mes: number;
  esMesActual: boolean;
  diaActual: number;
  feriados?: readonly string[] | null;
  /** `MULTIFASHION_BARRA_2026_10`, celular: el doble de alto (240 px) y la línea de arriba dice «Venta promedio diaria … · 1–10 oct». */
  alta?: boolean;
  /**
   * `MULTIFASHION_BARRA_2026_10`: lo vendido HOY hasta ahora. La barra de «Hoy»
   * es la destacada (oscura, rayada: el día va en curso) y el último día
   * completo vuelve al gris de los demás. Misma escala (el mejor día cerrado).
   * No entra al promedio ni responde al toque.
   * ponytail: si hoy ya pasó al mejor día del mes, la barra topa en el 100 %.
   */
  ventaHoy?: number | null;
}) {
  const hayAA = MULTIFASHION_VS_ANIO_PASADO && dias.some((d) => d.ventas_anio_anterior != null);
  const [vsAA, setVsAA] = useState(false);
  const comparar = hayAA && vsAA;
  const g = useMemo(
    () => graficaDelMes({ dias, year, mes, esMesActual, diaActual, feriados, vsAnioPasado: comparar }),
    [dias, year, mes, esMesActual, diaActual, feriados, comparar],
  );
  const maxCerrado = Math.max(0, ...g.dias.filter((d) => d.alto > 0).map((d) => d.ventas / d.alto));
  const altoHoy = ventaHoy != null && ventaHoy > 0 && maxCerrado > 0 ? Math.min(1, ventaHoy / maxCerrado) : null;
  const [tocado, setTocado] = useState<number | null>(null);
  const linea = lineaDeLaGrafica(g, year, mes, tocado, alta);

  // El dedo o el mouse eligen por la posición: cada barra mide ~10 px en el celular.
  const diaEn = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(g.dias.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * g.dias.length)));
    const d = g.dias[i];
    return d && d.estado !== "futuro" && d.estado !== "hoy" ? d.dia : null;
  };

  return (
    <div data-elemento="grafica-dias">
      <p data-elemento="grafica-linea" className="min-h-[20px] text-sm text-gray-950 tabular-nums">
        {linea ?? " "}
      </p>
      <div
        role="group"
        aria-label="Ventas diarias del mes · toca un día"
        className={cn("relative mt-3 flex cursor-pointer touch-pan-y items-end gap-[2px] sm:h-[180px] sm:gap-1", alta ? "h-[240px]" : "h-[120px]")}
        onPointerMove={(e) => { if (e.pointerType === "mouse") setTocado(diaEn(e)); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setTocado(null); }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") return;
          const d = diaEn(e);
          setTocado((t) => (t === d ? null : d));
        }}
      >
        {g.promedioAlto != null && !comparar && (
          <span
            data-elemento="grafica-promedio"
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-300"
            style={{ bottom: `${g.promedioAlto * 100}%` }}
          />
        )}
        {g.dias.map((d) => (
          <span key={d.dia} className="relative flex h-full flex-1 items-end">
          <span
            data-dia={d.dia}
            data-estado={d.estado}
            className={cn(
              "w-full rounded-t-[3px] transition-opacity",
              d.estado === "hoy" && altoHoy != null ? BARRA_HOY_EN_CURSO
                : d.estado === "ultimo" && altoHoy != null ? BARRA.venta : BARRA[d.estado],
              tocado != null && d.dia !== tocado && "opacity-30",
              tocado === d.dia && d.estado === "venta" && "bg-gray-900",
            )}
            style={{
              height: d.estado === "hoy" && altoHoy != null ? `${Math.max(3, altoHoy * 100)}%`
                : d.estado === "hoy" || d.estado === "futuro" || d.alto === 0
                ? (d.estado === "futuro" ? "2px" : "4px")
                : `${Math.max(3, d.alto * 100)}%`,
            }}
          />
          {/* La misma fecha del año pasado: una raya sobre el día. */}
          {d.altoAA != null && d.altoAA > 0 && (
            <span
              aria-hidden
              data-elemento="grafica-aa"
              className={cn("pointer-events-none absolute -inset-x-px h-[2px] rounded bg-blue-600", tocado != null && d.dia !== tocado && "opacity-30")}
              style={{ bottom: `calc(${d.altoAA * 100}% - 1px)` }}
            />
          )}
          </span>
        ))}
      </div>
      {/* Grilla y no flex: un rótulo más ancho que su barra («Hoy», «31») se
          centra sobre ella en vez de correr a los demás. */}
      <div
        aria-hidden
        className="mt-1.5 grid gap-[2px] sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${g.dias.length}, minmax(0, 1fr))` }}
      >
        {g.dias.map((d) => (
          <span
            key={d.dia}
            className={cn(
              "justify-self-center whitespace-nowrap text-xs tabular-nums",
              d.estado === "hoy" ? "font-medium text-gray-950" : d.estado === "sin-venta" ? "text-amber-700" : d.estado === "futuro" ? "text-gray-300" : "text-gray-500",
              !etiquetaEnCelular(d, g) && "invisible sm:visible",
            )}
          >
            {d.estado === "hoy" ? "Hoy" : d.dia}
          </span>
        ))}
      </div>
      {/* «vs 2025»: prende la raya de la misma fecha del año pasado. Es su leyenda también. */}
      {hayAA && (
        <button
          type="button"
          data-elemento="grafica-vs-anio"
          aria-pressed={comparar}
          onClick={() => setVsAA((v) => !v)}
          className={cn(
            "mt-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors active:scale-[0.97]",
            comparar ? "border-gray-900 text-gray-900" : "border-gray-300 text-gray-600",
          )}
        >
          <span aria-hidden className="h-[2px] w-3 rounded bg-blue-600" />
          vs {year - 1}
        </button>
      )}
    </div>
  );
}
