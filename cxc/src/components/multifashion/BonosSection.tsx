"use client";

// El CONTEXTO del bono del gerente en el subtab Vendedoras (/multifashion).
//
// 🩸 DEJÓ DE SER UNA BARRA (6-sep-2026). Era un recuadro de color a lo ancho de
// la pantalla, arriba de la tabla, para decir una cosa que le toca a UNA fila.
// El BONO se mudó a una COLUMNA de la tabla (ver `VendedorasSubtab`), y acá
// queda una línea gris con lo único que la columna no puede decir: cuánto vendió
// la TIENDA COMPLETA ese mes contra el mismo mes del año pasado, que es la base
// del bono del gerente.
//
// El aviso «pendiente — se calcula al cierre del mes» también se fue: eso lo
// dice ahora la propia columna, con la palabra **«al cierre»** en cada fila.
//
// Este componente sigue siendo quien PIDE los bonos y los eleva al padre vía
// `onData` — la columna se arma con esa misma respuesta, sin una segunda lectura.
//
// Server-side: RPC multifashion_bonos_v4 (con el amarre de códigos; cae a la v3
// mientras la migración no corra). Misma fuente que Overview
// (_multifashion_sf_vw / switch_facturas), tienda completa.

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

  // Mes todavía abierto: no hay nada que contar que la columna «Bono» no diga ya.
  if (!resp.es_elegible) return null;

  return (
    <div className={cn(loading && "opacity-60 transition-opacity")}>
      <GerenteLinea resp={resp} />
    </div>
  );
}

// UNA línea gris (ya no un recuadro de color): tienda completa (incl. mayoreo)
// contra el mismo mes del año anterior. El bono en sí vive en la columna.
function GerenteLinea({ resp }: { resp: BonosMultifashion }) {
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
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500">
      <span>Tienda completa {mesLabel} (incl. mayoreo):</span>
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
