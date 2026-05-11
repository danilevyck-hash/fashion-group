"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search } from "lucide-react";
import type { Clientes, Cliente } from "./types";
import { fmtMoney } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";
import { ClienteHoverCard, type HistorialState } from "./ClienteHoverCard";
import { OtrosClientesDialog } from "./OtrosClientesDialog";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

type SortKey = "rank" | "nombre" | "empresa" | "ytd" | "delta" | "ultima";
type SortDir = "asc" | "desc";

// Mapping de tono semántico → clase Tailwind para celdas con bg claro.
// Histórico de Clientes usa red-600 para negativos (no orange-600 como Resumen).
const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-stone-500",
};

// Label legible del sort actual para el subtitle del header.
const SORT_LABELS: Record<SortKey, string> = {
  rank:    "rank",
  nombre:  "nombre",
  empresa: "empresa",
  ytd:     "compras YTD",
  delta:   "delta",
  ultima:  "última compra",
};

const EMPRESA_PILLS: { id: string; label: string }[] = [
  { id: "todas",                label: "Todas" },
  { id: "vistana",              label: "Vistana International" },
  { id: "fashion_wear",         label: "Fashion Wear" },
  { id: "fashion_shoes",        label: "Fashion Shoes" },
  { id: "active_shoes",         label: "Active Shoes" },
  { id: "active_wear",          label: "Active Wear" },
  { id: "joystep",              label: "Joystep" },
  { id: "confecciones_boston",  label: "Confecciones Boston" },
  { id: "american_classic",     label: "Multifashion" },
];

// Pills donde la fila agregada "Otros clientes" NO se renderiza.
// Boston y Multifashion son retail con semántica propia; no consolidan
// huérfanos en una fila agregada.
const SKIP_OTROS_FOR = new Set(["confecciones_boston", "american_classic"]);

