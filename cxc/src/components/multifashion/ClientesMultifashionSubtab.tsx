"use client";

// Sub-tab "Clientes" de Multifashion — layout tabla compacta.
//
// Período: filtro PROPIO del tab (Mes · 3m · 6m · 12m), persistido en URL
// (?mfCliRango). El mes/año del shell ancla el FIN del rango; los rangos
// móviles cuentan N meses hacia atrás desde ese mes (cruzan año solos).
//
// Dos secciones:
//   1. Wholesale: clientes con is_wholesale=true.
//   2. Clientes identificados (retail): ranking por monto, nombre real.
//      Identidad normalizada en el RPC (TRIM + colapsa espacios) para no partir
//      un cliente por variantes; VENTAS MAHER excluido (revendedor). El bucket
//      "Anónimos (mostrador)" suma CONTADO / CONSUMIDOR FINAL aparte.
//
// La columna "#" es la POSICIÓN en el ranking por monto (no un id de cliente).
// Click en una row expande sparkline mensual (un cliente expandido a la vez).

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Package, Users, ChevronDown, Store } from "lucide-react";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { useUrlState } from "@/lib/hooks/useUrlState";
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
  // Cobertura identificados vs anónimos (mostrador), independiente del top N.
  clientes_identificados: number;
  ventas_identificadas: number;
  tickets_identificados: number;
  ventas_anonimas: number;
  tickets_anonimos: number;
  pct_identificado: number;
  clientes: ClienteRow[];
}

type RangoCli = "mes" | "3m" | "6m" | "12m";

