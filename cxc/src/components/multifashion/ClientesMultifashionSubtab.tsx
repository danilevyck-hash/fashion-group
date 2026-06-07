"use client";

// Sub-tab "Clientes" de Multifashion — layout tabla compacta.
//
// Período: respeta el SELECTOR ÚNICO de mes del shell (selectedYear + mes),
// igual que Detalle mensual y Vendedoras. El rango es el mes seleccionado
// (1er a último día). (Antes tenía pills de período propios — retirados para
// unificar el selector en todo el módulo.)
//
// Dos secciones:
//   1. Wholesale: clientes con is_wholesale=true.
//   2. Retail recurrentes: top 50 clientes retail con ≥ 2 tickets y
//      SUM(subtotal) > 0 en el rango.
//
// Click en una row expande sparkline mensual (un cliente expandido a la vez).

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Package, Users, ChevronDown } from "lucide-react";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────

interface MesRow {
  mes_anio: number;
  mes_idx: number;
  mes_label: string;
  ventas: number;
  tickets: number;
}

interface ClienteRow {
  nombre: string;
  total_ytd: number;
  tickets_ytd: number;
  ticket_prom?: number;
  ultima_compra: string | null;
  meses: MesRow[];
}

interface WholesaleResp {
  fecha_inicio: string;
  fecha_fin: string;
  total_clientes: number;
  total_ventas: number;
  total_tickets: number;
  clientes: ClienteRow[];
}

interface RetailResp {
  fecha_inicio: string;
  fecha_fin: string;
  limit: number;
  total_clientes: number;
  total_ventas: number;
  total_tickets: number;
  clientes: ClienteRow[];
}

