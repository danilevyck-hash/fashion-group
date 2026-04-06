"use client";

import { useState, useEffect, useRef } from "react";
import { fmt, fmtDate } from "@/lib/format";
import { AnimatedNumber } from "@/components/ui";
import { CajaPeriodo } from "./types";

interface Props {
  current: CajaPeriodo;
  totalGastado: number;
  saldo: number;
  pctUsed: number;
  onBack: () => void;
}

export default function PeriodoDetailHeader({
  current,
  totalGastado,
  saldo,
  pctUsed,
  onBack,
}: Props) {
  const [kpiTooltip, setKpiTooltip] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const prevPctUsed = useRef(pctUsed);
  const isOpen = current.estado === "abierto";

  useEffect(() => {
    if (pctUsed < 20 && prevPctUsed.current >= 20) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 500);
      return () => clearTimeout(t);
    }
    prevPctUsed.current = pctUsed;
  }, [pctUsed]);

  return (
    <>
      <button
        onClick={onBack}
        className="text-sm text-gray-400 hover:text-black transition mb-8 block"
      >
        ← Períodos
      </button>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <h1 className="text-xl font-light tracking-tight">
          Período N° {current.numero}
        </h1>
        <span className="text-sm text-gray-400">
          {fmtDate(current.fecha_apertura)}
        </span>
        {isOpen ? (
          <span className="text-[11px] bg-black text-white px-2.5 py-0.5 rounded-full">
            Abierto
          </span>
        ) : (
          <span className="text-[11px] bg-gray-200 text-gray-500 px-2.5 py-0.5 rounded-full">
            Cerrado — {fmtDate(current.fecha_cierre || "")}
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
        <div>
          <div className="flex items-center">
            <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1">
              Fondo
            </div>
            <button onClick={() => setKpiTooltip(kpiTooltip === "fondo" ? null : "fondo")} className="text-gray-300 hover:text-gray-500 text-xs ml-1 mb-1">?</button>
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            ${fmt(current.fondo_inicial)}
          </div>
          {kpiTooltip === "fondo" && <p className="text-xs text-gray-500 mt-1">Monto inicial asignado al período de caja menuda</p>}
        </div>
        <div>
          <div className="flex items-center">
            <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1">
              Gastado
            </div>
            <button onClick={() => setKpiTooltip(kpiTooltip === "gastado" ? null : "gastado")} className="text-gray-300 hover:text-gray-500 text-xs ml-1 mb-1">?</button>
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            $<AnimatedNumber value={totalGastado} formatter={(n: number) => fmt(n)} />
          </div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, current.fondo_inicial > 0 ? (totalGastado / current.fondo_inicial) * 100 : 0)}%`,
                transition: "width 500ms ease-out",
                backgroundColor: pctUsed < 10 ? "#dc2626" : pctUsed < 20 ? "#d97706" : "#059669",
              }}
            />
          </div>
          {kpiTooltip === "gastado" && <p className="text-xs text-gray-500 mt-1">Total de gastos registrados en este período</p>}
        </div>
        <div className={shaking ? "saldo-shake" : ""}>
          <div className="flex items-center">
            <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1">
              Saldo
            </div>
            <button onClick={() => setKpiTooltip(kpiTooltip === "saldo" ? null : "saldo")} className="text-gray-300 hover:text-gray-500 text-xs ml-1 mb-1">?</button>
          </div>
          <div
            className={`text-2xl font-semibold tabular-nums ${saldo < 0 ? "text-red-600" : ""}`}
          >
            $<AnimatedNumber value={saldo} formatter={(n: number) => fmt(n)} />
          </div>
          {kpiTooltip === "saldo" && <p className="text-xs text-gray-500 mt-1">Dinero disponible: Fondo menos lo gastado</p>}
        </div>
      </div>

      {/* Low balance alerts */}
      {pctUsed < 10 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
          <span className="text-red-500 text-base">&#9888;</span>
          <p className="text-sm text-red-700">
            Saldo bajo — quedan ${fmt(saldo)} de ${fmt(current.fondo_inicial)}{" "}
            ({pctUsed.toFixed(0)}%). Considera reabastecer el fondo.
          </p>
        </div>
      )}
      {pctUsed >= 10 && pctUsed < 20 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
          <span className="text-amber-500 text-base">&#9888;</span>
          <p className="text-sm text-amber-700">
            Saldo bajo — quedan ${fmt(saldo)} de ${fmt(current.fondo_inicial)}{" "}
            ({pctUsed.toFixed(0)}%). Considera reabastecer el fondo.
          </p>
        </div>
      )}
    </>
  );
}