const RANGO_OPCIONES: { value: RangoCli; label: string }[] = [
  { value: "mes", label: "Mes" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
];

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

// Rango del tab Clientes. El FIN siempre es el último día del mes seleccionado
// en el shell; el INICIO depende del filtro propio: "mes" = ese mes; "3m/6m/12m"
// = primer día N-1 meses atrás (cruza año automáticamente vía Date).
function computeRange(
  rango: RangoCli, selectedYear: number, mes: number,
): { fecha_inicio: string; fecha_fin: string } {
  const mm = String(mes).padStart(2, "0");
  const lastDay = new Date(selectedYear, mes, 0).getDate();
  const fecha_fin = `${selectedYear}-${mm}-${String(lastDay).padStart(2, "0")}`;

  if (rango === "mes") {
    return { fecha_inicio: `${selectedYear}-${mm}-01`, fecha_fin };
  }

  const nMonths = rango === "3m" ? 3 : rango === "6m" ? 6 : 12;
  const start = new Date(selectedYear, mes - 1 - (nMonths - 1), 1);
  const sy = start.getFullYear();
  const sm = String(start.getMonth() + 1).padStart(2, "0");
  return { fecha_inicio: `${sy}-${sm}-01`, fecha_fin };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ClientesMultifashionSubtab({ selectedYear, mes }: ClientesMultifashionSubtabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filtro de período PROPIO del tab (persistido en URL ?mfCliRango). Es un
  // filtro del mismo nivel → history "replace" (no cicla en back/forward).
  const [rango, setRango] = useUrlState<RangoCli>("mfCliRango", "mes");

  const range = useMemo(() => computeRange(rango, selectedYear, mes), [rango, selectedYear, mes]);
  const periodoStr = useMemo(() => {
    if (rango === "mes") return `${MES_NOMBRES[mes - 1]} ${selectedYear}`;
    const n = rango === "3m" ? 3 : rango === "6m" ? 6 : 12;
    return `Últimos ${n} meses · hasta ${MES_NOMBRES[mes - 1].toLowerCase()} ${selectedYear}`;
  }, [rango, selectedYear, mes]);

  // MISMOS params que antes: el querystring (fecha_inicio + fecha_fin) ES la
  // clave SWR → cada rango cachea por separado y revalida en background. Un solo
  // useSWR cuyo fetcher dispara ambos fetch en paralelo y devuelve {wholesale,
  // retail}, preservando el loading/error combinados del Promise.all original.
  const qs = `fecha_inicio=${range.fecha_inicio}&fecha_fin=${range.fecha_fin}`;
  const { data, error, isLoading, mutate } = useSWR<{ wholesale: WholesaleResp; retail: RetailResp }>(
    ["multifashion-clientes", range.fecha_inicio, range.fecha_fin],
    async () => {
      const [ws, rt] = await Promise.all([
        fetch(`/api/multifashion/clientes-wholesale?${qs}`, { cache: "no-store" }).then(async r => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body?.error ?? `wholesale HTTP ${r.status}`);
          }
          return r.json() as Promise<WholesaleResp>;
        }),
        fetch(`/api/multifashion/retail-recurrentes?${qs}`, { cache: "no-store" }).then(async r => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body?.error ?? `retail HTTP ${r.status}`);
          }
          return r.json() as Promise<RetailResp>;
        }),
      ]);
      return { wholesale: ws, retail: rt };
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const wholesale = data?.wholesale ?? null;
  const retail = data?.retail ?? null;
  const loading = isLoading && !data;
  const errorMsg = error ? (error instanceof Error ? error.message : "error inesperado") : null;

  // Al cambiar el rango, colapsa la fila expandida (igual que el efecto original
  // hacía con setExpandedId(null) en cada cambio de params).
  useEffect(() => {
    setExpandedId(null);
  }, [range.fecha_inicio, range.fecha_fin]);

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
      {errorMsg ? (
        <Card className="rounded-md border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900">
          No se pudo cargar la lista: {errorMsg}
          <button onClick={() => mutate()} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
        </Card>
      ) : loading && !wholesale && !retail ? (
        <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-gray-500">
          Cargando clientes…
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Encabezado + filtro de período propio del tab. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-gray-950">Clientes · {periodoStr}</h3>
              <p className="mt-0.5 text-xs text-gray-400">Mejores clientes por monto. Mostrador anónimo aparte.</p>
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-0.5">
              {RANGO_OPCIONES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRango(opt.value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition",
                    rango === opt.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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

          {/* Sección 2: Clientes identificados (retail por monto) */}
          <ClientesSection
            prefix="rt"
            title="Clientes identificados"
            subtitle={retail
              ? `${retail.pct_identificado ?? 0}% de las ventas retail · top ${retail.limit} por monto · ${retail.clientes_identificados ?? retail.total_clientes} con nombre`
              : "—"}
            icon={<Users className="h-4 w-4" />}
            iconTone="teal"
            clientes={retail?.clientes ?? []}
            peakMes={peakMes}
            spansYears={spansYears}
            expandedId={expandedId}
            onToggleRow={toggleRow}
            emptyText={`No hay clientes retail con nombre en ${periodoStr}.`}
          />

          {/* Bucket anónimo (mostrador): CONTADO / CONSUMIDOR FINAL, sin nombre. */}
          {retail && (retail.ventas_anonimas > 0 || retail.tickets_anonimos > 0) && (
            <Card className="flex items-center gap-3 p-3.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500">
                <Store className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">Anónimos (mostrador)</p>
                <p className="text-xs text-gray-500">Ventas de CONTADO / CONSUMIDOR FINAL, sin cliente identificado.</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm tabular-nums text-gray-950">{fmtMoney(retail.ventas_anonimas)}</p>
                <p className="font-mono text-xs tabular-nums text-gray-500">{retail.tickets_anonimos.toLocaleString()} tickets</p>
              </div>
            </Card>
          )}
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
          <h3 className="font-display text-sm font-semibold text-gray-950">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>

      {clientes.length === 0 ? (
        <Card className="flex items-center justify-center py-8 text-xs text-gray-500">
          {emptyText}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_1.25rem] items-center gap-3 border-b border-gray-200 bg-gray-50 px-3.5 py-2 text-xs font-medium uppercase tracking-[0.04em] text-gray-500">
            <span className="text-right" title="Posición en el ranking por monto">#</span>
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
    <div className="border-t border-gray-200">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isExpanded}
        className={cn(
          "grid w-full grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_1.25rem] items-center gap-3 px-3.5 py-2.5 text-left text-sm transition",
          "hover:bg-gray-50/60",
          isExpanded && "bg-gray-50/80",
        )}
      >
        <span className="text-right font-mono text-xs text-gray-500 tabular-nums">{rank}</span>
        <span className="truncate font-medium text-gray-900">{cliente.nombre}</span>
        <span className="text-right font-mono text-gray-950 tabular-nums">{fmtMoney(cliente.total_ytd)}</span>
        <span className="text-right font-mono text-gray-700 tabular-nums">{cliente.tickets_ytd.toLocaleString()}</span>
        <span className="text-right font-mono text-gray-700 tabular-nums">${ticketProm.toFixed(2)}</span>
        <span className="text-right font-mono text-xs text-gray-500 tabular-nums">{formatFechaShort(cliente.ultima_compra)}</span>
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-gray-400 transition-transform",
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
    <div className="bg-gray-50/40 px-4 py-4">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cliente.meses.map(m => {
          const heightPct = peakMes > 0 ? (m.ventas / peakMes) * 100 : 0;
          const hasData = m.ventas > 0;
          return (
            <div key={`${m.mes_anio}-${m.mes_idx}`} className="flex flex-col items-center gap-1">
              <div className="relative flex h-12 w-full items-end justify-center rounded-sm bg-gray-100">
                {hasData && (
                  <div
                    className="w-full rounded-sm bg-teal-700/80 transition-all"
                    style={{ height: `${Math.max(4, heightPct)}%` }}
                    title={`${labelFor(m)}: ${fmtMoney(m.ventas)}`}
                  />
                )}
              </div>
              <p className="text-xs font-medium uppercase text-gray-500 whitespace-nowrap">{labelFor(m)}</p>
              <p className={cn(
                "font-mono text-xs tabular-nums",
                hasData ? "text-gray-700" : "text-gray-300",
              )}>
                {hasData ? fmtMoneyCompact(m.ventas) : "—"}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Histórico mensual del rango. Escala compartida entre wholesale y retail.
      </p>
    </div>
  );
}
