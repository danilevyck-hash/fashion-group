"use client";

// Sub-tab "Clientes" de Multifashion.
// Dos secciones:
//   1. Wholesale: clientes con is_wholesale=true (típicamente LA FRONTERA).
//   2. Retail recurrentes: top 30 clientes retail (no wholesale, no
//      CONTADO/CONSUMIDOR FINAL) con ≥ 2 tickets en el año.
//
// Ambos comparten visual (Card por cliente + sparkline mensual).

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Package, UserCircle, Users } from "lucide-react";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────

interface MesRow {
  mes_idx: number;
  mes_label: string;
  ventas: number;
  tickets: number;
}

interface ClienteRow {
  nombre: string;
  total_ytd: number;
  tickets_ytd: number;
  /** retail recurrentes la trae directo; wholesale lo calculamos client-side. */
  ticket_prom?: number;
  ultima_compra: string | null;
  meses: MesRow[];
}

interface WholesaleResp {
  anio: number;
  total_clientes: number;
  total_ventas: number;
  total_tickets: number;
  clientes: ClienteRow[];
}

interface RetailResp {
  anio: number;
  limit: number;
  total_clientes: number;
  total_ventas: number;
  total_tickets: number;
  clientes: ClienteRow[];
}

interface ClientesMultifashionSubtabProps {
  selectedYear: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatFechaLarga(iso: string): string {
  const d = parseIsoDateLocal(iso);
  const MES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d.getDate()} de ${MES[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ClientesMultifashionSubtab({ selectedYear }: ClientesMultifashionSubtabProps) {
  const [wholesale, setWholesale] = useState<WholesaleResp | null>(null);
  const [retail, setRetail] = useState<RetailResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/multifashion/clientes-wholesale?year=${selectedYear}`, {
        cache: "no-store",
        signal: ctrl.signal,
      }).then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `wholesale HTTP ${r.status}`);
        }
        return r.json() as Promise<WholesaleResp>;
      }),
      fetch(`/api/multifashion/retail-recurrentes?year=${selectedYear}`, {
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
  }, [selectedYear]);

  if (loading && !wholesale && !retail) {
    return (
      <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-stone-500">
        Cargando clientes…
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="rounded-md border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900">
        No se pudo cargar la lista: {error}
      </Card>
    );
  }

  // Pico mensual común (escala visual unificada entre ambas secciones)
  const peakMes = Math.max(
    ...(wholesale?.clientes ?? []).flatMap(c => c.meses.map(m => m.ventas)),
    ...(retail?.clientes ?? []).flatMap(c => c.meses.map(m => m.ventas)),
    1,
  );

  return (
    <div className={cn("space-y-8", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Sección 1: Wholesale                                              */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          title="Wholesale"
          subtitle="Clientes mayoreo (DEFAULT vendedor + cliente identificado en directorio)"
          icon={<Package className="h-5 w-5" />}
          iconTone="amber"
        />
        {wholesale && wholesale.clientes.length > 0 ? (
          <>
            <SectionAggregateCard
              tone="amber"
              icon={<Package className="h-5 w-5" />}
              label={`Mayoreo ${selectedYear}`}
              total={wholesale.total_ventas}
              clientes={wholesale.total_clientes}
              tickets={wholesale.total_tickets}
            />
            <div className="space-y-3">
              {wholesale.clientes.map((c, idx) => (
                <ClienteCard
                  key={`ws-${c.nombre}`}
                  rank={idx + 1}
                  cliente={c}
                  peakMes={peakMes}
                  year={selectedYear}
                />
              ))}
            </div>
          </>
        ) : (
          <Card className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-10 text-center">
            <UserCircle className="h-10 w-10 text-stone-400" strokeWidth={1.5} />
            <p className="text-sm text-stone-500">
              No hay clientes wholesale registrados en {selectedYear}.
            </p>
          </Card>
        )}
      </section>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Sección 2: Retail recurrentes                                     */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          title="Retail recurrentes"
          subtitle={`Top ${retail?.limit ?? 30} clientes retail con ≥ 2 visitas en ${selectedYear}`}
          icon={<Users className="h-5 w-5" />}
          iconTone="teal"
        />
        {retail && retail.clientes.length > 0 ? (
          <>
            <SectionAggregateCard
              tone="teal"
              icon={<Users className="h-5 w-5" />}
              label={`Retail recurrentes ${selectedYear}`}
              total={retail.total_ventas}
              clientes={retail.total_clientes}
              tickets={retail.total_tickets}
              note="Suma de los clientes mostrados, no del retail total."
            />
            <div className="space-y-3">
              {retail.clientes.map((c, idx) => (
                <ClienteCard
                  key={`rt-${c.nombre}`}
                  rank={idx + 1}
                  cliente={c}
                  peakMes={peakMes}
                  year={selectedYear}
                />
              ))}
            </div>
          </>
        ) : (
          <Card className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-10 text-center">
            <Users className="h-10 w-10 text-stone-400" strokeWidth={1.5} />
            <p className="text-sm text-stone-500">
              No hay clientes retail recurrentes (con ≥ 2 visitas en {selectedYear}).
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({
  title, subtitle, icon, iconTone,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconTone: "amber" | "teal";
}) {
  const toneClass = iconTone === "amber"
    ? "border-amber-100 bg-amber-50 text-amber-700"
    : "border-teal-100 bg-teal-50 text-teal-700";
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", toneClass)}>
        {icon}
      </div>
      <div>
        <h3 className="font-display text-base font-semibold text-stone-950">{title}</h3>
        <p className="mt-0.5 text-[11px] text-stone-500">{subtitle}</p>
      </div>
    </div>
  );
}

function SectionAggregateCard({
  tone, icon, label, total, clientes, tickets, note,
}: {
  tone: "amber" | "teal";
  icon: React.ReactNode;
  label: string;
  total: number;
  clientes: number;
  tickets: number;
  note?: string;
}) {
  const toneClass = tone === "amber"
    ? "border-amber-100 bg-amber-50 text-amber-700"
    : "border-teal-100 bg-teal-50 text-teal-700";
  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", toneClass)}>
        {icon}
      </div>
      <div className="flex-1 min-w-[160px]">
        <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">
          {label}
        </p>
        <p className="mt-0.5 font-mono text-xl font-medium text-stone-950 tabular-nums">
          {fmtMoney(total)}
        </p>
        {note && <p className="mt-0.5 text-[10.5px] text-stone-400">{note}</p>}
      </div>
      <div className="text-right text-xs text-stone-500">
        <p>
          <span className="font-mono tabular-nums text-stone-700">{clientes}</span>{" "}
          {clientes === 1 ? "cliente" : "clientes"}
        </p>
        <p className="mt-0.5">
          <span className="font-mono tabular-nums text-stone-700">{tickets.toLocaleString()}</span>{" "}
          tickets
        </p>
      </div>
    </Card>
  );
}

function ClienteCard({
  rank, cliente, peakMes, year,
}: {
  rank: number;
  cliente: ClienteRow;
  peakMes: number;
  year: number;
}) {
  const ticketProm = cliente.ticket_prom != null
    ? cliente.ticket_prom
    : (cliente.tickets_ytd > 0 ? cliente.total_ytd / cliente.tickets_ytd : 0);

  return (
    <Card className="p-4">
      {/* Header de cliente */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10.5px] text-stone-500 tabular-nums">#{rank}</span>
          <h3 className="font-display text-base font-semibold text-stone-950">{cliente.nombre}</h3>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-medium text-stone-950 tabular-nums">{fmtMoney(cliente.total_ytd)}</p>
          <p className="text-[11px] text-stone-500">
            {cliente.tickets_ytd} {cliente.tickets_ytd === 1 ? "ticket" : "tickets"} · ${ticketProm.toFixed(2)} promedio
          </p>
        </div>
      </div>

      {/* Última compra */}
      {cliente.ultima_compra && (
        <p className="mt-1 text-[11px] text-stone-500">
          Última compra: <span className="text-stone-700">{formatFechaLarga(cliente.ultima_compra)}</span>
        </p>
      )}

      {/* Mini-tabla mensual con sparkline visual */}
      <div className="mt-4">
        <div className="grid grid-cols-12 gap-1">
          {cliente.meses.map(m => {
            const heightPct = peakMes > 0 ? (m.ventas / peakMes) * 100 : 0;
            const hasData = m.ventas > 0;
            return (
              <div key={m.mes_idx} className="flex flex-col items-center gap-1">
                <div className="relative flex h-14 w-full items-end justify-center rounded-sm bg-stone-50">
                  {hasData && (
                    <div
                      className="w-full rounded-sm bg-teal-700/80 transition-all"
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                      title={`${m.mes_label}: ${fmtMoney(m.ventas)}`}
                    />
                  )}
                </div>
                <p className="text-[9.5px] font-medium uppercase text-stone-500">{m.mes_label}</p>
                <p className={cn(
                  "font-mono text-[10px] tabular-nums",
                  hasData ? "text-stone-700" : "text-stone-300"
                )}>
                  {hasData ? fmtMoneyCompact(m.ventas) : "—"}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10.5px] text-stone-500">
          Histórico mensual {year}. Escala compartida entre wholesale y retail.
        </p>
      </div>
    </Card>
  );
}
