"use client";

// Un mes para atrás / un mes para adelante. Nunca meses futuros: la contabilidad
// va meses atrasada, así que ofrecer agosto en agosto sólo produciría pantallas
// vacías. Blancos táctiles de 44 px.

import { mesLargo, mesMas } from "./tipos";
import PanelPeriodo from "@/components/ui/PanelPeriodo";
import { aniosDeGastos, mesesDeGastos } from "@/lib/egresos/apple-2026-10";

interface Props {
  mes: string;
  /** Tope: el mes en curso. No se puede pasar de acá. */
  mesTope: string;
  onCambiar: (mes: string) => void;
  /**
   * `GASTOS_APPLE_2026_10`: el panel de período compacto de la casa
   * (‹ Octubre 2026 ⌄ ›, la grilla de meses al tocar). Solo meses: la consulta
   * es por mes, así que no hay «Rango».
   */
  compacto?: boolean;
}

const MAYUSCULA = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function SelectorMes({ mes, mesTope, onCambiar, compacto = false }: Props) {
  const anterior = mesMas(mes, -1);
  const siguiente = mesMas(mes, 1);
  const haySiguiente = siguiente <= mesTope;

  if (compacto) {
    const [a, m] = mes.split("-").map(Number);
    const flecha = "inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 active:scale-[0.97] disabled:pointer-events-none disabled:text-gray-300";
    return (
      <div data-selector-mes="compacto" className="inline-flex items-center gap-0.5">
        <button type="button" onClick={() => onCambiar(anterior)} aria-label={`Ver ${mesLargo(anterior)}`} className={flecha}>‹</button>
        <PanelPeriodo
          rotulo={MAYUSCULA(mesLargo(mes))}
          anios={aniosDeGastos(mesTope)}
          mesesDe={(anio) => mesesDeGastos(anio, mesTope)}
          seleccion={{ anio: a, mes: m }}
          onMes={(anio, mm) => onCambiar(`${anio}-${String(mm).padStart(2, "0")}`)}
        />
        <button
          type="button"
          onClick={() => haySiguiente && onCambiar(siguiente)}
          disabled={!haySiguiente}
          aria-label={haySiguiente ? `Ver ${mesLargo(siguiente)}` : "No hay meses más nuevos"}
          className={flecha}
        >
          ›
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
      <button
        type="button"
        onClick={() => onCambiar(anterior)}
        aria-label={`Ver ${mesLargo(anterior)}`}
        className="flex h-11 w-11 items-center justify-center rounded-md text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
          <path d="M12.5 4L7 10l5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <span className="text-sm font-semibold capitalize text-gray-900">{mesLargo(mes)}</span>

      <button
        type="button"
        onClick={() => haySiguiente && onCambiar(siguiente)}
        disabled={!haySiguiente}
        aria-label={haySiguiente ? `Ver ${mesLargo(siguiente)}` : "No hay meses más nuevos"}
        className="flex h-11 w-11 items-center justify-center rounded-md text-gray-700 transition hover:bg-gray-50 active:scale-[0.97] disabled:pointer-events-none disabled:text-gray-300"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
          <path d="M7.5 4L13 10l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
