"use client";

// Sección "Bonos del mes" del subtab Vendedoras (/multifashion).
//
// Dos bonos sobre el MES CERRADO (año contra año), universo TIENDA COMPLETA
// (retail + mayoreo):
//   1. Bono gerente — ventas totales de la tienda vs el mismo mes del año
//      anterior. ≥5% y <10% → $50 · ≥10% → $100. Se muestra como línea de
//      contexto sobre el ranking; la gerente lleva su badge en su propia fila.
//   2. Bono vendedoras — $50 a la de mayor venta del mes (empate → todas).
//
// El mes lo fija el selector ÚNICO del header. Si el mes no es evaluable (en
// curso o data incompleta) NO se muestran cifras: solo aviso + link al último
// mes evaluable.
//
// Server-side: RPC multifashion_bonos_v3 (migration 20260604180000). Misma
// fuente que Overview (_multifashion_sf_vw / switch_facturas), tienda completa.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Trophy, Award, Clock, Info } from "lucide-react";
import type { BonosMultifashion, BonoVendedora } from "@/components/ventas/types";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const REGLA_BONO =
  "Crecimiento ≥ 5% y < 10% → $50 · ≥ 10% → $100. Tienda completa (retail + mayoreo) vs el mismo mes del año anterior.";

const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-stone-500",
};

function bonoColor(bono: number): string {
  if (bono === 100) return "text-emerald-600";
  if (bono === 50) return "text-teal-600";
  return "text-stone-400";
}

interface BonosSectionProps {
  /** Año del selector global del shell de Multifashion. */
  selectedYear: number;
  /** Mes (1-12) del selector único del header. */
  mes: number;
  /** Cambia el mes del selector único (para el link "ver último mes evaluable"). */
  onMesChange: (mes: number) => void;
}

