"use client";

import { fmt } from "@/lib/format";
import { progressColor, progressColorText } from "./types";

interface Props {
  prestado: number;
  pagado: number;
  saldo: number;
  pct: number;
  quincenaEstado?: "deducida" | "pendiente" | null;
}

export default function SummaryCards({ prestado, pagado, saldo, pct, quincenaEstado }: Props) {
  const saldoColor = saldo > 0 ? "text-red-600" : saldo < 0 ? "text-blue-600" : "text-gray-400";
  return (
    <div className="rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex items-start justify-between gap-3">
        {/* Saldo como héroe + Prestado/Pagado al pie */}
        <div className="min-w-0">
          <div className="text-xs text-gray-400 uppercase tracking-wide">
            {saldo < 0 ? "Saldo a favor" : "Saldo pendiente"}
          </div>
          <div className={`text-3xl font-semibold tabular-nums mt-0.5 ${saldoColor}`}>
            ${fmt(Math.abs(saldo))}
          </div>
          <div className="text-sm text-gray-500 mt-1 tabular-nums">
            Prestado ${fmt(prestado)} · Pagado ${fmt(pagado)}
          </div>
        </div>

        {/* Chip de quincena */}
        {quincenaEstado === "deducida" && (
          <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium">✓ Deducida esta quincena</span>
        )}
        {quincenaEstado === "pendiente" && (
          <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium">⚠ Deducción pendiente</span>
        )}
      </div>

      {/* Progreso de pago */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Progreso de pago</span>
          <span className={`text-sm font-medium tabular-nums ${progressColorText(pct)}`}>{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${progressColor(pct)} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
