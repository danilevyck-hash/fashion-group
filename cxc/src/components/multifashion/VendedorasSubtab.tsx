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
// anterior · YTD · últimos 3/6/12. La columna Δ es ÚNICA y su rótulo dice
// CONTRA QUÉ compara: en los chips de mes la RPC compara contra el MES
// ANTERIOR (`p_mes − 1`), así que dice «Δ vs julio 2026» y no «vs año pasado»
// (decisión de Daniel, 3-sep-2026 — ver `vendedoras-rotulo.ts`); YTD y las
// ventanas de N meses sí comparan contra el año pasado y lo dicen.
//
// Server-side: RPC multifashion_vendedoras (ranking por período) +
// multifashion_bonos_v3 (bono del mes, vía BonosSection). Sin fórmulas nuevas.

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
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
import { variacionPctDesdeRatio } from "@/lib/variacion";
import { cn } from "@/lib/utils";
import { BonosSection } from "./BonosSection";
import { MetasEnVendedoras } from "./MetasEnVendedoras";
import { notaComparacionVendedoras, rotuloDeltaVendedoras, type ChipVendedoras } from "@/lib/multifashion/vendedoras-rotulo";

const MES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-gray-500",
};

type SortKey = "tickets" | "ventas" | "delta_ventas" | "comision";
type SortDir = "asc" | "desc";
type ChipKey = ChipVendedoras;

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

  // Ventana rolling (botones "Últimos N meses"): periodo='ultimos', N meses
  // terminando en el mes en curso. Δ vs misma ventana del año anterior; sin bono.
  const rangoN = chip === "ultimos_3" ? 3 : chip === "ultimos_6" ? 6 : chip === "ultimos_12" ? 12 : null;
  const esRango = rangoN != null;

  // Parámetros del ranking según el chip.
  const rpcPeriodo: VendedorasPeriodoTipo | "ultimos" =
    esRango ? "ultimos" : chip === "ytd" ? "ytd" : "mes";
  const rpcMes = chip === "en_curso" ? enCursoMes : mesAnteriorMes;
  // Mes cuyo bono se evalúa: en_curso → mes en curso (será pendiente);
  // mes_anterior / ytd → último mes cerrado. (No aplica a ventanas rolling.)
  const bonoMes = chip === "en_curso" ? enCursoMes : mesAnteriorMes;

  const [bonos, setBonos] = useState<BonosMultifashion | null>(null);
  const onBonosData = useCallback((r: BonosMultifashion | null) => setBonos(r), []);

  const [sortBy, setSortBy] = useState<SortKey>("ventas");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Querystring del ranking — MISMOS params que antes: year + periodo; mes solo
  // en "mes"; n+mes(en curso) en "ultimos". El querystring ES la clave SWR →
  // cada combinación (año/chip/mes) cachea por separado; volver a un chip ya
  // visto pinta al instante y revalida en background. SWR maneja cancelación.
  const params = new URLSearchParams({ year: String(year), periodo: rpcPeriodo });
  if (rpcPeriodo === "mes") params.set("mes", String(rpcMes));
  if (rpcPeriodo === "ultimos") { params.set("n", String(rangoN)); params.set("mes", String(enCursoMes)); }
  const vendedorasUrl = `/api/multifashion/vendedoras?${params.toString()}`;

  const { data: resp, error, isLoading, mutate } = useSWR<VendedorasPeriodo>(
    vendedorasUrl,
    async (url: string) => {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<VendedorasPeriodo>;
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const loading = isLoading && !resp;
  const errorMsg = error ? (error instanceof Error ? error.message : "error inesperado") : null;

  // Badges de bono por nombre (solo cuando el mes es evaluable; nunca en rangos).
  const bonoBadges = useMemo(() => {
    const map = new Map<string, BonoBadge>();
    if (esRango) return map;
    if (bonos && !bonos.sin_data && bonos.es_elegible) {
      const gerenteBono = bonos.gerente.bono;
      for (const v of bonos.vendedoras) {
        map.set(v.nombre, { winner: v.bono_vendedora, gerenteBono });
      }
    }
    return map;
  }, [bonos, esRango]);

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

  // Contra qué compara la Δ en el chip activo (ver el encabezado del archivo).
  const rotuloDelta = rotuloDeltaVendedoras(chip, rpcMes, year);
  const notaComparacion = resp
    ? notaComparacionVendedoras(chip, rpcMes, year, resp.es_periodo_parcial, resp.dia_corte_periodo_anterior)
    : null;

  const chipLabel: Record<ChipKey, string> = {
    en_curso: `${MES_FULL[enCursoMes - 1]} ${year} (en curso)`,
    mes_anterior: `${MES_FULL[mesAnteriorMes - 1]} ${year}`,
    ytd: `YTD ${year}`,
    ultimos_3: "Últimos 3 meses",
    ultimos_6: "Últimos 6 meses",
    ultimos_12: "Últimos 12 meses",
  };

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar el ranking: {errorMsg}
          <button onClick={() => mutate()} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
        </div>
      )}

      {/* Banner del bono gerente (una línea). Eleva la data para los badges.
          No aplica a ventanas rolling (el bono es por mes). */}
      {!esRango && (
        <BonosSection selectedYear={year} mes={bonoMes} onData={onBonosData} />
      )}

      {/* Chips de período: mes en curso · mes cerrado · YTD · ventanas rolling. */}
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
        <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden />
        <ChipPill active={chip === "ultimos_3"} onClick={() => setChip("ultimos_3")}>Últimos 3 meses</ChipPill>
        <ChipPill active={chip === "ultimos_6"} onClick={() => setChip("ultimos_6")}>Últimos 6 meses</ChipPill>
        <ChipPill active={chip === "ultimos_12"} onClick={() => setChip("ultimos_12")}>Últimos 12 meses</ChipPill>
      </div>

      {/* Subtitle */}
      <div className={cn(loading && "opacity-60 transition-opacity")}>
        {/* `sr-only`: la pestaña dice "Vendedoras" y las píldoras de acá arriba
            enseñan el período elegido. El encabezado sigue existiendo para
            quien navega con lector de pantalla. */}
        <h3 className="sr-only">Vendedoras · {chipLabel[chip]}</h3>
        {resp && (
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-mono tabular-nums text-gray-700">{resp.total_vendedoras_periodo}</span> vendedoras ·{" "}
            <span className="font-mono tabular-nums text-gray-700">{fmtMoney(resp.ventas_total)}</span> ventas ·{" "}
            <span className="font-mono tabular-nums text-gray-700">{resp.tickets_total.toLocaleString()}</span> tickets
          </p>
        )}
        <p className="mt-1 text-xs text-gray-400">
          Ventas atribuidas a cada vendedor (incluye mayoreo si lo hubo).
          {notaComparacion && <> {notaComparacion}</>}
        </p>
      </div>

      {/* Tabla única */}
      {resp && resp.vendedoras.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={cn(loading && "opacity-60 pointer-events-none transition-opacity")}>
          {/* Escritorio. El corte es `lg` y no `md` porque lo que decide es el
              ancho ÚTIL, no el de la ventana: la barra lateral se lleva 224 px,
              así que un iPad de 834 deja 552 y esta tabla pide 760 (su propio
              `minWidth`) — 208 px de arrastre, medidos en el navegador. Las
              tarjetas de abajo ya existían; solo se les amplió el tramo. */}
          <Card data-vista="tabla" className="hidden p-0 lg:block">
            <div className="overflow-x-auto">
              {/* 720 y no 760: a 1024 px (el MISMO iPad, acostado) el contenido
                  dispone de 742, así que el piso viejo forzaba 18 px de arrastre
                  justo ahí. Bajarlo no aprieta nada en pantallas anchas — la
                  tabla es `w-full` y ya mide más que su piso. */}
              <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="w-10 border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">#</th>
                    <th className="border-b border-gray-200 px-3.5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Vendedora</th>
                    <SortHeader col="tickets"      sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Tickets</SortHeader>
                    <SortHeader col="ventas"       sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Ventas</SortHeader>
                    <th className="border-b border-gray-200 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ticket prom.</th>
                    <SortHeader col="delta_ventas" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>{rotuloDelta.columna}</SortHeader>
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

          {/* Celular e iPad */}
          <div data-vista="tarjetas" className="space-y-2 lg:hidden">
            {sortedVendedoras.map((v, i) => (
              <VendedoraCard key={v.nombre} v={v} rank={i + 1} badge={bonoBadges.get(v.nombre)} rotuloDelta={rotuloDelta.corto} />
            ))}
          </div>
        </div>
      )}

      {/* Las metas andando, al final y sin tocar nada de lo de arriba.
          · Meta GRUPAL      → cuánto APORTÓ cada una al avance (sin podio).
          · Meta POR VENDEDORA → la meta de cada una y su avance.
          Si no hay metas instaladas o no hay ninguna andando, no dibuja nada. */}
      <MetasEnVendedoras />
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
        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700">Gerente</span>
      )}
      {badge?.winner && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
          <Award className="h-3 w-3" /> Bono $50
        </span>
      )}
      {v.manager && badge && badge.gerenteBono > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
          <Award className="h-3 w-3" /> Bono ${badge.gerenteBono}
        </span>
      )}
    </>
  );
}

