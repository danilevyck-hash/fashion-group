"use client";

import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtCompact } from "@/lib/format";
import { AGING, AGING_ORDER, tramoLabel, type AgingKey } from "@/lib/cxc-aging";

type RiskFilter = "all" | AgingKey;

// Borde y fondo del estado activo por tramo (no vive en cxc-aging: ese módulo
// expone dot/text; el look del pill activo es propio de este KPI).
const ACTIVE_BORDER: Record<AgingKey, string> = {
  current: "border-emerald-600",
  watch: "border-amber-500",
  overdue: "border-red-500",
};

// Fondo tenue del pill activo: la píldora encendida tiene que verse encendida de
// un vistazo, no solo por un borde de 2px (Daniel: "no parecen tocables").
const ACTIVE_BG: Record<RiskFilter, string> = {
  all: "bg-gray-50",
  current: "bg-emerald-50",
  watch: "bg-amber-50",
  overdue: "bg-red-50",
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
      // 🔴 EL NOMBRE COMPLETO, el MISMO que dicen el celular y el papel. Antes
      // acá decía solo el rango ("0-90d") y en el celular solo el nombre ("Por
      // vencer"): el mismo botón con dos nombres. Sale de `cxc-aging`, que es
      // la única lista.
      label: tramoLabel(k),
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
        // Una sola acción: filtra la lista Y la ordena por ese tramo, de mayor a
        // menor. Tocar la píldora encendida la apaga (el padre resuelve el toggle).
        const titulo = isActive
          ? `${card.label}: $${fmt(card.value)} · ${card.count} clientes — clic para quitar el filtro`
          : card.key === "all"
            ? `${card.label}: $${fmt(card.value)} · ${card.count} clientes — clic para ver todos, ordenados por total`
            : `${card.label}: $${fmt(card.value)} · ${card.count} clientes — clic para ver solo estos, ordenados por lo que deben en ${card.label}`;
        return (
          <button
            key={card.key}
            onClick={() => onRiskFilterChange(card.key)}
            aria-pressed={isActive}
            title={titulo}
            className={`inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-3 sm:px-4 min-h-[44px] text-xs cursor-pointer transition-all active:scale-[0.97] ${
              isActive
                ? `border-2 ${card.activeColor} ${ACTIVE_BG[card.key]} shadow-sm`
                : "border border-gray-300 bg-white hover:bg-gray-100 hover:border-gray-500 hover:shadow-sm"
            }`}
          >
            {card.dot && <span className={`inline-block w-2 h-2 rounded-full ${card.dot}`} />}
            <span className={`${isActive ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>{card.label}</span>
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
