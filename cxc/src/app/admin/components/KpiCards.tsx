"use client";

import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtCompact } from "@/lib/format";
import { AGING, AGING_ORDER, type AgingKey } from "@/lib/cxc-aging";

type RiskFilter = "all" | AgingKey;

// Borde del estado activo por tramo (no vive en cxc-aging: ese módulo expone
// dot/text; el color del borde del pill activo es propio de este KPI).
const ACTIVE_BORDER: Record<AgingKey, string> = {
  current: "border-emerald-600",
  watch: "border-amber-500",
  overdue: "border-red-500",
};

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

  const valueByKey: Record<AgingKey, { value: number; count: number }> = {
    current: { value: totalCurrent, count: currentClients },
    watch: { value: totalWatch, count: watchClients },
    overdue: { value: totalOverdue, count: criticalClients },
  };

  // Labels, dot y color salen de cxc-aging (fuente única). El borde activo y la
  // tarjeta "all" (Total Pendiente) son propios de este KPI.
  const cards: { key: RiskFilter; label: string; value: number; count: number; dot: string; color: string; activeColor: string }[] = [
    { key: "all", label: "Total Pendiente", value: totalCxc, count: roleClients.length, dot: "", color: "text-gray-900", activeColor: "border-gray-800" },
    ...AGING_ORDER.map((k) => ({
      key: k,
      label: AGING[k].colLabel, // solo el rango (formato idéntico a las columnas de la tabla)
      value: valueByKey[k].value,
      count: valueByKey[k].count,
      dot: AGING[k].dot,
      color: AGING[k].text,
      activeColor: ACTIVE_BORDER[k],
    })),
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
