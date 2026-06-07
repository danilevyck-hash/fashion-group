"use client";

// Sub-tab Vendedoras del módulo Multifashion (/multifashion) — REDISEÑO v3.
//
// UNA sola tabla (una fila por vendedora) con los badges de bono inline junto
// al nombre:
//   - "🏆 Bono $50" en la vendedora ganadora del mes (bono_vendedora del RPC).
//   - "Gerente" siempre en Jennifer; "✓ Bono $X" si la tienda cumplió meta.
// Arriba, un banner de UNA línea con el contexto del bono gerente (tienda
// completa, incl. mayoreo). Sin tiles KPI de bono.
//
// Chips de período (controlan la tabla): en curso (default) · mes cerrado
// anterior · YTD. La columna Δ es ÚNICA y rotulada "vs año pasado" (YoY).
//
// Server-side: RPC multifashion_vendedoras (ranking por período) +
// multifashion_bonos_v3 (bono del mes, vía BonosSection). Sin fórmulas nuevas.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Users, Award } from "lucide-react";
import type {
  Multifashion,
  VendedoraDetalle,
  VendedorasPeriodo,
  VendedorasPeriodoTipo,
  BonosMultifashion,
} from "@/components/ventas/types";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";
import { BonosSection } from "./BonosSection";

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-stone-500",
};

type SortKey = "tickets" | "ventas" | "delta_ventas" | "comision";
type SortDir = "asc" | "desc";
type ChipKey = "en_curso" | "mes_anterior" | "ytd";

// Badge info por vendedora, derivado del RPC de bonos (sin fórmulas nuevas).
interface BonoBadge { winner: boolean; gerenteBono: number }

interface VendedorasSubtabProps {
  data: Multifashion;
  selectedYear: number;
  /** Mes del selector del shell — en v3 la pestaña usa sus propios chips, se
   *  conserva el prop por compatibilidad con el llamador. */
  mes: number;
  onMesChange: (mes: number) => void;
}