export function BonosSection({ selectedYear, mes, onMesChange }: BonosSectionProps) {
  const [resp, setResp] = useState<BonosMultifashion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(selectedYear), mes: String(mes) });
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
      .then(json => setResp(json))
      .catch(err => {
        if (err?.name === "AbortError") return;
        console.error("[multifashion/bonos] fetch failed", err);
        setError(err instanceof Error ? err.message : "error inesperado");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [selectedYear, mes, reloadKey]);

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-display text-base font-semibold text-stone-950">
        <Trophy className="h-4 w-4 text-amber-500" strokeWidth={2} />
        Bonos del mes
      </h3>

      {error && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudieron cargar los bonos: {error}
          <button onClick={() => setReloadKey((k) => k + 1)} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
        </div>
      )}

      {resp?.sin_data && (
        <Card className="p-6 text-center text-sm text-stone-500">
          Sin datos de ventas de Multifashion todavía.
        </Card>
      )}

      {resp && !resp.sin_data && (
        <div className={cn("space-y-3", loading && "opacity-60 pointer-events-none transition-opacity")}>
          {resp.es_elegible ? (
            <>
              <GerenteLine resp={resp} />
              <VendedorasRanking resp={resp} />
            </>
          ) : (
            <PendienteCard resp={resp} onMesChange={onMesChange} selectedYear={selectedYear} />
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Línea de contexto del bono gerente (compacta, sobre el ranking)
// ─────────────────────────────────────────────────────────────────────────────

function GerenteLine({ resp }: { resp: BonosMultifashion }) {
  const g = resp.gerente;
  const mesLabel = `${MES_FULL[resp.mes_evaluado.mes - 1]} ${resp.mes_evaluado.year}`;
  const delta = formatDeltaRatio(g.delta_pct);
  // Display sin decimales (delta.displayValue ya redondea a 0). El % exacto con
  // 1 decimal va al tooltip para explicar casos límite (ej. 4.6% se muestra +5%
  // pero NO genera bono).
  const deltaExactPrecise = g.delta_pct != null
    ? `${g.delta_pct >= 0 ? "+" : ""}${(g.delta_pct * 100).toFixed(1)}%`
    : null;
  const tooltipRegla = deltaExactPrecise
    ? `${REGLA_BONO} · Crecimiento exacto este mes: ${deltaExactPrecise} → bono $${g.bono}.`
    : REGLA_BONO;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-teal-100 bg-teal-50/50 px-3.5 py-2.5 text-sm">
      <span className="font-medium text-stone-700">Tienda {mesLabel}:</span>
      {g.tiene_comparacion ? (
        <>
          <span className="font-mono tabular-nums text-stone-900">{fmtMoney(g.ventas_mes)}</span>
          <span className="text-stone-400">vs</span>
          <span className="font-mono tabular-nums text-stone-600">{fmtMoney(g.ventas_mes_prev)}</span>
          <span className="text-[11px] text-stone-400">(tienda completa, incl. mayoreo)</span>
          <span className="text-stone-400">→</span>
          <span className={cn("font-mono tabular-nums font-medium", TONE_LIGHT[delta.tone])}>
            {delta.arrow && <span className="mr-0.5">{delta.arrow}</span>}{delta.displayValue}
          </span>
          <span className="text-stone-400">→</span>
          <span className={cn("font-semibold", bonoColor(g.bono))}>bono gerente ${g.bono}</span>
        </>
      ) : (
        <>
          <span className="font-mono tabular-nums text-stone-900">{fmtMoney(g.ventas_mes)}</span>
          <span className="text-[11px] text-stone-400">(tienda completa, incl. mayoreo)</span>
          <span className="text-stone-500">· sin comparativo {resp.mes_evaluado.year - 1} para el bono</span>
        </>
      )}
      <span title={tooltipRegla} className="ml-0.5 inline-flex cursor-help text-stone-400" aria-label="Regla del bono">
        <Info className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mes no evaluable — SIN cifras. Solo aviso + link al último mes evaluable.
// ─────────────────────────────────────────────────────────────────────────────

function PendienteCard({
  resp, onMesChange, selectedYear,
}: {
  resp: BonosMultifashion;
  onMesChange: (mes: number) => void;
  selectedYear: number;
}) {
  const mesLabel = `${MES_FULL[resp.mes_evaluado.mes - 1]} ${resp.mes_evaluado.year}`;
  const ult = resp.ultimo_mes_elegible;
  const ultLabel = `${MES_FULL[ult.mes - 1]} ${ult.year}`;
  const distinto = ult.mes !== resp.mes_evaluado.mes || ult.year !== resp.mes_evaluado.year;
  const puedeNavegar = distinto && ult.year === selectedYear;

  return (
    <Card className="flex flex-col items-center gap-2 border-dashed border-stone-300 bg-stone-50/60 p-6 text-center">
      <Clock className="h-7 w-7 text-stone-400" strokeWidth={1.5} />
      <p className="text-sm font-medium text-stone-700">
        Bono de {mesLabel} pendiente — se calcula al cierre del mes
      </p>
      <p className="max-w-md text-xs text-stone-500">
        El mes está en curso o su data aún no está completa. Las cifras y el bono
        aparecen cuando el mes cierra.
      </p>
      {puedeNavegar && (
        <button
          type="button"
          onClick={() => onMesChange(ult.mes)}
          className="mt-1 inline-flex items-center rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-400"
        >
          Ver {ultLabel}
        </button>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking de vendedoras (YoY) con badges de bono — solo en meses evaluables
// ─────────────────────────────────────────────────────────────────────────────

function VendedorasRanking({ resp }: { resp: BonosMultifashion }) {
  const list = resp.vendedoras;
  const gerenteBono = resp.gerente.bono;
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
                <Row key={v.nombre} v={v} rank={i + 1} gerenteBono={gerenteBono} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile */}
      <div className="space-y-2 md:hidden">
        {list.map((v, i) => (
          <MobileCard key={v.nombre} v={v} rank={i + 1} gerenteBono={gerenteBono} />
        ))}
      </div>
    </div>
  );
}

// Badges de la fila: bono vendedora $50, bono gerente (monto del mes), y tag Gerente.
function Tags({ v, gerenteBono }: { v: BonoVendedora; gerenteBono: number }) {
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
      {v.manager && gerenteBono > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
          <Award className="h-3 w-3" /> Bono ${gerenteBono}
        </span>
      )}
    </>
  );
}

function rowHighlight(v: BonoVendedora, gerenteBono: number): boolean {
  return v.bono_vendedora || (v.manager && gerenteBono > 0);
}

function Row({ v, rank, gerenteBono }: { v: BonoVendedora; rank: number; gerenteBono: number }) {
  const dv = formatDeltaRatio(v.delta_ventas_pct);
  return (
    <tr className={rowHighlight(v, gerenteBono) ? "bg-amber-50/60" : ""}>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">{rank}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-sm text-stone-950">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{v.nombre}</span>
          <Tags v={v} gerenteBono={gerenteBono} />
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

function MobileCard({ v, rank, gerenteBono }: { v: BonoVendedora; rank: number; gerenteBono: number }) {
  const dv = formatDeltaRatio(v.delta_ventas_pct);
  return (
    <div className={cn(
      "rounded-lg border bg-white px-4 py-3.5",
      rowHighlight(v, gerenteBono) ? "border-amber-200 bg-amber-50/40" : "border-stone-200"
    )}>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-mono text-xs text-stone-500 tabular-nums">{rank}.</span>
        <span className="truncate text-[15px] font-medium leading-tight text-stone-950">{v.nombre}</span>
        <Tags v={v} gerenteBono={gerenteBono} />
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