export function ClientesView({ data: initialData }: { data: Clientes }) {
  const [search, setSearch] = useState("");
  const [empresa, setEmpresa] = useState("todas");
  const [data, setData] = useState<Clientes>(initialData);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [sortBy, setSortBy] = useState<SortKey>("ultima");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [otrosOpen, setOtrosOpen] = useState(false);

  // Pill click → refetch desde server (la branching cliente/empresa vive en queries.ts)
  const onEmpresaChange = async (next: string) => {
    if (next === empresa) return;
    setEmpresa(next);
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/ventas/clientes-12m?empresa=${encodeURIComponent(next)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const fresh = (await res.json()) as Clientes;
      startTransition(() => setData(fresh));
    } catch (err) {
      console.error("[ventas/clientes] refetch failed", err);
      setFetchError(err instanceof Error ? err.message : "error inesperado");
    } finally {
      setLoading(false);
    }
  };

  // Cache de historial-mensual por (codigo + empresaKey). Lazy: solo se
  // popula al primer hover sobre cada cliente. Segundo hover = instantáneo.
  const [historialCache, setHistorialCache] = useState<Record<string, HistorialState>>({});
  const inFlightRef = useRef<Set<string>>(new Set());

  const loadHistorial = useCallback((codigo: string, empresaKey: string) => {
    const key = `${codigo}|${empresaKey}`;
    if (inFlightRef.current.has(key)) return;
    setHistorialCache(prev => {
      if (prev[key] && prev[key].status !== "idle") return prev;
      return { ...prev, [key]: { status: "loading" } };
    });
    inFlightRef.current.add(key);

    fetch(`/api/clientes/${encodeURIComponent(codigo)}/historial-mensual?empresa=${encodeURIComponent(empresaKey)}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(data => {
        setHistorialCache(prev => ({ ...prev, [key]: { status: "ready", data } }));
      })
      .catch(err => {
        setHistorialCache(prev => ({
          ...prev,
          [key]: { status: "error", message: err?.message ?? "Error al cargar" },
        }));
      })
      .finally(() => {
        inFlightRef.current.delete(key);
      });
  }, []);

  // Vista 12m (universo rolling) vs YTD strict — el universo cambia con
  // el sort: cuando el usuario ordena por última compra quiere ver a TODOS
  // los clientes activos en los últimos 12 meses, incluyendo los que no
  // compraron aún en el año en curso. Para cualquier otro sort, la lista
  // se restringe a clientes con compras YTD > 0 (vista "estricta del año").
  const is12mView = sortBy === "ultima";

  // Universo según sort. Esto define qué huérfanos se agrupan en "Otros".
  const universe = useMemo(() => {
    return is12mView ? data.rows : data.rows.filter(c => c.ytd > 0);
  }, [data.rows, is12mView]);

  // Huérfanos del universo actual (cliente_id NULL en la materialized view).
  // Sólo aplica para pills B2B; Boston/Multi se manejan sin Otros row.
  const orphans = useMemo(() => {
    if (SKIP_OTROS_FOR.has(empresa)) return [];
    return universe.filter(c => c.isOrphan);
  }, [universe, empresa]);

  // Fila sintética "Otros clientes" — null cuando no hay huérfanos
  // (o cuando la pill activa es Boston/Multi).
  const otrosRow = useMemo<Cliente | null>(() => {
    if (orphans.length === 0) return null;
    const sumYtd  = orphans.reduce((s, o) => s + o.ytd, 0);
    const sumPrev = orphans.reduce((s, o) => s + o.prev, 0);
    // Delta same-period agregado: (Σytd - Σprev) / Σprev. Misma fórmula
    // que aplica el resto del módulo (ver migration 040 fix same-period).
    const aggDelta = sumPrev > 0 ? (sumYtd - sumPrev) / sumPrev : 0;
    const maxUltimaIso = orphans
      .map(o => o.ultimaIso)
      .filter(Boolean)
      .sort()
      .pop() ?? "";
    const ultimaDisplay = maxUltimaIso
      ? orphans.find(o => o.ultimaIso === maxUltimaIso)?.ultima ?? ""
      : "";
    const empresaLabel = empresa === "todas"
      ? "Varias"
      : EMPRESA_KEY_TO_NAME[empresa] ?? empresa;
    return {
      rank: 0,
      id: "",
      nombre: `Otros clientes (${orphans.length})`,
      empresa: empresaLabel,
      empresaKey: empresa === "todas" ? "" : empresa,
      ytd: sumYtd,
      prev: sumPrev,
      delta: aggDelta,
      ultima: ultimaDisplay,
      ultimaIso: maxUltimaIso,
      wa: "",
      empresas_count: 1,
      isOrphan: false,
      isOtrosAggregate: true,
    };
  }, [orphans, empresa]);

  const filtered = useMemo(() => {
    // Masters: universo sin huérfanos. La búsqueda sólo aplica a masters
    // — la fila "Otros" permanece visible independiente del search text.
    const masters = universe.filter(c => !c.isOrphan);
    let r = masters.slice();
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(c => c.nombre.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }
    // Inyectar fila Otros antes del sort para que se posicione según su
    // total acumulado, igual que cualquier otra fila.
    if (otrosRow) r.push(otrosRow);
    r.sort((a, b) => {
      const sign = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "rank":    return (a.rank - b.rank) * sign;
        case "nombre":  return a.nombre.localeCompare(b.nombre) * sign;
        case "empresa": return a.empresa.localeCompare(b.empresa) * sign;
        case "ytd":     return (a.ytd - b.ytd) * sign;
        case "delta":   return (a.delta - b.delta) * sign;
        case "ultima":  return a.ultimaIso.localeCompare(b.ultimaIso) * sign;
      }
    });
    return r;
  }, [universe, search, sortBy, sortDir, otrosRow]);

  const onSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir(col === "nombre" || col === "empresa" ? "asc" : "desc"); }
  };

  return (
    <div className={cn("space-y-3", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {fetchError && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar la lista: {fetchError}
        </div>
      )}

      {/* Sticky único: search + counter + pills en un solo bloque al top:0. */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 border-b border-stone-200 bg-stone-50 px-1 pb-2.5 pt-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] max-w-[360px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-500" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente o código…"
              className="w-full pl-8"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 whitespace-nowrap text-xs text-stone-500">
            <p>
              <span className="font-mono text-stone-950">{filtered.length}</span> clientes activos · {is12mView ? "últimos 12 meses" : `Compras YTD ${new Date().getFullYear()}`} · ordenados por {SORT_LABELS[sortBy]}
            </p>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                is12mView
                  ? "bg-teal-50 text-teal-700"
                  : "bg-stone-100 text-stone-700"
              )}
              title={is12mView
                ? "Sort por última compra expande la lista al universo rolling de 12 meses (incluye clientes sin compras YTD)."
                : "Vista estricta del año fiscal en curso: sólo clientes con compras YTD > 0."}
            >
              Vista: {is12mView ? "Últimos 12 meses" : `YTD ${new Date().getFullYear()}`}
            </span>
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto px-1">
          <div className="flex flex-nowrap gap-1.5">
            {EMPRESA_PILLS.map(p => {
              const active = empresa === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onEmpresaChange(p.id)}
                  disabled={loading}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-teal-700 text-white"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 920 }}>
            <thead>
              <tr className="bg-stone-100">
                <SortHeader col="rank"    align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>#</SortHeader>
                <SortHeader col="nombre"  align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Cliente</SortHeader>
                <SortHeader col="empresa" align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Empresa</SortHeader>
                <SortHeader col="ytd"     align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Compras YTD</SortHeader>
                <SortHeader col="delta"   align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Δ vs 2025</SortHeader>
                <SortHeader col="ultima"  align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Última compra</SortHeader>
                <th className="w-12 border-b border-stone-200 px-3.5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                if (c.isOtrosAggregate) {
                  return (
                    <OtrosRow
                      key="__otros__"
                      c={c}
                      onClick={() => setOtrosOpen(true)}
                    />
                  );
                }
                const cacheKey = `${c.id}|${c.empresaKey}`;
                const state = historialCache[cacheKey] ?? { status: "idle" as const };
                return (
                  <ClienteRow
                    key={`${c.empresaKey}-${c.id}-${c.rank}`}
                    c={c}
                    state={state}
                    onFirstHover={() => loadHistorial(c.id, c.empresaKey)}
                  />
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3.5 py-12 text-center text-sm text-stone-500">
                  No se encontraron clientes con esos filtros.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <OtrosClientesDialog
        open={otrosOpen}
        onClose={() => setOtrosOpen(false)}
        orphans={orphans}
        showEmpresaColumn={empresa === "todas"}
      />
    </div>
  );
}

function ClienteRow({
  c,
  state,
  onFirstHover,
}: {
  c: Cliente;
  state: HistorialState;
  onFirstHover: () => void;
}) {
  const fmt = formatDeltaRatio(c.delta);
  const isMultiEmpresa = c.empresas_count > 1 && (c.empresas_breakdown?.length ?? 0) > 1;

  return (
    <tr className="cursor-pointer transition hover:bg-stone-50">
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">{c.rank}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-sm text-stone-950">
        {/*
          HoverCard solo se monta en desktop (md+). En mobile el trigger
          renderiza como inline-block normal sin abrir nada — no usamos
          BottomSheet en este sprint para evitar bloquear el merge; queda
          como follow-up.
        */}
        <HoverCard openDelay={250} closeDelay={100}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="block max-w-full text-left font-medium leading-tight hover:text-teal-700 md:cursor-help"
            >
              {c.nombre}
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="start"
            className="hidden w-[280px] md:block"
          >
            <ClienteHoverCard
              nombre={c.nombre}
              codigo={c.id}
              ultima={c.ultima}
              state={state}
              onFirstHover={onFirstHover}
            />
          </HoverCardContent>
        </HoverCard>
        <div className="font-mono text-[11px] leading-tight text-stone-500">{c.id}</div>
      </td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-xs text-stone-700">
        {isMultiEmpresa ? (
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="cursor-help underline decoration-dotted decoration-stone-300 underline-offset-4 hover:text-stone-950"
                >
                  {c.empresas_count} empresas
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
                className="min-w-[240px] border-0 bg-stone-950 p-3 text-white shadow-lg"
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
                  Desglose por empresa
                </div>
                <div className="mt-2 space-y-1">
                  {(c.empresas_breakdown ?? []).map(b => (
                    <div key={b.empresaKey} className="flex justify-between gap-4 text-[11px]">
                      <span className="text-stone-300">{b.empresaNombre}</span>
                      <span className="font-mono text-white tabular-nums">{fmtMoney(b.monto)}</span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          c.empresa
        )}
      </td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">{fmtMoney(c.ytd)}</td>
      <td className={cn("whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
        {fmt.arrow && <span className="mr-1">{fmt.arrow}</span>}
        {fmt.displayValue}
      </td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">{c.ultima || "—"}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-center">
        {c.wa ? (
          <a
            href={`https://wa.me/${c.wa.replace("+","")}`}
            target="_blank" rel="noopener noreferrer"
            aria-label={`Enviar WhatsApp a ${c.nombre}`}
            onClick={e => e.stopPropagation()}
            className="inline-flex text-[#25D366] hover:opacity-80"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.5-.9-2.1-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .1.2 2.1 3.2 5.1 4.5 1.8.7 2.5.8 3.4.7.5-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.3 1.2 4.7L2 22l5.3-1.2c1.4.7 3 1.1 4.7 1.1 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.3-1.1l-.3-.2-3.2.7.7-3-.2-.4C4 14.6 4 13.3 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8z"/></svg>
          </a>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Fila agregada "Otros clientes (N)" — agrupa huérfanos sin master.
 * Background diferenciado, click abre Dialog con detalle. Sin HoverCard
 * (los promedios cross-cliente no aplican) ni WhatsApp (heterogéneo).
 */
function OtrosRow({ c, onClick }: { c: Cliente; onClick: () => void }) {
  const fmt = formatDeltaRatio(c.delta);
  return (
    <tr
      className="cursor-pointer bg-stone-100 transition hover:bg-stone-200"
      onClick={onClick}
      role="button"
      aria-label="Abrir detalle de otros clientes"
    >
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-400 tabular-nums">—</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-sm text-stone-950">
        <div className="font-medium leading-tight">{c.nombre}</div>
        <div className="font-mono text-[11px] leading-tight text-stone-500">click para ver detalle</div>
      </td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-xs text-stone-700">
        {c.empresa}
      </td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">
        {fmtMoney(c.ytd)}
      </td>
      <td className={cn("whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
        {fmt.arrow && <span className="mr-1">{fmt.arrow}</span>}
        {fmt.displayValue}
      </td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">
        {c.ultima || "—"}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-center" />
    </tr>
  );
}

function SortHeader({
  col, align, children, sortBy, sortDir, onClick,
}: {
  col: SortKey; align: "left" | "right"; children: React.ReactNode;
  sortBy: SortKey; sortDir: SortDir; onClick: (c: SortKey) => void;
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