export function VendedorasSubtab({ data, selectedYear }: VendedorasSubtabProps) {
  const year = selectedYear;

  // Meses base relativos a hoy. Para año cerrado, "en curso" = Dic.
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const enCursoMes = isCurrentYear ? now.getMonth() + 1 : 12;
  const mesAnteriorMes = Math.max(1, enCursoMes - 1);

  const [chip, setChip] = useState<ChipKey>("en_curso");

  // Parámetros del ranking según el chip.
  const rpcPeriodo: VendedorasPeriodoTipo = chip === "ytd" ? "ytd" : "mes";
  const rpcMes = chip === "en_curso" ? enCursoMes : mesAnteriorMes;
  // Mes cuyo bono se evalúa: en_curso → mes en curso (será pendiente);
  // mes_anterior / ytd → último mes cerrado.
  const bonoMes = chip === "en_curso" ? enCursoMes : mesAnteriorMes;

  const [resp, setResp] = useState<VendedorasPeriodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [bonos, setBonos] = useState<BonosMultifashion | null>(null);
  const onBonosData = useCallback((r: BonosMultifashion | null) => setBonos(r), []);

  const [sortBy, setSortBy] = useState<SortKey>("ventas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Fetch del ranking
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(year), periodo: rpcPeriodo });
    if (rpcPeriodo === "mes") params.set("mes", String(rpcMes));
    fetch(`/api/multifashion/vendedoras?${params.toString()}`, { cache: "no-store", signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<VendedorasPeriodo>;
      })
      .then(json => setResp(json))
      .catch(err => {
        if (err?.name === "AbortError") return;
        console.error("[multifashion/vendedoras] fetch failed", err);
        setError(err instanceof Error ? err.message : "error inesperado");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [year, rpcPeriodo, rpcMes, reloadKey]);

  // Badges de bono por nombre (solo cuando el mes es evaluable).
  const bonoBadges = useMemo(() => {
    const map = new Map<string, BonoBadge>();
    if (bonos && !bonos.sin_data && bonos.es_elegible) {
      const gerenteBono = bonos.gerente.bono;
      for (const v of bonos.vendedoras) {
        map.set(v.nombre, { winner: v.bono_vendedora, gerenteBono });
      }
    }
    return map;
  }, [bonos]);

  const sortedVendedoras = useMemo(() => {
    if (!resp) return [];
    const arr = resp.vendedoras.slice();
    const sign = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortBy) {
        case "tickets":  return (a.tickets - b.tickets) * sign;
        case "ventas":   return (a.ventas - b.ventas) * sign;
        case "comision": return (a.comision - b.comision) * sign;
        case "delta_ventas": {
          const av = a.delta_ventas_pct, bv = b.delta_ventas_pct;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av - bv) * sign;
        }
      }
    });
    return arr;
  }, [resp, sortBy, sortDir]);

  const onSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const chipLabel: Record<ChipKey, string> = {
    en_curso: `${MES_FULL[enCursoMes - 1]} ${year} (en curso)`,
    mes_anterior: `${MES_FULL[mesAnteriorMes - 1]} ${year}`,
    ytd: `YTD ${year}`,
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar el ranking: {error}
          <button onClick={() => setReloadKey(k => k + 1)} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
        </div>
      )}

      {/* Banner del bono gerente (una línea). Eleva la data para los badges. */}
      <BonosSection selectedYear={year} mes={bonoMes} onData={onBonosData} />

      {/* Chips de período: en curso (default) · mes cerrado anterior · YTD */}
      <div className="flex flex-wrap items-center gap-2">
        <ChipPill active={chip === "en_curso"} onClick={() => setChip("en_curso")}>
          {`${MES_FULL[enCursoMes - 1]} (en curso)`}
        </ChipPill>
        <ChipPill active={chip === "mes_anterior"} onClick={() => setChip("mes_anterior")}>
          {`${MES_FULL[mesAnteriorMes - 1]} (cerrado)`}
        </ChipPill>
        <ChipPill active={chip === "ytd"} onClick={() => setChip("ytd")}>
          {`YTD ${year}`}
        </ChipPill>
      </div>

      {/* Subtitle */}
      <div className={cn(loading && "opacity-60 transition-opacity")}>
        <h3 className="font-display text-base font-semibold text-stone-950">Vendedoras · {chipLabel[chip]}</h3>
        {resp && (
          <p className="mt-0.5 text-[11px] text-stone-500">
            <span className="font-mono tabular-nums text-stone-700">{resp.total_vendedoras_periodo}</span> vendedoras ·{" "}
            <span className="font-mono tabular-nums text-stone-700">{fmtMoney(resp.ventas_total)}</span> ventas ·{" "}
            <span className="font-mono tabular-nums text-stone-700">{resp.tickets_total.toLocaleString()}</span> tickets
          </p>
        )}
        <p className="mt-1 text-[11px] text-stone-400">Ventas retail mostrador. Mayoreo se reporta en Overview.</p>
      </div>

      {/* Tabla única */}
      {resp && resp.vendedoras.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={cn(loading && "opacity-60 pointer-events-none transition-opacity")}>
          {/* Desktop */}
          <Card className="hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-stone-100">
                    <th className="w-10 border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">#</th>
                    <th className="border-b border-stone-200 px-3.5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-500">Vendedora</th>
                    <SortHeader col="tickets"      sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Tickets</SortHeader>
                    <SortHeader col="ventas"       sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Ventas</SortHeader>
                    <th className="border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">Ticket prom.</th>
                    <SortHeader col="delta_ventas" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Δ vs año pasado</SortHeader>
                    <SortHeader col="comision"     sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Comisión</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {sortedVendedoras.map((v, i) => (
                    <VendedoraRow key={v.nombre} v={v} rank={i + 1} badge={bonoBadges.get(v.nombre)} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {sortedVendedoras.map((v, i) => (
              <VendedoraCard key={v.nombre} v={v} rank={i + 1} badge={bonoBadges.get(v.nombre)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Badges de bono inline (junto al nombre)
// ─────────────────────────────────────────────────────────────────────────────

function BonoBadges({ v, badge }: { v: VendedoraDetalle; badge?: BonoBadge }) {
  return (
    <>
      {v.manager && (
        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">Gerente</span>
      )}
      {badge?.winner && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
          <Award className="h-3 w-3" /> Bono $50
        </span>
      )}
      {v.manager && badge && badge.gerenteBono > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
          <Award className="h-3 w-3" /> Bono ${badge.gerenteBono}
        </span>
      )}
    </>
  );
}

function rowHighlight(v: VendedoraDetalle, badge?: BonoBadge): boolean {
  return !!badge?.winner || (v.manager && !!badge && badge.gerenteBono > 0);
}

function VendedoraRow({ v, rank, badge }: { v: VendedoraDetalle; rank: number; badge?: BonoBadge }) {
  const dv = formatDeltaRatio(v.delta_ventas_pct);
  return (
    <tr className={rowHighlight(v, badge) ? "bg-amber-50/60" : ""}>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">{rank}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-sm text-stone-950">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{v.nombre}</span>
          <BonoBadges v={v} badge={badge} />
        </div>
      </td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm text-stone-700 tabular-nums">{v.tickets.toLocaleString()}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">{fmtMoney(v.ventas)}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm text-stone-700 tabular-nums">${v.ticket_promedio.toFixed(2)}</td>
      <td className={cn("border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[dv.tone])}>
        {dv.arrow && <span className="mr-1">{dv.arrow}</span>}{dv.displayValue}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">${v.comision.toFixed(2)}</td>
    </tr>
  );
}

function VendedoraCard({ v, rank, badge }: { v: VendedoraDetalle; rank: number; badge?: BonoBadge }) {
  const dv = formatDeltaRatio(v.delta_ventas_pct);
  return (
    <div className={cn(
      "rounded-lg border bg-white px-4 py-3.5",
      rowHighlight(v, badge) ? "border-amber-200 bg-amber-50/40" : "border-stone-200"
    )}>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-mono text-xs text-stone-500 tabular-nums">{rank}.</span>
        <span className="truncate text-[15px] font-medium leading-tight text-stone-950">{v.nombre}</span>
        <BonoBadges v={v} badge={badge} />
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-base font-medium tabular-nums text-stone-950">{fmtMoneyCompact(v.ventas)}</span>
        <span className={cn("font-mono text-xs tabular-nums", TONE_LIGHT[dv.tone])}>
          {dv.arrow && <span className="mr-0.5">{dv.arrow}</span>}{dv.displayValue}
          <span className="ml-1 text-stone-400">vs año pasado</span>
        </span>
      </div>
      <div className="mt-1 text-[11px] text-stone-500">
        <span className="font-mono tabular-nums">{v.tickets.toLocaleString()}</span> tickets ·{" "}
        <span className="font-mono tabular-nums">${v.ticket_promedio.toFixed(2)}</span> tkt prom ·{" "}
        <span className="font-mono tabular-nums">${v.comision.toFixed(2)}</span> comisión
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip + empty + sort header
// ─────────────────────────────────────────────────────────────────────────────

function ChipPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-[40px] items-center whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-medium transition",
        active ? "border-teal-700 bg-teal-700 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <Card className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-12 text-center">
      <Users className="h-10 w-10 text-stone-400" strokeWidth={1.5} />
      <p className="text-sm text-stone-500">Sin vendedoras con actividad en este período</p>
    </Card>
  );
}

function SortHeader({
  col, children, sortBy, sortDir, onClick,
}: {
  col: SortKey;
  children: React.ReactNode;
  sortBy: SortKey;
  sortDir: SortDir;
  onClick: (c: SortKey) => void;
}) {
  const active = sortBy === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={cn(
        "cursor-pointer select-none whitespace-nowrap border-b border-stone-200 bg-stone-100 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider transition",
        active ? "text-stone-950" : "text-stone-500 hover:text-stone-700"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={cn("text-[9px]", active ? "opacity-100" : "opacity-35")}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}
