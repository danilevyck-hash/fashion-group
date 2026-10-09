"use client";

// La gráfica de ventas diarias de `MULTIFASHION_GRAFICA_2026_10` (ver
// `lib/multifashion/grafica-mes.ts`). La misma pieza en la computadora y en el
// celular: barras por día sin eje, el promedio en una línea tenue y el día
// tocado (o con el mouse encima) arriba, en una línea.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { etiquetaEnCelular, graficaDelMes, lineaDeLaGrafica, type EstadoDia } from "@/lib/multifashion/grafica-mes";

const BARRA: Record<EstadoDia, string> = {
  venta: "bg-gray-400",
  ultimo: "bg-gray-900",
  "sin-venta": "bg-amber-500",
  cerrado: "bg-gray-200",
  hoy: "border border-dashed border-gray-400 bg-transparent",
  futuro: "bg-gray-100",
};

export function GraficaDelMes({
  dias, year, mes, esMesActual, diaActual, feriados,
}: {
  dias: readonly { dia: number; ventas: number; n_tickets: number }[];
  year: number;
  mes: number;
  esMesActual: boolean;
  diaActual: number;
  feriados?: readonly string[] | null;
}) {
  const g = useMemo(
    () => graficaDelMes({ dias, year, mes, esMesActual, diaActual, feriados }),
    [dias, year, mes, esMesActual, diaActual, feriados],
  );
  const [tocado, setTocado] = useState<number | null>(null);
  const linea = lineaDeLaGrafica(g, year, mes, tocado);

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
        className="relative mt-3 flex h-[120px] cursor-pointer touch-pan-y items-end gap-[2px] sm:h-[180px] sm:gap-1"
        onPointerMove={(e) => { if (e.pointerType === "mouse") setTocado(diaEn(e)); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setTocado(null); }}
        onPointerUp={(e) => {
          if (e.pointerType === "mouse") return;
          const d = diaEn(e);
          setTocado((t) => (t === d ? null : d));
        }}
      >
        {g.promedioAlto != null && (
          <span
            data-elemento="grafica-promedio"
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-300"
            style={{ bottom: `${g.promedioAlto * 100}%` }}
          />
        )}
        {g.dias.map((d) => (
          <span
            key={d.dia}
            data-dia={d.dia}
            data-estado={d.estado}
            className={cn(
              "flex-1 rounded-t-[3px] transition-opacity",
              BARRA[d.estado],
              tocado != null && d.dia !== tocado && "opacity-30",
              tocado === d.dia && d.estado === "venta" && "bg-gray-900",
            )}
            style={{
              height: d.estado === "hoy" || d.estado === "futuro" || d.alto === 0
                ? (d.estado === "futuro" ? "2px" : "4px")
                : `${Math.max(3, d.alto * 100)}%`,
            }}
          />
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
    </div>
  );
}
