"use client";

// Sub-tab "Clientes" de Multifashion. Solo wholesale (is_wholesale=true).
// Hoy típicamente 1 cliente (LA FRONTERA DUTY FREE). Futuros aparecen
// automáticos cuando se agregan a clientes_master (trigger SQL ya
// mantiene is_wholesale al día).

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Package, UserCircle } from "lucide-react";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

interface WholesaleMesRow {
  mes_idx: number;
  mes_label: string;
  ventas: number;
  tickets: number;
}

interface WholesaleClienteRow {
  nombre: string;
  total_ytd: number;
  tickets_ytd: number;
  ultima_compra: string | null;
  meses: WholesaleMesRow[];
}

interface WholesaleClientesResp {
  anio: number;
  total_clientes: number;
  total_ventas: number;
  total_tickets: number;
  clientes: WholesaleClienteRow[];
}

interface ClientesMultifashionSubtabProps {
  selectedYear: number;
}

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

export function ClientesMultifashionSubtab({ selectedYear }: ClientesMultifashionSubtabProps) {
  const [data, setData] = useState<WholesaleClientesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/multifashion/clientes-wholesale?year=${selectedYear}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<WholesaleClientesResp>;
      })
      .then(setData)
      .catch(err => {
        if (err?.name === "AbortError") return;
        console.error("[clientes-wholesale] fetch failed", err);
        setError(err instanceof Error ? err.message : "error inesperado");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [selectedYear]);

  if (loading && !data) {
    return (
      <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-stone-500">
        Cargando clientes wholesale…
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
  if (!data) return null;

  if (data.clientes.length === 0) {
    return (
      <Card className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-12 text-center">
        <UserCircle className="h-10 w-10 text-stone-400" strokeWidth={1.5} />
        <p className="text-sm text-stone-500">
          No hay clientes wholesale registrados en {selectedYear}.
        </p>
      </Card>
    );
  }

  // Pico mensual global para escalar las sparklines
  const peakMes = Math.max(
    ...data.clientes.flatMap(c => c.meses.map(m => m.ventas)),
    1
  );

  return (
    <div className={cn("space-y-5", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {/* Header agregado */}
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-100 bg-amber-50 text-amber-700">
          <Package className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">
            Mayoreo {selectedYear}
          </p>
          <p className="mt-0.5 font-mono text-xl font-medium text-stone-950 tabular-nums">
            {fmtMoney(data.total_ventas)}
          </p>
        </div>
        <div className="text-right text-xs text-stone-500">
          <p>
            <span className="font-mono tabular-nums text-stone-700">{data.total_clientes}</span>{" "}
            {data.total_clientes === 1 ? "cliente" : "clientes"}
          </p>
          <p className="mt-0.5">
            <span className="font-mono tabular-nums text-stone-700">{data.total_tickets.toLocaleString()}</span>{" "}
            tickets
          </p>
        </div>
      </Card>

      {/* Lista de clientes */}
      <section className="space-y-3">
        {data.clientes.map((c, idx) => (
          <ClienteCard key={c.nombre} rank={idx + 1} cliente={c} peakMes={peakMes} year={selectedYear} />
        ))}
      </section>
    </div>
  );
}

function ClienteCard({
  rank, cliente, peakMes, year,
}: {
  rank: number;
  cliente: WholesaleClienteRow;
  peakMes: number;
  year: number;
}) {
  const ticketProm = cliente.tickets_ytd > 0 ? cliente.total_ytd / cliente.tickets_ytd : 0;

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

      {/* Mini-tabla mensual con sparkline visual (bars con bg height) */}
      <div className="mt-4">
        <div className="grid grid-cols-12 gap-1">
          {cliente.meses.map(m => {
            const heightPct = peakMes > 0 ? (m.ventas / peakMes) * 100 : 0;
            const hasData = m.ventas > 0;
            return (
              <div key={m.mes_idx} className="flex flex-col items-center gap-1">
                {/* Bar */}
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
          Histórico mensual {year}. Escala relativa al mes pico del cliente más alto.
        </p>
      </div>
    </Card>
  );
}
