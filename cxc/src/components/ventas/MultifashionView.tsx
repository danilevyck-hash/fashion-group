"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, CalendarRange, Users, UserCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Multifashion, RetailMonthly } from "./types";
import { fmtMoney, fmtPct, deltaSymbol } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import { VendedorasSubtab } from "./VendedorasSubtab";

const SUBTAB_TRIGGER_CLASS =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs text-stone-500 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none";

export function MultifashionView({ data }: { data: Multifashion }) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0 overflow-x-auto rounded-none border-b border-stone-200 bg-transparent px-4 p-0 md:mx-0 md:px-0">
        <TabsTrigger value="overview" className={SUBTAB_TRIGGER_CLASS}>
          <TrendingUp className="h-3 w-3" /> Overview
        </TabsTrigger>
        <TabsTrigger value="mes" className={SUBTAB_TRIGGER_CLASS}>
          <CalendarRange className="h-3 w-3" /> Mes en curso
        </TabsTrigger>
        <TabsTrigger value="vendedoras" className={SUBTAB_TRIGGER_CLASS}>
          <Users className="h-3 w-3" /> Vendedoras
        </TabsTrigger>
        <TabsTrigger value="clientes" className={SUBTAB_TRIGGER_CLASS}>
          <UserCircle className="h-3 w-3" /> Clientes
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-5">
        <OverviewSubtab data={data} />
      </TabsContent>
      <TabsContent value="mes" className="mt-5">
        <PlaceholderSubtab icon={CalendarRange} label="Mes en curso" />
      </TabsContent>
      <TabsContent value="vendedoras" className="mt-5">
        <VendedorasSubtab data={data} />
      </TabsContent>
      <TabsContent value="clientes" className="mt-5">
        <PlaceholderSubtab icon={UserCircle} label="Clientes" />
      </TabsContent>
    </Tabs>
  );
}

function OverviewSubtab({ data }: { data: Multifashion }) {
  const pctMeta = data.ytdVentas / data.metaAnual;
  const proyeccion = data.ytdVentas / data.expectedTodayPct;

  return (
    <div className="space-y-5">
      {/* 1. Header card — store identity + meta */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-teal-100 bg-teal-50 text-teal-700">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold leading-tight text-stone-950">{data.tienda}</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Multifashion · {data.ubicacion} · Manager {data.manager}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Meta anual 2026</p>
          <p className="mt-1 font-mono text-xl font-medium text-stone-950 tabular-nums">{fmtMoney(data.metaAnual)}</p>
        </div>
      </Card>

      {/* 2. 4 KPI cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <RetailKpi label="VENTAS YTD" value={fmtMoney(data.ytdVentas)} sub="Ene–Abr 2026" />
        <RetailKpi label="TICKETS YTD" value={data.ytdTickets.toLocaleString()} sub="boletas emitidas" />
        <RetailKpi label="TICKET PROMEDIO" value={"$" + data.ticketProm.toFixed(2)} sub="por boleta" />
        <RetailKpi label="MARGEN BRUTO" value={(data.margen * 100).toFixed(1) + "%"} sub="▲ +1.2 pts vs 2025" />
      </div>

      {/* 3. Progress vs meta */}
      <Card className="p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Avance vs meta anual</p>
          <p className="font-mono text-xs text-stone-950 tabular-nums">
            {(pctMeta * 100).toFixed(1)}% · {fmtMoney(data.ytdVentas)} de {fmtMoney(data.metaAnual)}
          </p>
        </div>
        <div className="relative h-3 rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-teal-700 transition-[width] duration-300"
            style={{ width: `${pctMeta * 100}%` }}
          />
          {/* Black "expected today" marker */}
          <div
            className="absolute -top-1 -bottom-1 w-0.5 bg-stone-950"
            style={{ left: `${data.expectedTodayPct * 100}%` }}
          />
          <div
            className="absolute whitespace-nowrap font-mono text-[10px] text-stone-950"
            style={{ top: -22, left: `${data.expectedTodayPct * 100}%`, transform: "translateX(-50%)" }}
          >
            esperado hoy · {(data.expectedTodayPct * 100).toFixed(0)}%
          </div>
        </div>
        <p className="mt-3.5 text-xs text-stone-500">
          Proyección de cierre <span className="font-mono font-medium text-stone-950 tabular-nums">{fmtMoney(proyeccion)}</span>
          {" · "}
          {proyeccion >= data.metaAnual
            ? <span className="text-emerald-600">▲ supera meta</span>
            : <span className="text-amber-700">▼ por debajo de meta</span>}
        </p>
      </Card>

      {/* 4. Tabla mensual retail */}
      <section>
        <h3 className="mb-2 font-display text-base font-semibold text-stone-950">Detalle mensual retail</h3>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 640 }}>
              <thead>
                <tr className="bg-stone-100">
                  {["Mes", "Ventas", "Tickets", "Ticket prom.", "vs 2025"].map((h, i) => (
                    <th key={h} className={cn(
                      "border-b border-stone-200 px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-stone-500",
                      i === 0 ? "text-left" : "text-right"
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.meses.map(row => <RetailRow key={row.mes} row={row} />)}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

    </div>
  );
}

function PlaceholderSubtab({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <Card className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-12 text-center">
      <Icon className="h-10 w-10 text-stone-400" strokeWidth={1.5} />
      <p className="text-sm text-stone-500">
        <span className="font-medium text-stone-600">{label}</span> · Próximamente
      </p>
    </Card>
  );
}

function RetailKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-[10px] font-medium uppercase tracking-widest text-stone-500">{label}</p>
      <p className="mt-1.5 font-mono text-[22px] font-medium leading-tight text-stone-950 tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-stone-500">{sub}</p>}
    </Card>
  );
}

function RetailRow({ row }: { row: RetailMonthly }) {
  const isEmpty = row.tickets === 0 && row.ventas === 0;
  const vs = row.vs2025 ?? 0;
  const tone =
    vs > 0.05  ? "text-emerald-600" :
    vs < -0.05 ? "text-red-600"     : "text-stone-500";
  const empty = "border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm text-stone-400 tabular-nums";
  return (
    <tr>
      <td className="border-b border-stone-200 px-3.5 py-2.5 text-sm text-stone-950">{row.mes} 2026</td>
      {isEmpty ? (
        <>
          <td className={empty}>—</td>
          <td className={empty}>—</td>
          <td className={empty}>—</td>
          <td className={empty}>—</td>
        </>
      ) : (
        <>
          <td className="border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm text-stone-950 tabular-nums">{fmtMoney(row.ventas)}</td>
          <td className="border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm text-stone-700 tabular-nums">{row.tickets.toLocaleString()}</td>
          <td className="border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm text-stone-700 tabular-nums">${row.ticketProm.toFixed(2)}</td>
          <td className={cn("border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-xs tabular-nums", tone)}>
            {deltaSymbol(row.vs2025)} {fmtPct(row.vs2025)}
          </td>
        </>
      )}
    </tr>
  );
}