interface ClientesMultifashionSubtabProps {
  selectedYear: number;
  mes: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatFechaShort(iso: string | null): string {
  if (!iso) return "—";
  const d = parseIsoDateLocal(iso);
  const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
}

const MES_NOMBRES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Rango = el MES seleccionado (1er a último día). Clientes respeta el selector
// único de mes del shell de Multifashion (igual que Detalle y Vendedoras).
function monthRange(selectedYear: number, mes: number): { fecha_inicio: string; fecha_fin: string } {
  const lastDay = new Date(selectedYear, mes, 0).getDate();
  const mm = String(mes).padStart(2, "0");
  return {
    fecha_inicio: `${selectedYear}-${mm}-01`,
    fecha_fin: `${selectedYear}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ClientesMultifashionSubtab({ selectedYear, mes }: ClientesMultifashionSubtabProps) {
  const [wholesale, setWholesale] = useState<WholesaleResp | null>(null);
  const [retail, setRetail] = useState<RetailResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const range = useMemo(() => monthRange(selectedYear, mes), [selectedYear, mes]);
  const periodoStr = useMemo(() => `${MES_NOMBRES[mes - 1]} ${selectedYear}`, [selectedYear, mes]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setExpandedId(null);

    const qs = `fecha_inicio=${range.fecha_inicio}&fecha_fin=${range.fecha_fin}`;

    Promise.all([
      fetch(`/api/multifashion/clientes-wholesale?${qs}`, {
        cache: "no-store",
        signal: ctrl.signal,
      }).then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `wholesale HTTP ${r.status}`);
        }
        return r.json() as Promise<WholesaleResp>;
      }),
      fetch(`/api/multifashion/retail-recurrentes?${qs}`, {
        cache: "no-store",
        signal: ctrl.signal,
      }).then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `retail HTTP ${r.status}`);
        }
        return r.json() as Promise<RetailResp>;
      }),
    ])
      .then(([ws, rt]) => {
        setWholesale(ws);
        setRetail(rt);
      })
      .catch(err => {
        if (err?.name === "AbortError") return;
        console.error("[clientes-multifashion] fetch failed", err);
        setError(err instanceof Error ? err.message : "error inesperado");
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [range.fecha_inicio, range.fecha_fin, reloadKey]);

  // Pico mensual compartido (escala visual unificada entre ambas secciones).
  const peakMes = useMemo(() => Math.max(
    ...(wholesale?.clientes ?? []).flatMap(c => c.meses.map(m => m.ventas)),
    ...(retail?.clientes ?? []).flatMap(c => c.meses.map(m => m.ventas)),
    1,
  ), [wholesale, retail]);

  // ¿El rango cruza años? Determina si las labels de los buckets deben
  // incluir año (ej. "May '25" vs "May").
  const spansYears = useMemo(() => {
    return range.fecha_inicio.slice(0, 4) !== range.fecha_fin.slice(0, 4);
  }, [range.fecha_inicio, range.fecha_fin]);

  const toggleRow = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className={cn("space-y-5", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {error ? (
        <Card className="rounded-md border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900">
          No se pudo cargar la lista: {error}
          <button onClick={() => setReloadKey((k) => k + 1)} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
        </Card>
      ) : loading && !wholesale && !retail ? (
        <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-stone-500">
          Cargando clientes…
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Rótulo de período (ítem 6): el alcance es el MES seleccionado,
              para que no parezca contradecir el Mayoreo YTD del Overview. */}
          <div>
            <h3 className="font-display text-base font-semibold text-stone-950">Clientes · {periodoStr}</h3>
            <p className="mt-0.5 text-[11px] text-stone-400">Período: el mes seleccionado (no acumulado anual).</p>
          </div>

          {/* Sección 1: Wholesale */}
          <ClientesSection
            prefix="ws"
            title="Wholesale"
            subtitle={wholesale
              ? `${wholesale.total_clientes} ${wholesale.total_clientes === 1 ? "cliente" : "clientes"} · ${fmtMoney(wholesale.total_ventas)} · ${wholesale.total_tickets.toLocaleString()} ${wholesale.total_tickets === 1 ? "ticket" : "tickets"}`
              : "—"}
            icon={<Package className="h-4 w-4" />}
            iconTone="amber"
            clientes={wholesale?.clientes ?? []}
            peakMes={peakMes}
            spansYears={spansYears}
            expandedId={expandedId}
            onToggleRow={toggleRow}
            emptyText={`No hay clientes wholesale en ${periodoStr}.`}
          />

          {/* Sección 2: Retail recurrentes */}
          <ClientesSection
            prefix="rt"
            title="Retail recurrentes"
            subtitle={retail
              ? `Top ${retail.limit} · ≥ 2 visitas en ${periodoStr} · ${fmtMoney(retail.total_ventas)} · ${retail.total_tickets.toLocaleString()} tickets`
              : "—"}
            icon={<Users className="h-4 w-4" />}
            iconTone="teal"
            clientes={retail?.clientes ?? []}
            peakMes={peakMes}
            spansYears={spansYears}
            expandedId={expandedId}
            onToggleRow={toggleRow}
            emptyText={`No hay clientes retail recurrentes (con ≥ 2 visitas) en ${periodoStr}.`}
          />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ClientesSection({
  prefix, title, subtitle, icon, iconTone,
  clientes, peakMes, spansYears, expandedId, onToggleRow, emptyText,
}: {
  prefix: "ws" | "rt";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconTone: "amber" | "teal";
  clientes: ClienteRow[];
  peakMes: number;
  spansYears: boolean;
  expandedId: string | null;
  onToggleRow: (id: string) => void;
  emptyText: string;
}) {
  const toneIcon = iconTone === "amber"
    ? "border-amber-100 bg-amber-50 text-amber-700"
    : "border-teal-100 bg-teal-50 text-teal-700";

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md border", toneIcon)}>
          {icon}
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-stone-950">{title}</h3>
          <p className="text-[11px] text-stone-500">{subtitle}</p>
        </div>
      </div>

      {clientes.length === 0 ? (
        <Card className="flex items-center justify-center py-8 text-xs text-stone-500">
          {emptyText}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_1.25rem] items-center gap-3 border-b border-stone-200 bg-stone-50 px-3.5 py-2 text-[10.5px] font-medium uppercase tracking-[0.04em] text-stone-500">
            <span className="text-right">#</span>
            <span>Cliente</span>
            <span className="text-right">Total</span>
            <span className="text-right">Tickets</span>
            <span className="text-right">T. prom</span>
            <span className="text-right">Última</span>
            <span />
          </div>

          {clientes.map((c, idx) => {
            const id = `${prefix}-${c.nombre}`;
            const isExpanded = expandedId === id;
            return (
              <ClienteRowItem
                key={id}
                id={id}
                rank={idx + 1}
                cliente={c}
                peakMes={peakMes}
                spansYears={spansYears}
                isExpanded={isExpanded}
                onToggle={onToggleRow}
              />
            );
          })}
        </Card>
      )}
    </section>
  );
}

function ClienteRowItem({
  id, rank, cliente, peakMes, spansYears, isExpanded, onToggle,
}: {
  id: string;
  rank: number;
  cliente: ClienteRow;
  peakMes: number;
  spansYears: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  const ticketProm = cliente.ticket_prom != null
    ? cliente.ticket_prom
    : (cliente.tickets_ytd > 0 ? cliente.total_ytd / cliente.tickets_ytd : 0);

  return (
    <div className="border-t border-stone-200">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isExpanded}
        className={cn(
          "grid w-full grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_1.25rem] items-center gap-3 px-3.5 py-2.5 text-left text-sm transition",
          "hover:bg-stone-50/60",
          isExpanded && "bg-stone-50/80",
        )}
      >
        <span className="text-right font-mono text-[11px] text-stone-500 tabular-nums">{rank}</span>
        <span className="truncate font-medium text-stone-900">{cliente.nombre}</span>
        <span className="text-right font-mono text-stone-950 tabular-nums">{fmtMoney(cliente.total_ytd)}</span>
        <span className="text-right font-mono text-stone-700 tabular-nums">{cliente.tickets_ytd.toLocaleString()}</span>
        <span className="text-right font-mono text-stone-700 tabular-nums">${ticketProm.toFixed(2)}</span>
        <span className="text-right font-mono text-xs text-stone-500 tabular-nums">{formatFechaShort(cliente.ultima_compra)}</span>
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-stone-400 transition-transform",
          isExpanded && "rotate-180",
        )} />
      </button>

      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0">
          {isExpanded && <ClienteSparkline cliente={cliente} peakMes={peakMes} spansYears={spansYears} />}
        </div>
      </div>
    </div>
  );
}

function ClienteSparkline({
  cliente, peakMes, spansYears,
}: {
  cliente: ClienteRow;
  peakMes: number;
  spansYears: boolean;
}) {
  // Cuando el rango cruza años, mostramos label "May '25". Sino solo "May".
  const labelFor = (m: MesRow) => spansYears
    ? `${m.mes_label} '${String(m.mes_anio).slice(-2)}`
    : m.mes_label;

  const cols = Math.max(cliente.meses.length, 1);

  return (
    <div className="bg-stone-50/40 px-4 py-4">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cliente.meses.map(m => {
          const heightPct = peakMes > 0 ? (m.ventas / peakMes) * 100 : 0;
          const hasData = m.ventas > 0;
          return (
            <div key={`${m.mes_anio}-${m.mes_idx}`} className="flex flex-col items-center gap-1">
              <div className="relative flex h-12 w-full items-end justify-center rounded-sm bg-stone-100">
                {hasData && (
                  <div
                    className="w-full rounded-sm bg-teal-700/80 transition-all"
                    style={{ height: `${Math.max(4, heightPct)}%` }}
                    title={`${labelFor(m)}: ${fmtMoney(m.ventas)}`}
                  />
                )}
              </div>
              <p className="text-[9.5px] font-medium uppercase text-stone-500 whitespace-nowrap">{labelFor(m)}</p>
              <p className={cn(
                "font-mono text-[10px] tabular-nums",
                hasData ? "text-stone-700" : "text-stone-300",
              )}>
                {hasData ? fmtMoneyCompact(m.ventas) : "—"}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] text-stone-500">
        Histórico mensual del rango. Escala compartida entre wholesale y retail.
      </p>
    </div>
  );
}
