"use client";

import { fmt, fmtDate } from "@/lib/format";
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
  const isOpen = current.estado === "abierto";

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
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1">
            Fondo
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            ${fmt(current.fondo_inicial)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1">
            Gastado
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            ${fmt(totalGastado)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1">
            Saldo
          </div>
          <div
            className={`text-2xl font-semibold tabular-nums ${saldo < 0 ? "text-red-600" : ""}`}
          >
            ${fmt(saldo)}
          </div>
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
