"use client";

// Banner del bono de gerente del subtab Vendedoras (/multifashion) — v3.
//
// Tras el rediseño v3 (Daniel jun-2026) esto YA NO renderiza una tabla de
// ranking propia: la única tabla de vendedoras vive en VendedorasSubtab con los
// badges de bono inline. Acá queda SOLO la línea de contexto del bono gerente
// (tienda completa, incl. mayoreo) y se eleva la data cruda al padre vía onData
// para que arme los badges de la tabla única.
//
// Poda 1 (Daniel): el banner NO lleva el badge del bono; "✓ Bono $X" del gerente
// vive únicamente como badge en su fila de la tabla.
//
// Server-side: RPC multifashion_bonos_v3 (migration 20260604180000). Misma
// fuente que Overview (_multifashion_sf_vw / switch_facturas), tienda completa.

import { useEffect } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";
import type { BonosMultifashion } from "@/components/ventas/types";
import { fmtMoney } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { variacionPct, fmtVariacionPct } from "@/lib/variacion";
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
  stone:   "text-gray-500",
};

interface BonosSectionProps {
  /** Año del selector global del shell de Multifashion. */
  selectedYear: number;
  /** Mes (1-12) cuyo bono se evalúa (lo deriva VendedorasSubtab según el chip). */
  mes: number;
  /** Eleva la respuesta de bonos al padre para armar los badges de la tabla única. */
  onData: (resp: BonosMultifashion | null) => void;
}

export function BonosSection({ selectedYear, mes, onData }: BonosSectionProps) {
  // Bono por año+mes vía SWR (el querystring es la clave → cachea por combinación
  // y revalida en background). Eleva la respuesta al padre vía onData en un
  // useEffect (no en el fetcher) para que los badges de la tabla se sincronicen
  // tanto con caché como con dato fresco.
  const bonosUrl = `/api/multifashion/bonos?${new URLSearchParams({ year: String(selectedYear), mes: String(mes) }).toString()}`;

  const { data: resp, error, isLoading, mutate } = useSWR<BonosMultifashion>(
    bonosUrl,
    async (url: string) => {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<BonosMultifashion>;
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const loading = isLoading && !resp;

  // Mantiene el contrato original con el padre: eleva la respuesta (o null en
  // error) para que VendedorasSubtab arme los badges de bono de la tabla única.
  useEffect(() => {
    onData(error ? null : (resp ?? null));
  }, [resp, error, onData]);

  if (error) {
    const errorMsg = error instanceof Error ? error.message : "error inesperado";
    return (
      <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
        No se pudieron cargar los bonos: {errorMsg}
        <button onClick={() => mutate()} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
      </div>
    );
  }
  if (!resp || resp.sin_data) {
    return resp?.sin_data
      ? <Card className="p-4 text-center text-xs text-gray-500">Sin datos de ventas de Multifashion todavía.</Card>
      : null;
  }

  return (
    <div className={cn(loading && "opacity-60 transition-opacity")}>
      {resp.es_elegible
        ? <GerenteBanner resp={resp} />
        : <PendienteBanner resp={resp} />}
    </div>
  );
}

// Banner de UNA línea: tienda completa (incl. mayoreo) vs mismo mes año anterior.
// SIN badge de bono (poda 1) — el bono del gerente va como badge en su fila.
function GerenteBanner({ resp }: { resp: BonosMultifashion }) {
  const g = resp.gerente;
  const mesLabel = `${MES_FULL[resp.mes_evaluado.mes - 1]} ${resp.mes_evaluado.year}`;
  // La RPC corta en `ventas_prev > 0`; acá se re-valida contra la base REAL
  // que el payload ya trae. Ojo: esto arregla lo que se MUESTRA, no el monto
  // del bono — ese lo decide la RPC y cambiarlo sería mover plata.
  const deltaPct = variacionPct(g.ventas_mes, g.ventas_mes_prev);
  const delta = formatDeltaRatio(deltaPct);
  const deltaExacto = deltaPct == null ? null : fmtVariacionPct(deltaPct, true, 1);
  const tooltipRegla = deltaExacto
    ? `${REGLA_BONO} · Crecimiento exacto este mes: ${deltaExacto} → bono $${g.bono}.`
    : REGLA_BONO;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-teal-100 bg-teal-50/50 px-3.5 py-2.5 text-sm">
      <span className="font-medium text-gray-700">Tienda completa {mesLabel} (incl. mayoreo):</span>
      {g.tiene_comparacion ? (
        <>
          <span className="font-mono tabular-nums text-gray-900">{fmtMoney(g.ventas_mes)}</span>
          <span className="text-gray-400">vs</span>
          <span className="font-mono tabular-nums text-gray-600">{fmtMoney(g.ventas_mes_prev)} ({resp.mes_evaluado.year - 1})</span>
          <span className={cn("font-mono tabular-nums font-medium", TONE_LIGHT[delta.tone])}>
            {delta.arrow && <span className="mr-0.5">{delta.arrow}</span>}{delta.displayValue}
          </span>
        </>
      ) : (
        <>
          <span className="font-mono tabular-nums text-gray-900">{fmtMoney(g.ventas_mes)}</span>
          <span className="text-gray-500">· sin comparativo {resp.mes_evaluado.year - 1}</span>
        </>
      )}
      <span title={tooltipRegla} className="ml-0.5 inline-flex cursor-help text-gray-400" aria-label="Regla del bono">
        <Info className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

// Mes en curso / no evaluable: una línea de aviso (sin cifras de bono).
function PendienteBanner({ resp }: { resp: BonosMultifashion }) {
  const mesLabel = `${MES_FULL[resp.mes_evaluado.mes - 1]} ${resp.mes_evaluado.year}`;
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3.5 py-2.5 text-sm text-gray-600">
      Bono de {mesLabel} pendiente — se calcula al cierre del mes.
    </div>
  );
}
