"use client";

import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";

function riskInfo(total: number, current: number, watch: number, overdue: number): { border: string; tooltip: string } {
  if (total < 0) return { border: "border-l-blue-400", tooltip: "Saldo a favor: saldo negativo (nota de credito o sobrepago)" };
  if (overdue > 0) return { border: "border-l-red-500", tooltip: "Vencido critico: deuda con mas de 120 dias" };
  if (watch > 0) return { border: "border-l-amber-400", tooltip: "Vencido reciente: deuda con 91 a 120 dias" };
  return { border: "border-l-emerald-500", tooltip: "Por vencer: deuda dentro del plazo (0 a 90 dias)" };
}

interface Props {
  client: ConsolidatedClient;
  isExpanded: boolean;
  onToggle: () => void;
  userRole: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRowContextMenu?: (e: React.MouseEvent) => void;
}

export default function ClientRow({ client, isExpanded, onToggle, userRole, isFavorite, onToggleFavorite, onRowContextMenu }: Props) {
  const risk = riskInfo(client.total, client.current, client.watch, client.overdue);

  return (
    <>
      <div className={`border-l-4 ${risk.border} group`} data-tooltip={risk.tooltip}>
        {/* Mobile card layout — name + total + status badge, age buckets on expand */}
        <div
          className={`sm:hidden px-3 py-3 cursor-pointer transition-colors border-b border-gray-200 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
          onClick={onToggle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {onToggleFavorite && (
                <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} className="flex-shrink-0 text-sm leading-none">
                  {isFavorite ? <span className="text-amber-400">★</span> : <span className="text-gray-300">☆</span>}
                </button>
              )}
              <span className="text-sm font-medium truncate" title={client.nombre_normalized}>{client.nombre_normalized}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {/* Status badge */}
              {client.total < 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Saldo a favor</span>
              ) : client.overdue > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Vencido crítico</span>
              ) : client.watch > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Vencido reciente</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Por vencer</span>
              )}
              <span className="text-sm font-semibold tabular-nums">${fmt(client.total)}</span>
              {/* Expand chevron */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
          {/* Age buckets — revealed on expand (mobile only) */}
          {isExpanded && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="bg-emerald-50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-emerald-600 font-medium">0-90d</div>
                <div className="tabular-nums text-emerald-800 font-semibold">{client.current === 0 ? <span className="text-gray-300">—</span> : `$${fmt(client.current)}`}</div>
              </div>
              <div className="bg-amber-50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-amber-600 font-medium">91-120d</div>
                <div className="tabular-nums text-amber-800 font-semibold">{client.watch === 0 ? <span className="text-gray-300">—</span> : `$${fmt(client.watch)}`}</div>
              </div>
              <div className="bg-red-50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-red-600 font-medium">121d+</div>
                <div className="tabular-nums text-red-800 font-semibold">{client.overdue === 0 ? <span className="text-gray-300">—</span> : `$${fmt(client.overdue)}`}</div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop grid layout */}
        <div
          className={`hidden sm:grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm cursor-pointer transition-colors border-b border-gray-200 ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50/70"}`}
          onClick={onToggle}
          onContextMenu={onRowContextMenu}
        >
          <>
            <div className="col-span-4 font-medium truncate flex items-center gap-1.5">
              {onToggleFavorite && (
                <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} className="flex-shrink-0 text-sm leading-none hover:scale-110 transition-transform">
                  {isFavorite ? <span className="text-amber-400">★</span> : <span className="text-gray-300 group-hover:text-gray-400">☆</span>}
                </button>
              )}
              <svg width="10" height="10" viewBox="0 0 10 10" className={`flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor">
                <path d="M3 1l5 4-5 4V1z"/>
              </svg>
              <span className="truncate" title={client.nombre_normalized}>{client.nombre_normalized}</span>
            </div>
            <div className="col-span-2 text-right tabular-nums text-emerald-700">{client.current === 0 ? <span className="text-gray-300">—</span> : fmt(client.current)}</div>
            <div className="col-span-2 text-right tabular-nums text-amber-600">{client.watch === 0 ? <span className="text-gray-300">—</span> : fmt(client.watch)}</div>
            <div className="col-span-2 text-right tabular-nums text-red-600">
              {client.overdue === 0 ? <span className="text-gray-300">—</span> : fmt(client.overdue)}
            </div>
            <div className="col-span-2 text-right tabular-nums font-semibold relative">
              {fmt(client.total)}
            </div>
          </>
        </div>
      </div>

    </>
  );
}
