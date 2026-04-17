"use client";

import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtCompact } from "@/lib/format";
import { AnimatedNumber } from "@/components/ui";

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

  const cards: { key: RiskFilter; label: string; sublabel: string; value: number; count: number; countLabel: string; color: string; activeColor: string }[] = [
    {
      key: "all",
      label: "Total Pendiente",
      sublabel: "",
      value: totalCxc,
      count: roleClients.length,
      countLabel: "clientes",
      color: "text-gray-900",
      activeColor: "border-gray-800",
    },
    {
      key: "current",
      label: "Corriente",
      sublabel: "0-90d",
      value: totalCurrent,
      count: currentClients,
      countLabel: "clientes",
      color: "text-emerald-700",
      activeColor: "border-emerald-600",
    },
    {
      key: "watch",
      label: "Vigilancia",
      sublabel: "91-120d",
      value: totalWatch,
      count: watchClients,
      countLabel: "clientes",
      color: "text-amber-700",
      activeColor: "border-amber-500",
    },
    {
      key: "overdue",
      label: "Vencido",
      sublabel: "+121d",
      value: totalOverdue,
      count: criticalClients,
      countLabel: "clientes",
      color: "text-red-700",
      activeColor: "border-red-500",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      {cards.map((card) => {
        const isActive = riskFilter === card.key;
        return (
          <button
            key={card.key}
            onClick={() => onRiskFilterChange(card.key)}
            className={`rounded-lg px-3 py-2.5 text-left transition-all ${
              isActive
                ? `border-2 ${card.activeColor} bg-white`
                : "border border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-tight">
              {card.label}{card.sublabel ? ` ${card.sublabel}` : ""}
            </div>
            <div className={`text-lg font-bold tabular-nums mt-0.5 ${card.color}`} title={`$${fmt(card.value)}`}>
              <span className="sm:hidden">{fmtCompact(card.value)}</span>
              <span className="hidden sm:inline">$<AnimatedNumber value={card.value} formatter={(n: number) => fmt(n)} /></span>
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {card.count} {card.countLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
}
