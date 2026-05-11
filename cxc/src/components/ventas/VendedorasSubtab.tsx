"use client";

// Sub-tab Vendedoras del módulo /ventas → Multifashion.
//
// Permite explorar el ranking de vendedoras (empresa='american_classic')
// con tres ventanas: Mes / Trimestre / YTD. Delta de cada fila compara
// contra el mismo período del año anterior (no contra el mes/trim previo).
//
// Server-side: RPC multifashion_vendedoras (ver migration
// 20260511130000_multifashion_vendedoras_periodo.sql).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, Users } from "lucide-react";
import type {
  Multifashion,
  VendedoraDetalle,
  VendedorasPeriodo,
  VendedorasPeriodoTipo,
} from "./types";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDelta, formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MES_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// Parsea "YYYY-MM-DD" como fecha local (sin shift de UTC).
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// "lunes 11 de mayo 2026" — español Panamá sin comas ni "de" después del año.
function formatFechaCortePA(iso: string): string {
  const d = parseIsoDate(iso);
  const weekday = new Intl.DateTimeFormat("es-PA", { weekday: "long" }).format(d);
  const day = d.getDate();
  const month = new Intl.DateTimeFormat("es-PA", { month: "long" }).format(d);
  const year = d.getFullYear();
  return `${weekday} ${day} de ${month} ${year}`;
}

// Construye la cola "Comparativo vs ..." según el período activo.
//   mes:       "Comparativo vs Mayo 1–11 2025"
//   trimestre: "Comparativo vs Q2 2025 (al 11 May)"
//   ytd:       "Comparativo vs YTD 2025 (Ene 1 – 11 May)"
function buildComparativoLabel(
  periodo: VendedorasPeriodoTipo,
  year: number,
  mes: number,
  trimestre: number,
  diaCorteAnioAnterior: string,
): string {
  const prevYear = year - 1;
  const corte = parseIsoDate(diaCorteAnioAnterior);
  const corteDay = corte.getDate();
  const corteMonthShort = MES_SHORT[corte.getMonth()];

  if (periodo === "mes") {
    return `Comparativo vs ${MES_FULL[mes - 1]} 1–${corteDay} ${prevYear}`;
  }
  if (periodo === "trimestre") {
    return `Comparativo vs Q${trimestre} ${prevYear} (al ${corteDay} ${corteMonthShort})`;
  }
  return `Comparativo vs YTD ${prevYear} (Ene 1 – ${corteDay} ${corteMonthShort})`;
}

const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-stone-500",
};

type SortKey = "tickets" | "ventas" | "delta_ventas" | "comision";
type SortDir = "asc" | "desc";

interface VendedorasSubtabProps {
  data: Multifashion;
}

