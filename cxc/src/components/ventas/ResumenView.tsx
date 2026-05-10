"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { VentasResumen } from "./types";
import { MONTHS, QUARTERS, fmtMoney, fmtMoneyCompact, fmtPct, deltaSymbol, heatmapClasses } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

type Granularity = "mensual" | "trimestral";
type Cell = { value: number | null; delta: number | null; prevValue: number; periodLabel: string };

export function ResumenView({ data }: { data: VentasResumen }) {
  const [granularity, setGranularity] = useState<Granularity>("mensual");
  const k = data.kpis;

  const cols = granularity === "mensual" ? MONTHS : QUARTERS;
  const rows = data.empresas.map(e => buildRow(e.ventas2026, e.ventas2025, granularity, e.empresa));
  const totalCols = cols.map((_, ci) => {
    let v = 0, hasAny = false;
    rows.forEach(r => { if (r.cells[ci].value != null) { v += r.cells[ci].value!; hasAny = true; } });
    return hasAny ? v : null;
  });
  const totalYtd = rows.reduce((s,r) => s + r.total, 0);
  const ventasDelta = (k.ventasNetasYTD - k.ventas2025YTD) / k.ventas2025YTD;

  return (
    <div className="space-y-5">
      {/* KPI cards — 2 cols, no Multifashion KPI here */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <KpiCard
          label="VENTAS NETAS YTD"
          value={fmtMoney(k.ventasNetasYTD)}
          sub={`${MONTHS[0]}–${MONTHS[data.mesActual - 1]} 2026 · ${deltaSymbol(ventasDelta)} ${fmtPct(ventasDelta)} vs 2025`}
        />
        <KpiCard
          label="UTILIDAD YTD"
          value={fmtMoney(k.utilidadYTD)}
          sub={`Margen ${(k.margenYTD * 100).toFixed(1)}% · ▲ +${((k.margenYTD - k.margen2025YTD) * 100).toFixed(1)} pts`}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">
          Mostrando {granularity === "mensual" ? "mes a mes" : "por trimestre"} · comparando vs 2025
        </p>
        <div className="inline-flex rounded-full bg-stone-100 p-0.5 text-xs">
          {(["mensual","trimestral"] as const).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={cn(
                "rounded-full px-3.5 py-1.5 font-medium transition",
                granularity === g
                  ? "bg-white text-stone-950 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              )}
            >
              {g === "mensual" ? "Mensual" : "Trimestral"}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: granularity === "mensual" ? 1100 : 700 }}>
            <thead>
              <tr className="bg-stone-100 text-left">
                <th className="sticky left-0 z-10 min-w-[180px] bg-stone-100 px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-stone-500">
                  Empresa
                </th>
                {cols.map(c => (
                  <th key={c} className="px-2.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">
                    {c}
                  </th>
                ))}
                <th className="px-3.5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-stone-950">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.empresa.id} className={r.empresa.id === "multi" ? "bg-teal-50/60" : ""}>
                  <td className={cn(
                    "sticky left-0 z-10 whitespace-nowrap border-b border-stone-200 px-3.5 py-2.5 text-sm text-stone-950",
                    r.empresa.id === "multi" ? "bg-teal-50" : "bg-white"
                  )}>
                    <span className="inline-flex items-center gap-1.5">
                      {r.empresa.nombre}
                    </span>
                  </td>
                  {r.cells.map((c, ci) => <HeatCell key={ci} cell={c} />)}
                  <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">
                    {fmtMoney(r.total)}
                  </td>
                </tr>
              ))}
              <tr className="bg-stone-950 text-white">
                <td className="sticky left-0 z-10 bg-stone-950 px-3.5 py-3 text-xs font-medium uppercase tracking-widest">Total Grupo</td>
                {totalCols.map((v, ci) => (
                  <td key={ci} className="px-2.5 py-3 text-right font-mono text-xs tabular-nums">
                    {v == null ? <span className="text-stone-500">—</span> : fmtMoneyCompact(v)}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3.5 py-3 text-right font-mono text-sm font-semibold tabular-nums">{fmtMoney(totalYtd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend (colorblind-safe: symbols always present) */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
        <LegendItem swatch="bg-teal-100" label="▲ vs 2025 mayor a +5%" />
        <LegendItem swatch="bg-white border border-stone-200" label="— entre ±5%" />
        <LegendItem swatch="bg-orange-200" label="▼ menor a −5%" />
        <span className="inline-flex items-center gap-1.5"><span className="text-stone-400">—</span>mes futuro</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className={cn(
      "p-4",
      accent ? "border-teal-100 bg-teal-50" : "border-stone-200 bg-white"
    )}>
      <p className={cn("text-[10.5px] font-medium uppercase tracking-widest", accent ? "text-teal-800" : "text-stone-500")}>{label}</p>
      <p className={cn(
        "mt-1.5 font-mono text-[26px] font-medium leading-tight tracking-tight tabular-nums",
        accent ? "text-teal-900" : "text-stone-950"
      )}>{value}</p>
      {sub && <p className={cn("mt-1.5 text-xs", accent ? "text-teal-800" : "text-stone-500")}>{sub}</p>}
    </Card>
  );
}

function HeatCell({ cell }: { cell: Cell }) {
  const cls = heatmapClasses(cell.delta);
  // Empty cell (future months / no data): no tooltip, just dash.
  if (cell.value == null) {
    return (
      <td className={cn(
        "whitespace-nowrap border-b border-stone-200 px-2.5 py-2.5 text-right font-mono text-xs tabular-nums",
        cls.bg
      )}>
        <span className="text-stone-400">—</span>
      </td>
    );
  }
  // Cell with data: ONLY money + symbol visible. % shown inside tooltip.
  return (
    <td className={cn(
      "whitespace-nowrap border-b border-stone-200 p-0 text-right font-mono text-xs tabular-nums transition",
      cls.bg
    )}>
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="block w-full cursor-help px-2.5 py-2.5 text-right outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30"
            >
              <span className="inline-flex items-baseline gap-1.5">
                <span className={cn("text-[10px]", cls.fg)}>{deltaSymbol(cell.delta)}</span>
                <span className="text-stone-950">{fmtMoneyCompact(cell.value)}</span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="min-w-[200px] border-0 bg-stone-950 p-3 text-white shadow-lg">
            <div className="flex justify-between gap-6 text-[11px] text-stone-300">
              <span>{cell.periodLabel.replace("2026", "2025")}</span>
              <span className="font-mono text-white tabular-nums">
                {cell.prevValue ? fmtMoney(cell.prevValue) : "—"}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-6 text-[11px]">
              <span className="text-stone-300">{cell.periodLabel}</span>
              <span className="font-mono font-medium text-white tabular-nums">{fmtMoney(cell.value)}</span>
            </div>
            <div className="mt-2 flex justify-end border-t border-white/10 pt-1.5">
              <span className={cn(
                "font-mono text-[11px] font-medium",
                cell.delta == null ? "text-stone-300" :
                cell.delta > 0.05  ? "text-teal-300" :
                cell.delta < -0.05 ? "text-orange-300" : "text-stone-300"
              )}>
                {deltaSymbol(cell.delta)} {fmtPct(cell.delta)} vs 2025
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3.5 w-3.5 rounded-sm", swatch)} />
      {label}
    </span>
  );
}

function buildRow(
  v26: (number | null)[],
  v25: (number | null)[],
  granularity: Granularity,
  empresa: { id: string; nombre: string }
): { empresa: typeof empresa; cells: Cell[]; total: number } {
  if (granularity === "mensual") {
    const cells: Cell[] = v26.map((v, i) => {
      const prev = v25[i] ?? 0;
      const delta = v == null ? null : prev > 0 ? (v - prev) / prev : null;
      return { value: v, delta, prevValue: prev, periodLabel: `${MONTHS[i]} 2026` };
    });
    return { empresa, cells, total: cells.reduce((s,c) => s + (c.value || 0), 0) };
  }
  const groups = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]];
  const cells: Cell[] = groups.map((q, qi) => {
    const has26 = q.some(i => v26[i] != null);
    const v = q.reduce((s,i) => v26[i] == null ? s : s + (v26[i] as number), 0);
    const prev = q.reduce((s,i) => s + (v25[i] || 0), 0);
    return {
      value: has26 ? v : null,
      delta: !has26 ? null : prev > 0 ? (v - prev) / prev : null,
      prevValue: prev,
      periodLabel: `${QUARTERS[qi]} 2026`,
    };
  });
  return { empresa, cells, total: cells.reduce((s,c) => s + (c.value || 0), 0) };
}
