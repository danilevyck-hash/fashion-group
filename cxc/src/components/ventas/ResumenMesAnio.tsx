"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { MONTHS } from "@/lib/ventas/format";
import { formatDeltaRatio } from "@/lib/ventas/formatDelta";
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

// Fetcher puro del resumen mes×año (toda la data en una respuesta; abrir la card
// de otra empresa NO refetchea — filtra en cliente).
async function fetchMesAnio(): Promise<MesAnioData> {
  const res = await fetch("/api/ventas/mes-anio", { cache: "no-store" });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new Error(e?.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as MesAnioData;
}

// Carga (cacheada vía SWR) el resumen mes×año. enabled evita el fetch hasta que
// el usuario abre la card de una empresa (clave null → SWR no dispara). La caché
// vive a nivel app (SWRProvider) → reabrir pinta al instante. Compartido por la
// vista desktop y la mobile.
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

function metricValue(v: Vals | null, mode: ViewMode): number | null {
  if (!v) return null;
  if (mode === "margen") return v.ventas < MARGEN_VENTAS_MIN ? null : v.utilidad / v.ventas;
  return mode === "utilidad" ? v.utilidad : v.ventas;
}

// Monto abreviado, sin $: miles → "937k" (sin decimales), millones → "1.2M"
// (1 decimal). Mantiene angostas las 13 columnas + Δ.
function abbrevAmount(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
}

// Celda: número limpio, sin $ ni Δ. Ventas/utilidad → abreviado; margen →
// porcentaje 1 decimal. Sin data → "—".
function renderMetric(v: number | null, mode: ViewMode): string {
  if (v == null) return "—";
  if (mode === "margen") return (v * 100).toFixed(1) + "%";
  return abbrevAmount(v);
}

// Δ relativo (ratio) del valor actual vs el del año anterior, en los 3 modos.
// En Margen es el cambio relativo % entre los dos márgenes — NO puntos. null
// cuando no hay base previa comparable (sin dato previo o previo ≤ 0).
function relDelta(cur: Vals | null, prev: Vals | null, mode: ViewMode): number | null {
  const c = metricValue(cur, mode);
  const p = metricValue(prev, mode);
  if (c == null || p == null || p <= 0) return null;
  return (c - p) / p;
}

// tone → clase (mismo tratamiento que la tabla principal de Ventas).
const deltaTone: Record<string, string> = {
  emerald: "text-emerald-600",
  orange: "text-red-600",
  stone: "text-stone-400",
};

const METRIC_LABEL: Record<ViewMode, string> = {
  ventas: "Ventas",
  utilidad: "Utilidad",
  margen: "Margen %",
};

// ─────────────────────────────────────────────────────────────────────────────
// Card centrada (modal) con el histórico mes × año de UNA empresa, en orientación
// HORIZONTAL: filas = años, columnas = los 12 meses (misma orientación que la
// tabla principal de Ventas). Tabla limpia, solo números (sin Δ, sin $). Reusa
// la data del endpoint /api/ventas/mes-anio. Centrada en desktop, full-screen
// sheet en mobile.
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
  // Monta-luego-anima (entrada) y anima-luego-desmonta (salida): scale+fade en
  // desktop, slide desde abajo en mobile. Sin pop brusco.
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => {
        setShown(true);
        closeRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), 280);
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Histórico mes × año de ${nombre}`}>
      {/* Backdrop oscuro + blur sutil. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Card: full-screen sheet (mobile, sube desde abajo) · centrada mediana
          (≥sm, entra con scale+fade). */}
      <div
        className={cn(
          "relative flex w-full flex-col border-stone-200 bg-white shadow-2xl",
          "h-[92vh] rounded-t-2xl border-t",
          "sm:h-auto sm:max-h-[88vh] sm:max-w-[940px] sm:rounded-2xl sm:border",
          "transition-all duration-300 ease-out motion-reduce:transition-none",
          shown
            ? "translate-y-0 opacity-100 sm:scale-100"
            : "translate-y-full opacity-0 sm:translate-y-0 sm:scale-[0.96]",
        )}
      >
        {/* Header: eyebrow + nombre (izq) · toggle métrica + X (der). */}
        <header className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-7 sm:pt-6">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-widest text-stone-400">Histórico mes × año</p>
            <h2 className="mt-0.5 truncate text-[22px] font-medium leading-tight tracking-tight text-stone-950">{nombre}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden rounded-full bg-stone-100 p-0.5 text-xs sm:inline-flex">
              {(["ventas", "utilidad", "margen"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onViewMode(m)}
                  className={cn(
                    "rounded-full px-3 py-1.5 font-medium transition",
                    viewMode === m ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-700",
                  )}
                >
                  {METRIC_LABEL[m]}
                </button>
              ))}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-9 w-9 place-items-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </header>

        {/* Toggle métrica en mobile (full-width bajo el header). */}
        <div className="border-b border-stone-100 px-6 py-3 sm:hidden">
          <div className="inline-flex rounded-full bg-stone-100 p-0.5 text-xs">
            {(["ventas", "utilidad", "margen"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onViewMode(m)}
                className={cn(
                  "rounded-full px-3 py-1.5 font-medium transition",
                  viewMode === m ? "bg-white text-stone-950 shadow-sm" : "text-stone-500",
                )}
              >
                {METRIC_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-5 sm:px-7 sm:pb-7">
          {error ? (
            <p className="py-6 text-sm text-stone-500">No se pudo cargar el histórico: {error}</p>
          ) : !empresa || currentYear == null ? (
            <PanelSkeleton />
          ) : (
            <MatrizHorizontal empresa={empresa} years={years} currentYear={currentYear} viewMode={viewMode} />
          )}
        </div>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-3 py-2">
      <div className="h-4 w-full rounded bg-stone-100" />
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-7 rounded bg-stone-100" />)}
    </div>
  );
}

// Tabla horizontal: años en filas, meses en columnas + Total. table-fixed → las
// columnas reparten el ancho parejo y nunca se desalinean. Bajo cada número, el
// Δ % vs el mismo mes (o el total) del año anterior.
function MatrizHorizontal({
  empresa, years, currentYear, viewMode,
}: {
  empresa: EmpresaMesAnio;
  years: number[];
  currentYear: number;
  viewMode: ViewMode;
}) {
  return (
    <div className="-mx-1 overflow-x-auto sm:mx-0 sm:overflow-x-visible">
      <table className="w-full min-w-[760px] table-fixed border-collapse sm:min-w-0">
        <colgroup>
          <col className="w-[52px]" />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 bg-white pb-2.5 pl-1 pr-2 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">
              Año
            </th>
            {MONTHS.map((m) => (
              <th key={m} className="pb-2.5 pl-1 pr-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-stone-400">
                {m}
              </th>
            ))}
            <th className="border-l border-stone-200 pb-2.5 pl-2 pr-1 text-right text-[11px] font-semibold uppercase tracking-wide text-stone-600">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {years.map((y) => {
            const isCurrent = y === currentYear;
            return (
              <tr key={y} className={cn(isCurrent && "bg-stone-50")}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 py-2.5 pl-1 pr-2 text-left align-top text-sm tabular-nums",
                    isCurrent ? "bg-stone-50 font-semibold text-stone-950" : "bg-white font-medium text-stone-600",
                  )}
                >
                  {y}
                </th>
                {MONTHS.map((_, mi) => (
                  <MatrizCell
                    key={mi}
                    cur={empresa.byMonth[mi + 1]?.[y] ?? null}
                    prev={empresa.byMonth[mi + 1]?.[y - 1] ?? null}
                    mode={viewMode}
                    isCurrent={isCurrent}
                  />
                ))}
                <MatrizCell
                  cur={empresa.totalByYear[y] ?? null}
                  prev={empresa.totalByYear[y - 1] ?? null}
                  mode={viewMode}
                  isCurrent={isCurrent}
                  isTotal
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Una celda: número (arriba) + Δ % vs año anterior (abajo, pequeño y discreto).
// Sin Δ cuando no hay base previa. Meses sin dato → "—" sin Δ.
function MatrizCell({
  cur, prev, mode, isCurrent, isTotal = false,
}: {
  cur: Vals | null;
  prev: Vals | null;
  mode: ViewMode;
  isCurrent: boolean;
  isTotal?: boolean;
}) {
  const v = metricValue(cur, mode);
  const d = relDelta(cur, prev, mode);
  const fmt = d == null ? null : formatDeltaRatio(d, "pct");
  return (
    <td
      className={cn(
        "py-2.5 pl-1 pr-1.5 text-right align-top font-mono text-xs tabular-nums",
        isTotal && "border-l border-stone-200 pl-2",
        v == null ? "text-stone-300" : isCurrent ? "font-medium text-stone-950" : isTotal ? "font-medium text-stone-800" : "font-normal text-stone-700",
      )}
    >
      <div>{renderMetric(v, mode)}</div>
      {fmt && (
        <div className={cn("mt-0.5 text-[10px] font-normal leading-none", deltaTone[fmt.tone] ?? "text-stone-400")}>
          {fmt.arrow ? `${fmt.arrow} ` : ""}{fmt.displayValue}
        </div>
      )}
    </td>
  );
}
