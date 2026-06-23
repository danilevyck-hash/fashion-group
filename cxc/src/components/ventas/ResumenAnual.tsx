"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaFormat } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";

type ViewMode = "ventas" | "utilidad" | "margen";

interface Vals { ventas: number; costo: number; utilidad: number }
interface Cell extends Vals { prev: Vals | null }
export interface AnualData {
  years: number[];
  currentYear: number | null;
  parcial: { year: number; label: string } | null;
  empresas: { id: string; nombre: string; byYear: Record<number, Cell>; total: Vals }[];
  totalGrupo: { byYear: Record<number, Cell>; total: Vals };
}

// Fetcher puro del resumen anual (mismo endpoint/shape de siempre).
async function fetchResumenAnual(): Promise<AnualData> {
  const res = await fetch("/api/ventas/resumen-anual", { cache: "no-store" });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new Error(e?.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as AnualData;
}

// Carga (cacheada vía SWR) el resumen anual. enabled evita el fetch hasta que el
// usuario elige "Anual" (clave null → SWR no dispara). La caché vive a nivel app
// (SWRProvider) → volver a "Anual" pinta al instante. Compartido por la vista
// desktop y la mobile. Devuelve el mismo shape { data, error } de antes.
export function useResumenAnual(enabled: boolean): { data: AnualData | null; error: string | null } {
  const { data, error } = useSWR<AnualData>(
    enabled ? "ventas-resumen-anual" : null,
    fetchResumenAnual,
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  return {
    data: data ?? null,
    error: error ? (error instanceof Error ? error.message : "Error al cargar") : null,
  };
}

// Mismo guard que el resto del módulo: bajo $100 de ventas el margen no informa.
const MARGEN_VENTAS_MIN = 100;

function metricValue(v: Vals, mode: ViewMode): number | null {
  if (mode === "margen") return v.ventas < MARGEN_VENTAS_MIN ? null : v.utilidad / v.ventas;
  return mode === "utilidad" ? v.utilidad : v.ventas;
}

function renderValue(v: number | null, mode: ViewMode): string {
  if (v == null) return "—";
  if (mode === "margen") return (v * 100).toFixed(1) + "%";
  return fmtMoneyCompact(v);
}

// Δ de la celda (mismo cálculo que mes a mes): pct para ventas/utilidad, pts
// para margen. prev null (primer año) → sin comparativo.
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

// Una celda año: valor primario + Δ YoY debajo. En la columna TOTAL (varios
// años) no hay Δ.
function AnualCell({ cur, prev, mode, dark = false, showDelta = true }: {
  cur: Vals; prev: Vals | null; mode: ViewMode; dark?: boolean; showDelta?: boolean;
}) {
  const val = renderValue(metricValue(cur, mode), mode);
  const d = showDelta ? cellDelta(cur, prev, mode) : null;
  return (
    <td className={cn("border-b px-2.5 py-3.5 text-right align-top", dark ? "border-stone-800" : "border-stone-200")}>
      <div className={cn("font-mono text-sm tabular-nums", dark ? "text-white" : "text-stone-950")}>{val}</div>
      {d && (d.arrow !== null || d.displayValue !== "—") && (
        <div className={cn("font-mono text-xs tabular-nums", dark ? toneClassDark[d.tone] : toneClass[d.tone])}>
          {d.arrow ? `${d.arrow} ` : ""}{d.displayValue}
        </div>
      )}
    </td>
  );
}

export function ResumenAnual({ data, error, viewMode }: {
  data: AnualData | null; error: string | null; viewMode: ViewMode;
}) {
  if (error) {
    return <Card className="p-6 text-sm text-stone-500">No se pudo cargar el resumen anual: {error}</Card>;
  }
  if (!data) {
    return <Card className="p-6 text-sm text-stone-400">Cargando resumen anual…</Card>;
  }

  const { years, currentYear, parcial, empresas, totalGrupo } = data;
  const emptyCell: Cell = { ventas: 0, costo: 0, utilidad: 0, prev: null };

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-stone-100 text-left">
                <th className="sticky left-0 top-0 z-30 min-w-[160px] bg-stone-100 px-3.5 py-3.5 text-xs font-medium uppercase tracking-wide text-stone-500">
                  Empresa
                </th>
                {years.map((y) => (
                  <th key={y} className="sticky top-0 z-20 bg-stone-100 px-2.5 py-3.5 text-right text-xs font-medium uppercase tracking-wide text-stone-500">
                    <div className="text-stone-700">{y}</div>
                    {parcial && parcial.year === y ? (
                      <div className="text-xs font-normal normal-case tracking-normal text-stone-400">parcial ({parcial.label})</div>
                    ) : y === currentYear ? (
                      <div className="text-xs font-normal normal-case tracking-normal text-stone-400">al día</div>
                    ) : null}
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-stone-100 px-3.5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-stone-950">Total</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-stone-200 bg-white px-3.5 py-3.5 text-sm text-stone-950">
                    {e.nombre}
                  </td>
                  {years.map((y) => {
                    const c = e.byYear[y] ?? emptyCell;
                    return <AnualCell key={y} cur={c} prev={c.prev} mode={viewMode} />;
                  })}
                  <AnualCell cur={e.total} prev={null} mode={viewMode} showDelta={false} />
                </tr>
              ))}
              <tr className="bg-stone-950 text-white">
                <td className="sticky left-0 z-10 bg-stone-950 px-3.5 py-3.5 text-xs font-medium uppercase tracking-wide">Total Grupo</td>
                {years.map((y) => {
                  const c = totalGrupo.byYear[y] ?? emptyCell;
                  return <AnualCell key={y} cur={c} prev={c.prev} mode={viewMode} dark />;
                })}
                <AnualCell cur={totalGrupo.total} prev={null} mode={viewMode} dark showDelta={false} />
              </tr>
            </tbody>
          </table>
        </div>
        {parcial && (
          <p className="border-t border-stone-200 bg-stone-50 px-3.5 py-2 text-xs text-stone-500">
            {parcial.year} es parcial (datos desde {parcial.label}); no se calcula Δ interanual. El año en curso{currentYear ? ` (${currentYear})` : ""} va al día y su Δ compara contra el mismo período del año anterior.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-emerald-700">▲</span>
          {viewMode === "margen" ? "Δ interanual mayor a +0.5 pts" : "Δ interanual mayor a +5%"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-red-700">▼</span>
          {viewMode === "margen" ? "menor a −0.5 pts" : "menor a −5%"}
        </span>
      </div>
    </>
  );
}
