"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { MONTHS, fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaFormat } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";

type ViewMode = "ventas" | "utilidad" | "margen";

interface Vals { ventas: number; costo: number; utilidad: number }
interface Cell extends Vals { prev: Vals | null }
export interface EmpresaMesAnio {
  id: string;
  nombre: string;
  byMonth: Record<number, Record<number, Cell>>;  // [mes 1..12][anio]
  totalByYear: Record<number, Vals>;
  totalByMonth: Record<number, Vals>;
  grandTotal: Vals;
}
export interface MesAnioData {
  years: number[];
  currentYear: number | null;
  partial: { year: number; month: number } | null;
  earliestPartial: { year: number; label: string } | null;
  empresas: EmpresaMesAnio[];
}

// Fetcher puro del resumen mes×año (toda la data en una respuesta; abrir el
// panel de otra empresa NO refetchea — filtra en cliente).
async function fetchMesAnio(): Promise<MesAnioData> {
  const res = await fetch("/api/ventas/mes-anio", { cache: "no-store" });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new Error(e?.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as MesAnioData;
}

// Carga (cacheada vía SWR) el resumen mes×año. enabled evita el fetch hasta que
// el usuario abre el panel de una empresa (clave null → SWR no dispara). La
// caché vive a nivel app (SWRProvider) → reabrir pinta al instante. Compartido
// por la vista desktop y la mobile.
export function useResumenMesAnio(enabled: boolean): { data: MesAnioData | null; error: string | null } {
  const { data, error } = useSWR<MesAnioData>(
    enabled ? "ventas-resumen-mes-anio" : null,
    fetchMesAnio,
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  return {
    data: data ?? null,
    error: error ? (error instanceof Error ? error.message : "Error al cargar") : null,
  };
}

// Mismo guard que el resto del módulo: bajo $100 de ventas el margen no informa.
const MARGEN_VENTAS_MIN = 100;
const zeroVals = (): Vals => ({ ventas: 0, costo: 0, utilidad: 0 });

function metricValue(v: Vals | null, mode: ViewMode): number | null {
  if (!v) return null;
  if (mode === "margen") return v.ventas < MARGEN_VENTAS_MIN ? null : v.utilidad / v.ventas;
  return mode === "utilidad" ? v.utilidad : v.ventas;
}

// Valor de celda en la matriz (compacto: $1.2M / $345K / 42.3%).
function renderCompact(v: number | null, mode: ViewMode): string {
  if (v == null) return "—";
  if (mode === "margen") return (v * 100).toFixed(1) + "%";
  return fmtMoneyCompact(v);
}

// Δ de la celda: pct para ventas/utilidad, pts para margen. prev null → sin Δ.
function cellDelta(cur: Vals, prev: Vals | null, mode: ViewMode): DeltaFormat {
  if (!prev) return formatDeltaRatio(null);
  if (mode === "margen") {
    const cm = metricValue(cur, "margen");
    const pm = prev.ventas < MARGEN_VENTAS_MIN ? null : prev.utilidad / prev.ventas;
    if (cm == null || pm == null) return formatDeltaRatio(null);
    return formatDeltaRatio(cm - pm, "pts");
  }
  const cv = mode === "utilidad" ? cur.utilidad : cur.ventas;
  const pv = mode === "utilidad" ? prev.utilidad : prev.ventas;
  if (pv <= 0) return formatDeltaRatio(null);
  return formatDeltaRatio((cv - pv) / pv, "pct");
}

// Δ discreto — color sutil, nunca gritón.
const deltaTone: Record<string, string> = {
  emerald: "text-emerald-600",
  orange: "text-red-500",
  stone: "text-stone-400",
};

const METRIC_LABEL: Record<ViewMode, string> = {
  ventas: "Ventas",
  utilidad: "Utilidad",
  margen: "Margen",
};

// ─────────────────────────────────────────────────────────────────────────────
// Panel dedicado de una empresa: hero stat (YTD año en curso + Δ vs año previo
// mismo período) → matriz mes × año ligera. Drawer lateral en desktop, sheet
// full-screen en mobile. Reusa la data del endpoint /api/ventas/mes-anio.
// ─────────────────────────────────────────────────────────────────────────────
export function EmpresaMesAnioPanel({
  open, onClose, nombre, empresa, years, currentYear, error,
  viewMode, onViewMode,
}: {
  open: boolean;
  onClose: () => void;
  /** Nombre de la empresa (disponible aun mientras carga la data). */
  nombre: string;
  /** Data mes×año de la empresa; null mientras carga. */
  empresa: EmpresaMesAnio | null;
  years: number[];
  currentYear: number | null;
  error: string | null;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
}) {
  // Monta-luego-anima (entrada) y anima-luego-desmonta (salida) → slide suave
  // en ambos sentidos, sin pop brusco.
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useBodyScrollLock(open);

  if (!render) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Histórico mes × año de ${nombre}`}>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={cn("absolute inset-0 bg-black/30 transition-opacity duration-300", shown ? "opacity-100" : "opacity-0")}
      />
      {/* Panel: sheet desde abajo (mobile) · drawer desde la derecha (≥sm). */}
      <div
        className={cn(
          "absolute flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-out",
          "inset-0 sm:left-auto sm:right-0 sm:w-[460px] sm:max-w-[92vw]",
          shown ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full",
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-widest text-stone-400">Histórico mes × año</p>
            <h2 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-stone-950">{nombre}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5">
          {/* Toggle de métrica — comparte estado con la tabla principal. */}
          <div className="inline-flex rounded-full bg-stone-100 p-0.5 text-xs">
            {(["ventas", "utilidad", "margen"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onViewMode(m)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-medium transition",
                  viewMode === m ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-700",
                )}
              >
                {m === "margen" ? "Margen %" : METRIC_LABEL[m]}
              </button>
            ))}
          </div>

          {error ? (
            <p className="mt-6 text-sm text-stone-500">No se pudo cargar el histórico: {error}</p>
          ) : !empresa || currentYear == null ? (
            <PanelSkeleton />
          ) : (
            <PanelBody empresa={empresa} years={years} currentYear={currentYear} viewMode={viewMode} />
          )}
        </div>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-stone-100" />
        <div className="h-10 w-48 rounded bg-stone-100" />
        <div className="h-3 w-32 rounded bg-stone-100" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-5 rounded bg-stone-100" />)}
      </div>
    </div>
  );
}

function PanelBody({
  empresa, years, currentYear, viewMode,
}: {
  empresa: EmpresaMesAnio;
  years: number[];
  currentYear: number;
  viewMode: ViewMode;
}) {
  const prevYear = currentYear - 1;

  // Hero: YTD del año en curso vs el año previo en el MISMO conjunto de meses
  // (mismo período) — todo derivado de la propia data del endpoint.
  const cur = zeroVals();
  const prevSame = zeroVals();
  let hasPrev = false;
  for (let mes = 1; mes <= 12; mes++) {
    const cy = empresa.byMonth[mes]?.[currentYear];
    if (!cy) continue;
    cur.ventas += cy.ventas; cur.costo += cy.costo; cur.utilidad += cy.utilidad;
    const py = empresa.byMonth[mes]?.[prevYear];
    if (py) {
      hasPrev = true;
      prevSame.ventas += py.ventas; prevSame.costo += py.costo; prevSame.utilidad += py.utilidad;
    }
  }
  const heroVal = metricValue(cur, viewMode);
  const heroStr = heroVal == null
    ? "—"
    : viewMode === "margen" ? (heroVal * 100).toFixed(1) + "%" : fmtMoney(heroVal);
  const heroDelta = hasPrev ? cellDelta(cur, prevSame, viewMode) : formatDeltaRatio(null);
  const heroDeltaShown = heroDelta.arrow !== null || heroDelta.displayValue !== "—";

  return (
    <div className="mt-6 space-y-7">
      {/* Stat hero — la pieza con peso. */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-stone-400">
          {METRIC_LABEL[viewMode]} · {currentYear}
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[40px] font-medium leading-none tracking-tight tabular-nums text-stone-950">
            {heroStr}
          </span>
          {heroDeltaShown && (
            <span className={cn("font-mono text-sm font-medium tabular-nums", deltaTone[heroDelta.tone] ?? "text-stone-400")}>
              {heroDelta.arrow ? `${heroDelta.arrow} ` : ""}{heroDelta.displayValue}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-stone-500">
          {hasPrev ? `vs ${prevYear} · mismo período` : `Sin comparativo ${prevYear}`}
        </p>
      </div>

      {/* Matriz ligera mes × año — sin grid pesado, solo aire + separadores finos. */}
      <table className="w-full">
        <thead>
          <tr>
            <th className="pb-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-stone-400">Mes</th>
            {years.map((y) => (
              <th key={y} className="pb-2.5 pl-3 text-right text-[10px] font-medium uppercase tracking-wider text-stone-400">
                <div className="text-stone-500">{y}</div>
                {y === currentYear ? <div className="text-[9px] font-normal normal-case tracking-normal text-stone-300">al día</div> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {MONTHS.map((label, mi) => {
            const mes = mi + 1;
            const rowYears = empresa.byMonth[mes] ?? {};
            return (
              <tr key={mes}>
                <td className="whitespace-nowrap py-2.5 pr-3 text-left align-top text-xs font-medium text-stone-500">{label}</td>
                {years.map((y) => <PanelCell key={y} cur={rowYears[y] ?? null} mode={viewMode} />)}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-stone-200">
            <td className="pt-3 text-left text-[10px] font-semibold uppercase tracking-widest text-stone-500">Total</td>
            {years.map((y) => {
              const v = metricValue(empresa.totalByYear[y] ?? null, viewMode);
              return (
                <td key={y} className="pt-3 pl-3 text-right font-mono text-sm font-medium tabular-nums text-stone-900">
                  {renderCompact(v, viewMode)}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>

      <p className="text-[11px] leading-relaxed text-stone-400">
        Cada mes se compara con el mismo mes del año anterior. Los meses sin datos quedan en “—”; el mes en curso va parcial y no calcula Δ.
      </p>
    </div>
  );
}

// Una celda mes-año: valor compacto + Δ pequeño y sutil debajo. Sin Δ en celdas
// sin comparativo o vacías. Alineación a la derecha, tabular.
function PanelCell({ cur, mode }: { cur: Cell | null; mode: ViewMode }) {
  const v = metricValue(cur, mode);
  if (v == null) {
    return <td className="py-2.5 pl-3 text-right align-top font-mono text-sm tabular-nums text-stone-300">—</td>;
  }
  const d = cellDelta(cur as Vals, cur?.prev ?? null, mode);
  const show = d.arrow !== null || d.displayValue !== "—";
  return (
    <td className="py-2.5 pl-3 text-right align-top">
      <div className="font-mono text-sm tabular-nums text-stone-900">{renderCompact(v, mode)}</div>
      {show && (
        <div className={cn("mt-0.5 font-mono text-[10px] tabular-nums", deltaTone[d.tone] ?? "text-stone-400")}>
          {d.arrow ? `${d.arrow} ` : ""}{d.displayValue}
        </div>
      )}
    </td>
  );
}