function rowHighlight(v: VendedoraDetalle, badge?: BonoBadge): boolean {
  return !!badge?.winner || (v.manager && !!badge && badge.gerenteBono > 0);
}

// El payload no trae las ventas del período previo, así que la base se despeja
// del propio ratio (prev = ventas / (1 + pct)) y se le aplica la MISMA regla.
// Una vendedora que el año pasado vendió $8 en el mes no genera un +40000%.
function VendedoraRow({ v, rank, badge }: { v: VendedoraDetalle; rank: number; badge?: BonoBadge }) {
  const dv = formatDeltaRatio(variacionPctDesdeRatio(v.ventas, v.delta_ventas_pct));
  return (
    <tr className={rowHighlight(v, badge) ? "bg-amber-50/60" : ""}>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{rank}</td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-sm text-gray-950">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{v.nombre}</span>
          <BonoBadges v={v} badge={badge} />
        </div>
      </td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums">{v.tickets.toLocaleString()}</td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">{fmtMoney(v.ventas)}</td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm text-gray-700 tabular-nums">${v.ticket_promedio.toFixed(2)}</td>
      <td className={cn("border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[dv.tone])}>
        {dv.arrow && <span className="mr-1">{dv.arrow}</span>}{dv.displayValue}
      </td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">${v.comision.toFixed(2)}</td>
    </tr>
  );
}

function VendedoraCard({ v, rank, badge, rotuloDelta }: { v: VendedoraDetalle; rank: number; badge?: BonoBadge; rotuloDelta: string }) {
  const dv = formatDeltaRatio(variacionPctDesdeRatio(v.ventas, v.delta_ventas_pct));
  return (
    <div className={cn(
      "rounded-lg border bg-white px-4 py-3.5",
      rowHighlight(v, badge) ? "border-amber-200 bg-amber-50/40" : "border-gray-200"
    )}>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-mono text-xs text-gray-500 tabular-nums">{rank}.</span>
        <span className="truncate text-[15px] font-medium leading-tight text-gray-950">{v.nombre}</span>
        <BonoBadges v={v} badge={badge} />
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-base font-medium tabular-nums text-gray-950">{fmtMoneyCompact(v.ventas)}</span>
        <span className={cn("font-mono text-xs tabular-nums", TONE_LIGHT[dv.tone])}>
          {dv.arrow && <span className="mr-0.5">{dv.arrow}</span>}{dv.displayValue}
          <span className="ml-1 text-gray-400">{rotuloDelta}</span>
        </span>
      </div>
      <div className="mt-1 text-xs text-gray-500">
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
        "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-medium transition",
        active ? "border-teal-700 bg-teal-700 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <Card className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-12 text-center">
      <Users className="h-10 w-10 text-gray-400" strokeWidth={1.5} />
      <p className="text-sm text-gray-500">Sin vendedoras con actividad en este período</p>
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
        "cursor-pointer select-none whitespace-nowrap border-b border-gray-200 bg-gray-100 px-3.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide transition",
        active ? "text-gray-950" : "text-gray-500 hover:text-gray-700"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={cn("text-xs", active ? "opacity-100" : "opacity-35")}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}