export function VendedorasSubtab({ data }: VendedorasSubtabProps) {
  const year = new Date().getFullYear();

  // Meses con data en el año actual (para el dropdown). 1..12.
  const mesesConData = useMemo(() => {
    const out: number[] = [];
    data.meses.forEach((m, i) => {
      if (m.tickets > 0 || m.ventas > 0) out.push(i + 1);
    });
    return out;
  }, [data.meses]);

  // Último mes con data — default para "Mes".
  const mesDefault = mesesConData.length > 0
    ? mesesConData[mesesConData.length - 1]
    : new Date().getMonth() + 1;
  const trimDefault = Math.max(1, Math.ceil(mesDefault / 3));

  const [periodo, setPeriodo] = useState<VendedorasPeriodoTipo>("mes");
  const [mes, setMes] = useState<number>(mesDefault);
  const [trimestre, setTrimestre] = useState<number>(trimDefault);

  const [resp, setResp] = useState<VendedorasPeriodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<SortKey>("ventas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Fetch on change
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(year), periodo });
    if (periodo === "mes") params.set("mes", String(mes));
    if (periodo === "trimestre") params.set("trimestre", String(trimestre));
    fetch(`/api/multifashion/vendedoras?${params.toString()}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
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
  }, [year, periodo, mes, trimestre]);

  const sortedVendedoras = useMemo(() => {
    if (!resp) return [];
    const arr = resp.vendedoras.slice();
    const sign = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortBy) {
        case "tickets":      return (a.tickets - b.tickets) * sign;
        case "ventas":       return (a.ventas - b.ventas) * sign;
        case "comision":     return (a.comision - b.comision) * sign;
        case "delta_ventas": {
          // null al final independiente de la dirección — no compiten contra
          // vendedoras con datos del año previo.
          const av = a.delta_ventas_pct;
          const bv = b.delta_ventas_pct;
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

  const subtitle = useMemo(() => {
    if (periodo === "mes") return `Vendedoras · ${MES_FULL[mes - 1]} ${year}`;
    if (periodo === "trimestre") return `Vendedoras · Q${trimestre} ${year}`;
    // ytd
    const upTo = mesesConData[mesesConData.length - 1];
    const upToLabel = upTo ? MES_FULL[upTo - 1].slice(0, 3) : MES_FULL[0].slice(0, 3);
    return `Vendedoras · YTD ${year} (Ene–${upToLabel})`;
  }, [periodo, mes, trimestre, mesesConData, year]);

  const totalDelta = formatDelta(resp?.ventas_total, resp?.ventas_total_prev);

  return (
    <div className={cn("space-y-4", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {error && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar el ranking: {error}
        </div>
      )}

      {/* 1. Selector de período */}
      <PeriodoSelector
        periodo={periodo}
        mes={mes}
        trimestre={trimestre}
        year={year}
        mesesConData={mesesConData}
        onPeriodoChange={(next) => {
          setPeriodo(next);
          // Asegura defaults razonables al cambiar
          if (next === "mes" && !mesesConData.includes(mes)) setMes(mesDefault);
          if (next === "trimestre" && (trimestre < 1 || trimestre > 4)) setTrimestre(trimDefault);
        }}
        onMesChange={setMes}
        onTrimestreChange={setTrimestre}
      />

      {/* 2. Subtitle dinámico */}
      <div>
        <h3 className="font-display text-base font-semibold text-stone-950">{subtitle}</h3>
        {resp && (
          <p className="mt-0.5 text-[11px] text-stone-500">
            <span className="font-mono tabular-nums text-stone-700">{resp.total_vendedoras_periodo}</span> vendedoras ·
            {" "}<span className="font-mono tabular-nums text-stone-700">{fmtMoney(resp.ventas_total)}</span> ventas ·
            {" "}<span className="font-mono tabular-nums text-stone-700">{resp.tickets_total.toLocaleString()}</span> tickets
            {" "}· vs mismo período {year - 1}:{" "}
            <span className={cn("font-mono tabular-nums", TONE_LIGHT[totalDelta.tone])}>
              {totalDelta.arrow}{totalDelta.arrow ? " " : ""}{totalDelta.displayValue}
            </span>
          </p>
        )}
        {resp?.es_periodo_parcial && resp.fecha_corte && resp.dia_corte_anio_anterior && (
          <p className="mt-1 text-xs text-stone-500">
            Actualizado al {formatFechaCortePA(resp.fecha_corte)} ·{" "}
            {buildComparativoLabel(periodo, year, mes, trimestre, resp.dia_corte_anio_anterior)}
          </p>
        )}
      </div>

      {/* 3. Tabla ranking — desktop / cards mobile */}
      {resp && resp.vendedoras.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Desktop */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 880 }}>
                <thead>
                  <tr className="bg-stone-100">
                    <th className="w-10 border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">#</th>
                    <th className="border-b border-stone-200 px-3.5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-500">Vendedora</th>
                    <SortHeader col="tickets"      align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Tickets</SortHeader>
                    <SortHeader col="ventas"       align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Ventas</SortHeader>
                    <th className="border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">Ticket prom.</th>
                    <SortHeader col="delta_ventas" align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Δ Ventas</SortHeader>
                    <th className="border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">Δ Tickets</th>
                    <SortHeader col="comision"     align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Comisión</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {sortedVendedoras.map((v, i) => (
                    <VendedoraRow key={v.nombre} v={v} rank={i + 1} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {sortedVendedoras.map((v, i) => (
              <VendedoraCard key={v.nombre} v={v} rank={i + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Periodo Selector — three pills + inline dropdown when mes/trimestre activo
// ─────────────────────────────────────────────────────────────────────────────

interface PeriodoSelectorProps {
  periodo: VendedorasPeriodoTipo;
  mes: number;
  trimestre: number;
  year: number;
  mesesConData: number[];
  onPeriodoChange: (p: VendedorasPeriodoTipo) => void;
  onMesChange: (m: number) => void;
  onTrimestreChange: (t: number) => void;
}

function PeriodoSelector({
  periodo, mes, trimestre, year, mesesConData,
  onPeriodoChange, onMesChange, onTrimestreChange,
}: PeriodoSelectorProps) {
  const [openMenu, setOpenMenu] = useState<"mes" | "trim" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenu]);

  const mesLabel = `${MES_FULL[mes - 1]} ${year}`;
  const trimLabel = `Q${trimestre} ${year}`;

  return (
    <div ref={containerRef} className="flex flex-wrap items-start gap-2">
      {/* Mes pill */}
      <PeriodoPill
        active={periodo === "mes"}
        hasDropdown
        open={openMenu === "mes"}
        onClick={() => {
          if (periodo !== "mes") {
            onPeriodoChange("mes");
            setOpenMenu(null);
          } else {
            setOpenMenu(openMenu === "mes" ? null : "mes");
          }
        }}
      >
        {periodo === "mes" ? mesLabel : "Mes"}
      </PeriodoPill>
      {openMenu === "mes" && (
        <DropdownPanel onClose={() => setOpenMenu(null)}>
          {mesesConData.length === 0
            ? <div className="px-3 py-2 text-xs text-stone-500">Sin meses con data</div>
            : mesesConData.map(m => (
                <DropdownItem
                  key={m}
                  active={m === mes}
                  onClick={() => { onMesChange(m); setOpenMenu(null); }}
                >
                  {MES_FULL[m - 1]} {year}
                </DropdownItem>
              ))}
        </DropdownPanel>
      )}

      {/* Trimestre pill */}
      <PeriodoPill
        active={periodo === "trimestre"}
        hasDropdown
        open={openMenu === "trim"}
        onClick={() => {
          if (periodo !== "trimestre") {
            onPeriodoChange("trimestre");
            setOpenMenu(null);
          } else {
            setOpenMenu(openMenu === "trim" ? null : "trim");
          }
        }}
      >
        {periodo === "trimestre" ? trimLabel : "Trimestre"}
      </PeriodoPill>
      {openMenu === "trim" && (
        <DropdownPanel onClose={() => setOpenMenu(null)}>
          {[1, 2, 3, 4].map(q => (
            <DropdownItem
              key={q}
              active={q === trimestre}
              onClick={() => { onTrimestreChange(q); setOpenMenu(null); }}
            >
              Q{q} {year}
            </DropdownItem>
          ))}
        </DropdownPanel>
      )}

      {/* YTD pill (sin dropdown) */}
      <PeriodoPill
        active={periodo === "ytd"}
        hasDropdown={false}
        open={false}
        onClick={() => { onPeriodoChange("ytd"); setOpenMenu(null); }}
      >
        YTD {year}
      </PeriodoPill>
    </div>
  );
}

function PeriodoPill({
  active, hasDropdown, open, onClick, children,
}: {
  active: boolean;
  hasDropdown: boolean;
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-medium transition",
        active
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
      )}
      aria-expanded={hasDropdown ? open : undefined}
    >
      <span>{children}</span>
      {active && hasDropdown && (
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      )}
    </button>
  );
}

function DropdownPanel({
  children, onClose,
}: { children: React.ReactNode; onClose: () => void }) {
  // ESC closes
  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);
  return (
    <div
      onKeyDown={onKey}
      className="w-full max-w-[220px] overflow-hidden rounded-md border border-stone-200 bg-white py-1 shadow-md md:w-auto md:min-w-[180px]"
      role="listbox"
    >
      {children}
    </div>
  );
}

function DropdownItem({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-2 text-left text-xs transition",
        active
          ? "bg-teal-50 font-medium text-teal-800"
          : "text-stone-700 hover:bg-stone-50"
      )}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filas
// ─────────────────────────────────────────────────────────────────────────────

function VendedoraRow({ v, rank }: { v: VendedoraDetalle; rank: number }) {
  const dv = formatDeltaRatio(v.delta_ventas_pct);
  const dt = formatDeltaRatio(v.delta_tickets_pct);
  return (
    <tr className={v.top ? "bg-amber-50/60" : ""}>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">{rank}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-sm text-stone-950">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{v.nombre}</span>
          {v.manager && (
            <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
              Manager
            </span>
          )}
          {v.top && (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              TOP
            </span>
          )}
        </div>
      </td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm text-stone-700 tabular-nums">
        {v.tickets.toLocaleString()}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">
        {fmtMoney(v.ventas)}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm text-stone-700 tabular-nums">
        ${v.ticket_promedio.toFixed(2)}
      </td>
      <td className={cn("border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[dv.tone])}>
        {dv.arrow && <span className="mr-1">{dv.arrow}</span>}
        {dv.displayValue}
      </td>
      <td className={cn("border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[dt.tone])}>
        {dt.arrow && <span className="mr-1">{dt.arrow}</span>}
        {dt.displayValue}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">
        ${v.comision.toFixed(2)}
      </td>
    </tr>
  );
}

function VendedoraCard({ v, rank }: { v: VendedoraDetalle; rank: number }) {
  const dv = formatDeltaRatio(v.delta_ventas_pct);
  return (
    <div className={cn(
      "rounded-lg border bg-white px-4 py-3.5",
      v.top ? "border-amber-200 bg-amber-50/40" : "border-stone-200"
    )}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-stone-500 tabular-nums">{rank}.</span>
        <span className="flex-1 truncate text-[15px] font-medium leading-tight text-stone-950">{v.nombre}</span>
        {v.manager && (
          <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">Manager</span>
        )}
        {v.top && (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">TOP</span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-base font-medium tabular-nums text-stone-950">
          {fmtMoneyCompact(v.ventas)}
        </span>
        <span className={cn("font-mono text-xs tabular-nums", TONE_LIGHT[dv.tone])}>
          {dv.arrow && <span className="mr-0.5">{dv.arrow}</span>}
          {dv.displayValue}
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
// Empty state + sort header
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Card className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-12 text-center">
      <Users className="h-10 w-10 text-stone-400" strokeWidth={1.5} />
      <p className="text-sm text-stone-500">Sin vendedoras con actividad en este período</p>
    </Card>
  );
}

function SortHeader({
  col, align, children, sortBy, sortDir, onClick,
}: {
  col: SortKey;
  align: "left" | "right";
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
        "cursor-pointer select-none whitespace-nowrap border-b border-stone-200 bg-stone-100 px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider transition",
        align === "right" ? "text-right" : "text-left",
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
