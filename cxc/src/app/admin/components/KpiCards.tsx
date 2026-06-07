"use client";

import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtCompact } from "@/lib/format";

type RiskFilter = "all" | "current" | "watch" | "overdue";

interface Props {
  roleClients: ConsolidatedClient[];
  riskFilter: RiskFilter;
  onRiskFilterChange: (filter: RiskFilter) => void;
}

export default function KpiCards({ roleClients, riskFilter, onRiskFilterChange }: Props) {
  const totalCxc = roleClients.reduce((s, c) => s + c.total, 0);
  const totalCurrent = roleClients.reduce((s, c) => s + c.current, 0);
  const totalWatch = roleClients.reduce((s, c) => s + c.watch, 0);
  const totalOverdue = roleClients.reduce((s, c) => s + c.overdue, 0);
  const criticalClients = roleClients.filter((c) => c.overdue > 0).length;
  const watchClients = roleClients.filter((c) => c.watch > 0).length;
  const currentClients = roleClients.filter((c) => c.overdue === 0 && c.watch === 0).length;

  const cards: { key: RiskFilter; label: string; value: number; count: number; dot: string; color: string; activeColor: string }[] = [
    { key: "all", label: "Total Pendiente", value: totalCxc, count: roleClients.length, dot: "", color: "text-gray-900", activeColor: "border-gray-800" },
    { key: "current", label: "Por vencer", value: totalCurrent, count: currentClients, dot: "bg-emerald-500", color: "text-emerald-700", activeColor: "border-emerald-600" },
    { key: "watch", label: "Vencido reciente", value: totalWatch, count: watchClients, dot: "bg-amber-500", color: "text-amber-700", activeColor: "border-amber-500" },
    { key: "overdue", label: "Vencido crítico", value: totalOverdue, count: criticalClients, dot: "bg-red-500", color: "text-red-700", activeColor: "border-red-500" },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {cards.map((card) => {
        const isActive = riskFilter === card.key;
        return (
          <button
            key={card.key}
            onClick={() => onRiskFilterChange(card.key)}
            aria-pressed={isActive}
            title={`${card.label}: $${fmt(card.value)} · ${card.count} clientes — clic para filtrar la lista`}
            className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-2.5 sm:px-3 py-1.5 text-xs cursor-pointer transition-all ${
              isActive
                ? `border-2 ${card.activeColor} bg-white shadow-sm`
                : "border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300"
            }`}
          >
            {card.dot && <span className={`inline-block w-2 h-2 rounded-full ${card.dot}`} />}
            <span className="font-medium text-gray-700">{card.label}</span>
            <span className={`tabular-nums font-semibold ${card.color}`}>
              <span className="sm:hidden">{fmtCompact(card.value)}</span>
              <span className="hidden sm:inline">${fmt(card.value)}</span>
            </span>
            <span className="text-gray-400 tabular-nums">· {card.count}</span>
          </button>
        );
      })}
    </div>
  );
}
