"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { MONTHS, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaFormat } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";

type ViewMode = "ventas" | "utilidad" | "margen";

interface Vals { ventas: number; costo: number; utilidad: number }
interface Cell extends Vals { prev: Vals | null }
interface EmpresaMesAnio {
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

// Fetcher puro del resumen mes×año (toda la data en una respuesta; el selector
// de empresa filtra en cliente sin refetch).
async function fetchMesAnio(): Promise<MesAnioData> {
  const res = await fetch("/api/ventas/mes-anio", { cache: "no-store" });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new Error(e?.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as MesAnioData;
}

// Carga (cacheada vía SWR) el resumen mes×año. enabled evita el fetch hasta que
// el usuario elige "Mes × año" (clave null → SWR no dispara). La caché vive a
// nivel app (SWRProvider) → volver a la vista pinta al instante. Compartido por
// la vista desktop y la mobile.
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

function renderValue(v: number | null, mode: ViewMode): string {
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

const toneClass: Record<string, string> = {
  emerald: "text-emerald-700",
  orange: "text-orange-600",
  stone: "text-stone-400",
};
const toneClassDark: Record<string, string> = {
  emerald: "text-emerald-300",
  orange: "text-orange-300",
  stone: "text-stone-400",
};

// Una celda mes-año: valor primario + Δ vs el mismo mes del año anterior. En las
// celdas TOTAL (fila/columna) no hay Δ. cur null → "—" (mes-año sin data).
function MesAnioCell({ cur, mode, dark = false, showDelta = true }: {
  cur: Cell | Vals | null; mode: ViewMode; dark?: boolean; showDelta?: boolean;
}) {
  const val = renderValue(metricValue(cur, mode), mode);
  const prev = cur && "prev" in cur ? cur.prev : null;
  const d = showDelta && cur ? cellDelta(cur, prev, mode) : null;
  return (
    <td className={cn("border-b px-2.5 py-3 text-right align-top", dark ? "border-stone-800" : "border-stone-200")}>
      <div className={cn("font-mono text-sm tabular-nums", dark ? "text-white" : "text-stone-950")}>{val}</div>
      {d && (d.arrow !== null || d.displayValue !== "—") && (
        <div className={cn("font-mono text-[11px] tabular-nums", dark ? toneClassDark[d.tone] : toneClass[d.tone])}>
          {d.arrow ? `${d.arrow} ` : ""}{d.displayValue}
        </div>
      )}
    </td>
  );
}

export function ResumenMesAnio({ data, error, viewMode }: {
  data: MesAnioData | null; error: string | null; viewMode: ViewMode;
}) {
  // El selector vive acá (self-contained): cambiar de empresa no refetchea.
  const [empresaId, setEmpresaId] = useState<string | null>(null);

  if (error) {
    return <Card className="p-6 text-sm text-stone-500">No se pudo cargar el resumen mes × año: {error}</Card>;
  }
  if (!data) {
    return <Card className="p-6 text-sm text-stone-400">Cargando resumen mes × año…</Card>;
  }
  if (data.empresas.length === 0) {
    return <Card className="p-6 text-sm text-stone-400">Sin data disponible.</Card>;
  }

  const { years, currentYear, partial, earliestPartial } = data;
  const empresa = data.empresas.find((e) => e.id === empresaId) ?? data.empresas[0];
  const partialMesLabel = partial ? MONTHS[partial.month - 1] : null;

  return (
    <div className="space-y-4">
      {/* Selector de empresa — única empresa desglosada por mes × año. */}
      <div className="flex items-center gap-2">
        <label htmlFor="mesanio-empresa" className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
          Empresa
        </label>
        <select
          id="mesanio-empresa"
          value={empresa.id}
          onChange={(e) => setEmpresaId(e.target.value)}
          className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-950 shadow-sm focus:border-stone-400 focus:outline-none"
        >
          {data.empresas.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-stone-100 text-left">
                <th className="sticky left-0 top-0 z-30 min-w-[88px] bg-stone-100 px-3.5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-stone-500">
                  Mes
                </th>
                {years.map((y) => (
                  <th key={y} className="sticky top-0 z-20 bg-stone-100 px-2.5 py-3.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">
                    <div className="text-stone-700">{y}</div>
                    {earliestPartial && earliestPartial.year === y ? (
                      <div className="text-[10px] font-normal normal-case tracking-normal text-stone-400">parcial ({earliestPartial.label})</div>
                    ) : y === currentYear ? (
                      <div className="text-[10px] font-normal normal-case tracking-normal text-stone-400">al día</div>
                    ) : null}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-stone-100 px-3.5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-stone-950">Total</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((mesLabel, mi) => {
                const mes = mi + 1;
                const rowYears = empresa.byMonth[mes] ?? {};
                const rowTotal = empresa.totalByMonth[mes] ?? null;
                return (
                  <tr key={mes}>
                    <td className="sticky left-0 z-10 whitespace-nowrap border-b border-stone-200 bg-white px-3.5 py-3 text-sm font-medium text-stone-700">
                      {mesLabel}
                    </td>
                    {years.map((y) => (
                      <MesAnioCell key={y} cur={rowYears[y] ?? null} mode={viewMode} />
                    ))}
                    <MesAnioCell cur={rowTotal} mode={viewMode} showDelta={false} />
                  </tr>
                );
              })}
              <tr className="bg-stone-950 text-white">
                <td className="sticky left-0 z-10 bg-stone-950 px-3.5 py-3 text-xs font-medium uppercase tracking-widest">Total</td>
                {years.map((y) => (
                  <MesAnioCell key={y} cur={empresa.totalByYear[y] ?? null} mode={viewMode} dark showDelta={false} />
                ))}
                <MesAnioCell cur={empresa.grandTotal} mode={viewMode} dark showDelta={false} />
              </tr>
            </tbody>
          </table>
        </div>
        {(earliestPartial || partialMesLabel) && (
          <p className="border-t border-stone-200 bg-stone-50 px-3.5 py-2 text-xs text-stone-500">
            {earliestPartial ? `${earliestPartial.year} es parcial (datos desde ${earliestPartial.label}); no se calcula Δ donde no hay el mismo mes del año previo. ` : ""}
            {partialMesLabel && currentYear ? `${partialMesLabel} ${currentYear} va parcial (mes en curso); su Δ se omite.` : ""}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-emerald-700">▲</span>
          {viewMode === "margen" ? "vs mismo mes año previo mayor a +0.5 pts" : "vs mismo mes año previo mayor a +5%"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-red-700">▼</span>
          {viewMode === "margen" ? "menor a −0.5 pts" : "menor a −5%"}
        </span>
        <span className="inline-flex items-center gap-1.5"><span className="text-stone-400">—</span>sin data</span>
      </div>
    </div>
  );
}
