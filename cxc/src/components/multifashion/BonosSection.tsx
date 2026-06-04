"use client";

// Sección "Bonos del mes" del subtab Vendedoras (/multifashion).
//
// Dos bonos sobre el MES CERRADO (año contra año):
//   1. Bono gerente — ventas totales de la tienda vs el mismo mes del año
//      anterior. ≥5% y <10% → $50 · ≥10% → $100.
//   2. Bono vendedoras — $50 a la de mayor venta del mes (empate → todas).
//
// Server-side: RPC multifashion_bonos_v1 (migration 20260604130000). Es YoY e
// independiente de multifashion_vendedoras_v3 (que es MoM).

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Trophy, ChevronLeft, ChevronRight, Award } from "lucide-react";
import type { BonosMultifashion, BonoVendedora } from "@/components/ventas/types";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-stone-500",
};

interface BonosSectionProps {
  /** Año del selector global del shell de Multifashion. */
  selectedYear: number;
}

export function BonosSection({ selectedYear }: BonosSectionProps) {
  // Mes evaluado. null → el RPC elige el último mes elegible del año.
  const [mes, setMes] = useState<number | null>(null);
  const [resp, setResp] = useState<BonosMultifashion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef<string>("");

  // Al cambiar de año, re-defaultear el mes (lo resuelve el RPC).
  useEffect(() => {
    setMes(null);
  }, [selectedYear]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(selectedYear) });
    if (mes != null) params.set("mes", String(mes));
    fetch(`/api/multifashion/bonos?${params.toString()}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<BonosMultifashion>;
      })
      .then(json => {
        setResp(json);
        // Sincroniza el selector al mes que el server eligió por default.
        if (mes == null && !json.sin_data) setMes(json.mes_evaluado.mes);
      })
      .catch(err => {
        if (err?.name === "AbortError") return;
        console.error("[multifashion/bonos] fetch failed", err);
        setError(err instanceof Error ? err.message : "error inesperado");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [selectedYear, mes]);

  const selMes = mes ?? resp?.mes_evaluado.mes ?? null;

  const goPrev = () => { if (selMes && selMes > 1) setMes(selMes - 1); };
  const goNext = () => { if (selMes && selMes < 12) setMes(selMes + 1); };

  return (
    <section className="space-y-3">
      {/* Encabezado + selector de mes */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold text-stone-950">
          <Trophy className="h-4 w-4 text-amber-500" strokeWidth={2} />
          Bonos del mes
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!selMes || selMes <= 1}
            aria-label="Mes anterior"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select
            value={selMes ?? ""}
            onChange={e => setMes(Number(e.target.value))}
            className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800"
          >
            {MES_FULL.map((m, i) => (
              <option key={m} value={i + 1}>{m} {selectedYear}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={goNext}
            disabled={!selMes || selMes >= 12}
            aria-label="Mes siguiente"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudieron cargar los bonos: {error}
        </div>
      )}

      {resp?.sin_data && (
        <Card className="p-6 text-center text-sm text-stone-500">
          Sin datos de ventas de Multifashion todavía.
        </Card>
      )}

      {resp && !resp.sin_data && (
        <div className={cn("space-y-4", loading && "opacity-60 pointer-events-none transition-opacity")}>
          <GerenteCard resp={resp} onJumpToElegible={() => setMes(resp.ultimo_mes_elegible.mes)} />
          <VendedorasRanking resp={resp} />
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card del bono de la gerente
// ─────────────────────────────────────────────────────────────────────────────

function GerenteCard({
  resp, onJumpToElegible,
}: {
  resp: BonosMultifashion;
  onJumpToElegible: () => void;
}) {
  const g = resp.gerente;
  const mesLabel = `${MES_FULL[resp.mes_evaluado.mes - 1]} ${resp.mes_evaluado.year}`;
  const prevLabel = `${MES_FULL[resp.mes_evaluado.mes - 1]} ${resp.mes_evaluado.year - 1}`;
  const ultElegibleLabel = `${MES_FULL[resp.ultimo_mes_elegible.mes - 1]} ${resp.ultimo_mes_elegible.year}`;
  const delta = formatDeltaRatio(g.delta_pct);
  const deltaExact = g.delta_pct != null
    ? `${g.delta_pct >= 0 ? "+" : ""}${(g.delta_pct * 100).toFixed(1)}%`
    : "—";

  const bonoColor = g.bono === 100
    ? "text-emerald-600"
    : g.bono === 50
      ? "text-teal-600"
      : "text-stone-400";

  return (
    <Card className="overflow-hidden border-teal-100 p-0">
      <div className="border-b border-teal-100 bg-teal-50/60 px-4 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-teal-700">
          Bono gerente · {mesLabel}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-stone-950">
          {g.nombre ?? "Sin gerente configurada"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Metric label={`Ventas ${resp.mes_evaluado.year}`} value={fmtMoney(g.ventas_mes)} />
        <Metric label={`Ventas ${prevLabel}`} value={g.tiene_comparacion ? fmtMoney(g.ventas_mes_prev) : "—"} />
        <Metric
          label="Crecimiento"
          value={deltaExact}
          valueClass={cn("tabular-nums", TONE_LIGHT[delta.tone])}
          arrow={delta.arrow}
        />
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-wider text-stone-500">Bono</span>
          <span className={cn("font-display text-2xl font-bold tabular-nums", bonoColor)}>
            ${g.bono}
          </span>
        </div>
      </div>

      <div className="border-t border-stone-100 px-4 py-2.5 text-[11px] text-stone-500">
        Regla: crecimiento ≥ 5% y &lt; 10% → <span className="font-medium text-teal-600">$50</span> ·
        {" "}≥ 10% → <span className="font-medium text-emerald-600">$100</span> · vs mismo mes año anterior.
      </div>

      {!resp.es_elegible && (
        <div className="border-t border-amber-100 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900">
          {mesLabel} aún no es evaluable (mes en curso o data incompleta) — el bono se calcula al cerrar el mes.
          {resp.ultimo_mes_elegible.mes !== resp.mes_evaluado.mes || resp.ultimo_mes_elegible.year !== resp.mes_evaluado.year ? (
            <>
              {" "}
              <button type="button" onClick={onJumpToElegible} className="font-medium underline">
                Ver {ultElegibleLabel}
              </button>
            </>
          ) : null}
        </div>
      )}

      {resp.es_elegible && !g.tiene_comparacion && (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-2.5 text-xs text-stone-500">
          Sin datos de {prevLabel} para comparar — no se puede calcular el bono.
        </div>
      )}
    </Card>
  );
}

function Metric({
  label, value, valueClass, arrow,
}: {
  label: string;
  value: string;
  valueClass?: string;
  arrow?: "▲" | "▼" | null;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-stone-500">{label}</span>
      <span className={cn("font-mono text-base font-medium text-stone-950", valueClass)}>
        {arrow && <span className="mr-1">{arrow}</span>}
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking de vendedoras (YoY) con badge "Bono $50"
// ─────────────────────────────────────────────────────────────────────────────

function VendedorasRanking({ resp }: { resp: BonosMultifashion }) {
  const list = resp.vendedoras;
  const mesLabel = `${MES_FULL[resp.mes_evaluado.mes - 1]} ${resp.mes_evaluado.year}`;

  if (list.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-stone-500">
        Sin vendedoras con actividad en {mesLabel}.
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-stone-500">
        Ranking de vendedoras · {mesLabel} · Δ vs mismo mes {resp.mes_evaluado.year - 1}
        {!resp.es_elegible && " · bono pendiente de cierre"}
      </p>

      {/* Desktop */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 720 }}>
            <thead>
              <tr className="bg-stone-100">
                <th className="w-10 border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">#</th>
                <th className="border-b border-stone-200 px-3.5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-500">Vendedora</th>
                <th className="border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">Tickets</th>
                <th className="border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">Ventas</th>
                <th className="border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">Ticket prom.</th>
                <th className="border-b border-stone-200 px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-500">Δ vs año pasado</th>
              </tr>
            </thead>
            <tbody>
              {list.map((v, i) => (
                <Row key={v.nombre} v={v} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile */}
      <div className="space-y-2 md:hidden">
        {list.map((v, i) => (
          <MobileCard key={v.nombre} v={v} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function Tags({ v }: { v: BonoVendedora }) {
  return (
    <>
      {v.manager && (
        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
          Gerente
        </span>
      )}
      {v.bono_vendedora && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
          <Award className="h-3 w-3" /> Bono $50
        </span>
      )}
    </>
  );
}

function Row({ v, rank }: { v: BonoVendedora; rank: number }) {
  const dv = formatDeltaRatio(v.delta_ventas_pct);
  return (
    <tr className={v.bono_vendedora ? "bg-amber-50/60" : ""}>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">{rank}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-sm text-stone-950">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{v.nombre}</span>
          <Tags v={v} />
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
    </tr>
  );
}

function MobileCard({ v, rank }: { v: BonoVendedora; rank: number }) {
  const dv = formatDeltaRatio(v.delta_ventas_pct);
  return (
    <div className={cn(
      "rounded-lg border bg-white px-4 py-3.5",
      v.bono_vendedora ? "border-amber-200 bg-amber-50/40" : "border-stone-200"
    )}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-stone-500 tabular-nums">{rank}.</span>
        <span className="flex-1 truncate text-[15px] font-medium leading-tight text-stone-950">{v.nombre}</span>
        <Tags v={v} />
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
        <span className="font-mono tabular-nums">${v.ticket_promedio.toFixed(2)}</span> tkt prom
      </div>
    </div>
  );
}
