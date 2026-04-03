"use client";

import { fmt } from "@/lib/format";
import { progressColor, progressColorText } from "./types";

interface Props {
  prestado: number;
  pagado: number;
  saldo: number;
  pct: number;
}

export default function SummaryCards({ prestado, pagado, saldo, pct }: Props) {
  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide">Total Prestado</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">${fmt(prestado)}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide">Total Pagado</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums text-green-600">${fmt(pagado)}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide">Saldo Pendiente</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums text-red-600">${fmt(saldo)}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Progreso de pago</span>
          <span className={`text-sm font-medium tabular-nums ${progressColorText(pct)}`}>{pct.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${progressColor(pct)} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
    </>
  );
}
