"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VentasResumen } from "./types";
import { MONTHS, QUARTERS, fmtMoney, fmtMoneyCompact, fmtPct, deltaSymbol, heatmapClasses } from "@/lib/ventas/format";
import { formatDeltaRatio } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";

type Granularity = "mensual" | "trimestral";
type ViewMode = "ventas" | "utilidad";
type Cell = { value: number | null; delta: number | null; prevValue: number; periodLabel: string };

interface ResumenViewProps {
  data: VentasResumen;
  availableYears: number[];
  selectedYear: number;
  isClosedYear: boolean;
  loading: boolean;
  error: string | null;
  onYearChange: (year: number) => void;
}

export function ResumenView({
  data, availableYears, selectedYear, isClosedYear, loading, error, onYearChange,
}: ResumenViewProps) {
  const [granularity, setGranularity] = useState<Granularity>("mensual");
  const [viewMode, setViewMode] = useState<ViewMode>("ventas");
  const [, startTransition] = useTransition();
  const k = data.kpis;
  const prevYear = selectedYear - 1;
  const isUtil = viewMode === "utilidad";
  const metricLabel = isUtil ? "Utilidad" : "Ventas";

  const onToggleMode = (mode: ViewMode) => {
    startTransition(() => setViewMode(mode));
  };

  const cols = granularity === "mensual" ? MONTHS : QUARTERS;
  const rows = data.empresas.map(e => {
    const cur  = isUtil ? e.utilidad2026 : e.ventas2026;
    const prev = isUtil ? e.utilidad2025 : e.ventas2025;
    return {
      ...buildRow(cur, prev, granularity, e.empresa, selectedYear),
      margenPct: e.margenPct,
      margenPctPrev: e.margenPctPrev,
    };
  });
  const totalCols = cols.map((_, ci) => {
    let v = 0, hasAny = false;
    rows.forEach(r => { if (r.cells[ci].value != null) { v += r.cells[ci].value!; hasAny = true; } });
    return hasAny ? v : null;
  });
  const totalColsPrev = cols.map((_, ci) =>
    rows.reduce((s, r) => s + (r.cells[ci].prevValue || 0), 0)
  );
  const totalYtd = rows.reduce((s, r) => s + r.total, 0);
  const totalPrevYtd = totalColsPrev.reduce((s, v) => s + v, 0);
  const totalYtdDelta = totalPrevYtd > 0 ? (totalYtd - totalPrevYtd) / totalPrevYtd : null;

  // KPIs según modo
  const ventasDelta   = k.ventas2025YTD   > 0 ? (k.ventasNetasYTD - k.ventas2025YTD) / k.ventas2025YTD : null;
  const utilidadDelta = k.utilidad2025YTD > 0 ? (k.utilidadYTD    - k.utilidad2025YTD) / k.utilidad2025YTD : null;
  const margenDeltaPts = (k.margenYTD - k.margen2025YTD) * 100;
  const margenSign = margenDeltaPts >= 0 ? "▲ +" : "▼ ";

  const periodoLabel = isClosedYear
    ? "Año completo"
    : `${MONTHS[0]}–${MONTHS[Math.max(0, data.mesActual - 1)]} ${selectedYear}`;

  let kpi1Label: string, kpi1Value: string, kpi1Sub: string;
  let kpi2Label: string, kpi2Value: string, kpi2Sub: string;

  if (isUtil) {
    kpi1Label = isClosedYear ? `UTILIDAD ${selectedYear}` : "UTILIDAD YTD";
    kpi1Value = fmtMoney(k.utilidadYTD);
    kpi1Sub   = `${periodoLabel} · ${deltaSymbol(utilidadDelta)} ${fmtPct(utilidadDelta)} vs ${prevYear}`;
    kpi2Label = "MARGEN PROMEDIO";
    kpi2Value = `${(k.margenYTD * 100).toFixed(1)}%`;
    kpi2Sub   = `${margenSign}${Math.abs(margenDeltaPts).toFixed(1)} pts vs ${prevYear}`;
  } else {
    kpi1Label = isClosedYear ? `VENTAS NETAS ${selectedYear}` : "VENTAS NETAS YTD";
    kpi1Value = fmtMoney(k.ventasNetasYTD);
    kpi1Sub   = `${periodoLabel} · ${deltaSymbol(ventasDelta)} ${fmtPct(ventasDelta)} vs ${prevYear}`;
    kpi2Label = isClosedYear ? `UTILIDAD ${selectedYear}` : "UTILIDAD YTD";
    kpi2Value = fmtMoney(k.utilidadYTD);
    kpi2Sub   = `Margen ${(k.margenYTD * 100).toFixed(1)}% · ${margenSign}${Math.abs(margenDeltaPts).toFixed(1)} pts vs ${prevYear}`;
  }

  return (
    <div className={cn("space-y-5", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {error && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar el año {selectedYear}: {error}
        </div>
      )}

      {/* KPI cards — 2 cols, swap content por viewMode */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <KpiCard label={kpi1Label} value={kpi1Value} sub={kpi1Sub} />
        <KpiCard label={kpi2Label} value={kpi2Value} sub={kpi2Sub} />
      </div>

      {/* Toolbar — leyenda · [Ventas|Utilidad] · year · Mensual/Trimestral */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-500">
          Mostrando {isUtil ? "utilidad " : ""}{granularity === "mensual" ? "mes a mes" : "por trimestre"} · comparando vs {prevYear}
        </p>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-stone-100 p-0.5 text-xs">
            {(["ventas", "utilidad"] as const).map(m => (
              <button
                key={m}
                onClick={() => onToggleMode(m)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-medium capitalize transition",
                  viewMode === m
                    ? "bg-white text-stone-950 shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                )}
              >
                {m === "ventas" ? "Ventas" : "Utilidad"}
              </button>
            ))}
          </div>
          <Select value={String(selectedYear)} onValueChange={v => onYearChange(parseInt(v, 10))}>
            <SelectTrigger className="h-8 w-auto min-w-[88px] gap-1.5 text-xs font-mono tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(y => (
                <SelectItem key={y} value={String(y)} className="font-mono tabular-nums">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="inline-flex rounded-full bg-stone-100 p-0.5 text-xs">
            {(["mensual", "trimestral"] as const).map(g => (
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
                  {r.cells.map((c, ci) => (
                    <HeatCell key={ci} cell={c} prevYear={prevYear} metricLabel={metricLabel} />
                  ))}
                  <EmpresaTotalCell
                    total={r.total}
                    showMargenTooltip={isUtil}
                    empresaNombre={r.empresa.nombre}
                    margenPct={r.margenPct}
                    margenPctPrev={r.margenPctPrev}
                    selectedYear={selectedYear}
                    prevYear={prevYear}
                  />
                </tr>
              ))}
              <tr className="bg-stone-950 text-white">
                <td className="sticky left-0 z-10 bg-stone-950 px-3.5 py-3 text-xs font-medium uppercase tracking-widest">Total Grupo</td>
                {totalCols.map((v, ci) => (
                  <TotalGroupCell
                    key={ci}
                    value={v}
                    prevValue={totalColsPrev[ci]}
                    periodLabel={`${cols[ci]} ${selectedYear}`}
                    prevYear={prevYear}
                    metricLabel={metricLabel}
                  />
                ))}
                <TotalGroupCell
                  isAnnual
                  value={totalYtd}
                  prevValue={totalPrevYtd}
                  periodLabel={`Total ${selectedYear}`}
                  prevYear={prevYear}
                  metricLabel={metricLabel}
                  delta={totalYtdDelta}
                />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
        <LegendItem swatch="bg-teal-100" label={`▲ vs ${prevYear} mayor a +5%`} />
        <LegendItem swatch="bg-white border border-stone-200" label="entre ±5%" />
        <LegendItem swatch="bg-orange-200" label="▼ menor a −5%" />
        {!isClosedYear && (
          <span className="inline-flex items-center gap-1.5"><span className="text-stone-400">—</span>sin data</span>
        )}
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

function HeatCell({ cell, prevYear, metricLabel }: { cell: Cell; prevYear: number; metricLabel: string }) {
  const cls = heatmapClasses(cell.delta);
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
  const prevPeriod = cell.periodLabel.replace(String(prevYear + 1), String(prevYear));
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
                {formatDeltaRatio(cell.delta).arrow && (
                  <span className={cn("text-[10px]", cls.fg)}>{formatDeltaRatio(cell.delta).arrow}</span>
                )}
                <span className="text-stone-950">{fmtMoneyCompact(cell.value)}</span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="min-w-[200px] border-0 bg-stone-950 p-3 text-white shadow-lg">
            <div className="flex justify-between gap-6 text-[11px] text-stone-300">
              <span>{metricLabel} {prevPeriod}</span>
              <span className="font-mono text-white tabular-nums">
                {cell.prevValue ? fmtMoney(cell.prevValue) : "—"}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-6 text-[11px]">
              <span className="text-stone-300">{metricLabel} {cell.periodLabel}</span>
              <span className="font-mono font-medium text-white tabular-nums">{fmtMoney(cell.value)}</span>
            </div>
            <div className="mt-2 flex justify-end border-t border-white/10 pt-1.5">
              <span className={cn(
                "font-mono text-[11px] font-medium",
                cell.delta == null ? "text-stone-300" :
                cell.delta > 0.05  ? "text-teal-300" :
                cell.delta < -0.05 ? "text-orange-300" : "text-stone-300"
              )}>
                {cell.delta == null
                  ? "sin comparativo"
                  : `${deltaSymbol(cell.delta)} ${fmtPct(cell.delta)} vs ${prevYear}`}
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}

/**
 * TOTAL anual por empresa (última columna). En modo Utilidad envuelve el
 * monto en Tooltip con margen real del año actual vs año previo. En modo
 * Ventas se renderiza como antes (sin tooltip).
 */
function EmpresaTotalCell({
  total, showMargenTooltip, empresaNombre, margenPct, margenPctPrev, selectedYear, prevYear,
}: {
  total: number;
  showMargenTooltip: boolean;
  empresaNombre: string;
  margenPct: number;
  margenPctPrev: number;
  selectedYear: number;
  prevYear: number;
}) {
  if (!showMargenTooltip) {
    return (
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">
        {fmtMoney(total)}
      </td>
    );
  }
  const deltaPts = (margenPct - margenPctPrev) * 100;
  const sign = deltaPts >= 0 ? "▲ +" : "▼ ";
  const tone =
    Math.abs(deltaPts) < 0.1 ? "text-stone-500" :
    deltaPts > 0              ? "text-emerald-700" : "text-orange-700";
  return (
    <td className="whitespace-nowrap border-b border-stone-200 p-0 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="block w-full cursor-help px-3.5 py-2.5 text-right outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30"
            >
              {fmtMoney(total)}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="min-w-[220px] border-0 bg-stone-950 p-3 text-white shadow-lg">
            <div className="text-[11px] font-medium text-white">{empresaNombre}</div>
            <div className="mt-1.5 flex justify-between gap-6 text-[11px] text-stone-300">
              <span>{selectedYear} actual</span>
              <span className="font-mono text-white tabular-nums">{(margenPct * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-6 text-[11px] text-stone-300">
              <span>{prevYear}</span>
              <span className="font-mono text-white tabular-nums">{(margenPctPrev * 100).toFixed(1)}%</span>
            </div>
            <div className="mt-2 flex justify-end border-t border-white/10 pt-1.5">
              <span className={cn("font-mono text-[11px] font-medium", tone)}>
                {sign}{Math.abs(deltaPts).toFixed(1)} pts vs {prevYear}
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  );
}

/**
 * Celda de la fila TOTAL GRUPO (fondo bg-stone-950). Muestra:
 *   ▲/▼/— (color según delta) + monto (blanco)
 * con tooltip que detalla {prev | actual | delta vs prevYear}.
 */
function TotalGroupCell({
  value, prevValue, periodLabel, prevYear, metricLabel, isAnnual = false, delta: deltaProp,
}: {
  value: number | null;
  prevValue: number;
  periodLabel: string;
  prevYear: number;
  metricLabel: string;
  isAnnual?: boolean;
  delta?: number | null;
}) {
  if (value == null) {
    return (
      <td className={cn(
        "whitespace-nowrap px-2.5 py-3 text-right font-mono text-xs tabular-nums",
        isAnnual && "px-3.5 text-sm font-semibold"
      )}>
        <span className="text-stone-500">—</span>
      </td>
    );
  }
  const delta = deltaProp !== undefined
    ? deltaProp
    : prevValue > 0 ? (value - prevValue) / prevValue : null;
  const arrowTone =
    delta == null     ? "text-stone-300"  :
    delta > 0.05      ? "text-emerald-400" :
    delta < -0.05     ? "text-orange-400"  : "text-stone-300";
  const prevPeriod = periodLabel.replace(String(prevYear + 1), String(prevYear));

  return (
    <td className={cn(
      "whitespace-nowrap p-0 text-right font-mono tabular-nums",
      isAnnual ? "text-sm font-semibold" : "text-xs"
    )}>
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "block w-full cursor-help text-right outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40",
                isAnnual ? "px-3.5 py-3" : "px-2.5 py-3"
              )}
            >
              <span className="inline-flex items-baseline gap-1.5">
                {formatDeltaRatio(delta).arrow && (
                  <span className={cn("text-[10px]", arrowTone)}>{formatDeltaRatio(delta).arrow}</span>
                )}
                <span className="text-white">{isAnnual ? fmtMoney(value) : fmtMoneyCompact(value)}</span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="min-w-[220px] border-0 bg-white p-3 text-stone-950 shadow-lg">
            <div className="flex justify-between gap-6 text-[11px] text-stone-500">
              <span>{metricLabel} {prevPeriod}</span>
              <span className="font-mono text-stone-950 tabular-nums">
                {prevValue ? fmtMoney(prevValue) : "—"}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-6 text-[11px]">
              <span className="text-stone-500">{metricLabel} {periodLabel}</span>
              <span className="font-mono font-medium text-stone-950 tabular-nums">{fmtMoney(value)}</span>
            </div>
            <div className="mt-2 flex justify-end border-t border-stone-200 pt-1.5">
              <span className={cn(
                "font-mono text-[11px] font-medium",
                delta == null ? "text-stone-500" :
                delta > 0.05  ? "text-emerald-700" :
                delta < -0.05 ? "text-orange-700"  : "text-stone-500"
              )}>
                {delta == null
                  ? "sin comparativo"
                  : `${deltaSymbol(delta)} ${fmtPct(delta)} vs ${prevYear}`}
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
  vCur: (number | null)[],
  vPrev: (number | null)[],
  granularity: Granularity,
  empresa: { id: string; nombre: string },
  year: number
): { empresa: typeof empresa; cells: Cell[]; total: number } {
  if (granularity === "mensual") {
    const cells: Cell[] = vCur.map((v, i) => {
      const prev = vPrev[i] ?? 0;
      const delta = v == null ? null : prev > 0 ? (v - prev) / prev : null;
      return { value: v, delta, prevValue: prev, periodLabel: `${MONTHS[i]} ${year}` };
    });
    return { empresa, cells, total: cells.reduce((s, c) => s + (c.value || 0), 0) };
  }
  const groups = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
  const cells: Cell[] = groups.map((q, qi) => {
    const has = q.some(i => vCur[i] != null);
    const v = q.reduce((s, i) => vCur[i] == null ? s : s + (vCur[i] as number), 0);
    const prev = q.reduce((s, i) => s + (vPrev[i] || 0), 0);
    return {
      value: has ? v : null,
      delta: !has ? null : prev > 0 ? (v - prev) / prev : null,
      prevValue: prev,
      periodLabel: `${QUARTERS[qi]} ${year}`,
    };
  });
  return { empresa, cells, total: cells.reduce((s, c) => s + (c.value || 0), 0) };
}
