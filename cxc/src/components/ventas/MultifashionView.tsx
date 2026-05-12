"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, CalendarRange, Users, UserCircle, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Multifashion, RetailMonthly, WholesaleMonthly } from "./types";
import { fmtMoney, fmtPct, deltaSymbol, MONTHS } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import { VendedorasSubtab } from "./VendedorasSubtab";

const SUBTAB_TRIGGER_CLASS =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs text-stone-500 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none";

interface MultifashionViewProps {
  data: Multifashion;
  selectedYear: number;
  isClosedYear: boolean;
}

export function MultifashionView({ data, selectedYear, isClosedYear }: MultifashionViewProps) {
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
        <OverviewSubtab data={data} selectedYear={selectedYear} isClosedYear={isClosedYear} />
      </TabsContent>
      <TabsContent value="mes" className="mt-5">
        {isClosedYear ? (
          <PlaceholderSubtab icon={CalendarRange} label={`Año ${selectedYear} cerrado · no hay mes en curso`} />
        ) : (
          <PlaceholderSubtab icon={CalendarRange} label="Mes en curso" />
        )}
      </TabsContent>
      <TabsContent value="vendedoras" className="mt-5">
        <VendedorasSubtab data={data} selectedYear={selectedYear} isClosedYear={isClosedYear} />
      </TabsContent>
      <TabsContent value="clientes" className="mt-5">
        <PlaceholderSubtab icon={UserCircle} label="Clientes" />
      </TabsContent>
    </Tabs>
  );
}

const MES_FULL_OVERVIEW = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function parseIsoDateOverview(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// "Mayo 2026 en curso · Comparativo vs Mayo 1–9 2025"
function buildPartialMonthDisclaimer(row: RetailMonthly): string | null {
  if (!row.fecha_corte || !row.dia_corte_anio_anterior) return null;
  const cur = parseIsoDateOverview(row.fecha_corte);
  const prev = parseIsoDateOverview(row.dia_corte_anio_anterior);
  const curMonthName = MES_FULL_OVERVIEW[cur.getMonth()];
  const prevMonthName = MES_FULL_OVERVIEW[prev.getMonth()];
  return `${curMonthName} ${cur.getFullYear()} en curso · Comparativo vs ${prevMonthName} 1–${prev.getDate()} ${prev.getFullYear()}`;
}

// "Ene–May 2026 · ajustado al día de corte (9 may)" (cuando hay mes parcial)
// "Ene–Dic 2025"                                    (año cerrado, todos los meses con data)
// "Ene–<últimoMes> 2026"                            (año actual sin mes parcial)
function buildRetailYtdSub(meses: RetailMonthly[], year: number, isClosedYear: boolean): string {
  const partial = meses.find(m => m.es_periodo_parcial);
  if (isClosedYear) {
    return `Ene–Dic ${year}`;
  }
  let lastMes = 0;
  meses.forEach((m, i) => { if (m.tickets > 0 || m.ventas > 0) lastMes = i + 1; });
  const rangeLabel = lastMes > 0
    ? `Ene–${MONTHS[lastMes - 1]} ${year}`
    : `${year}`;
  if (partial?.fecha_corte) {
    const d = parseIsoDateOverview(partial.fecha_corte);
    const mesShort = MONTHS[d.getMonth()].toLowerCase();
    return `${rangeLabel} · ajustado al día de corte (${d.getDate()} ${mesShort})`;
  }
  return rangeLabel;
}

// "Año cerrado · alcanzó 92% de meta" con color semantic.
// >=100% verde "supera meta", >=85% ámbar "cerca", <85% rojo "lejos".
function buildClosedYearMetaSummary(pctMeta: number): { label: string; tone: string; arrow: string } {
  const pct = (pctMeta * 100).toFixed(1);
  if (pctMeta >= 1.0) {
    return { label: `Año cerrado · alcanzó ${pct}% de meta`, tone: "text-emerald-700", arrow: "▲" };
  }
  if (pctMeta >= 0.85) {
    return { label: `Año cerrado · alcanzó ${pct}% de meta`, tone: "text-amber-700", arrow: "—" };
  }
  return { label: `Año cerrado · alcanzó ${pct}% de meta`, tone: "text-red-700", arrow: "▼" };
}

// "▲ +1.2 pts vs 2025" — margen retail vs margenPrev retail (mismo período).
function buildMargenSub(margen: number, margenPrev: number, prevYear: number): string {
  const deltaPts = (margen - margenPrev) * 100;
  if (Math.abs(deltaPts) < 0.05) {
    return `Sin cambio vs ${prevYear}`;
  }
  const sign = deltaPts >= 0 ? "▲ +" : "▼ ";
  return `${sign}${Math.abs(deltaPts).toFixed(1)} pts vs ${prevYear}`;
}

function OverviewSubtab({
  data, selectedYear, isClosedYear,
}: {
  data: Multifashion;
  selectedYear: number;
  isClosedYear: boolean;
}) {
  const { retail, wholesale, total } = data;
  const year = selectedYear;
  const prevYear = year - 1;

  // Progress bar usa TOTAL (retail + wholesale) porque la meta anual del
  // negocio históricamente incluye todo.
  const pctMeta = data.metaAnual > 0 ? total.ytdVentas / data.metaAnual : 0;
  const proyeccion = data.expectedTodayPct > 0
    ? total.ytdVentas / data.expectedTodayPct
    : 0;
  const closedSummary = isClosedYear ? buildClosedYearMetaSummary(pctMeta) : null;

  // Disclaimer del mes parcial para el footer de la tabla retail.
  // Para años cerrados no aplica (no hay mes parcial).
  const partialMonth = isClosedYear ? null : retail.meses.find(m => m.es_periodo_parcial);
  const partialDisclaimer = partialMonth ? buildPartialMonthDisclaimer(partialMonth) : null;

  const retailYtdSub = buildRetailYtdSub(retail.meses, year, isClosedYear);
  const margenSub = buildMargenSub(retail.margen, retail.margenPrev, prevYear);

  // Labels KPI: "YTD" para año en curso, "{year}" para año cerrado.
  const ytdSuffix = isClosedYear ? String(year) : "YTD";

  // Label del card Mayoreo: top cliente cuando hay 1, "N clientes wholesale" si >1.
  const wholesaleClienteLabel = wholesale.totalClientes > 1
    ? `${wholesale.totalClientes} clientes wholesale`
    : (wholesale.topClienteName ?? "—");

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
          <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Meta anual {year}</p>
          <p className="mt-1 font-mono text-xl font-medium text-stone-950 tabular-nums">{fmtMoney(data.metaAnual)}</p>
        </div>
      </Card>

      {/* 2. 4 KPI cards — RETAIL ONLY */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <RetailKpi label={`VENTAS RETAIL ${ytdSuffix}`} value={fmtMoney(retail.ytdVentas)} sub={retailYtdSub} />
        <RetailKpi label={`TICKETS RETAIL ${ytdSuffix}`} value={retail.ytdTickets.toLocaleString()} sub="boletas emitidas" />
        <RetailKpi label="TICKET PROMEDIO RETAIL" value={"$" + retail.ticketProm.toFixed(2)} sub="por boleta" />
        <RetailKpi label="MARGEN BRUTO RETAIL" value={(retail.margen * 100).toFixed(1) + "%"} sub={margenSub} />
      </div>

      {/* 3. Wholesale card (debajo de los 4 retail KPIs) */}
      {wholesale.ytdVentas > 0 && (
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-100 bg-amber-50 text-amber-700">
            <Package className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Mayoreo YTD</p>
            <p className="mt-0.5 font-mono text-xl font-medium text-stone-950 tabular-nums">{fmtMoney(wholesale.ytdVentas)}</p>
          </div>
          <div className="text-right text-xs text-stone-500">
            <p><span className="font-mono tabular-nums text-stone-700">{wholesale.ytdTickets}</span> tickets</p>
            <p className="mt-0.5 truncate max-w-[260px]" title={wholesaleClienteLabel}>
              {wholesaleClienteLabel}
            </p>
          </div>
        </Card>
      )}

      {/* 4. Progress vs meta — usa TOTAL */}
      <Card className="p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Avance vs meta anual</p>
          <p className="font-mono text-xs text-stone-950 tabular-nums">
            {(pctMeta * 100).toFixed(1)}% · {fmtMoney(total.ytdVentas)} de {fmtMoney(data.metaAnual)}
          </p>
        </div>
        <div className="relative h-3 rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-teal-700 transition-[width] duration-300"
            style={{ width: `${Math.min(100, pctMeta * 100)}%` }}
          />
          {/* "Esperado hoy" marker — solo aplica al año en curso. */}
          {!isClosedYear && (
            <>
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
            </>
          )}
        </div>
        {isClosedYear && closedSummary ? (
          <p className={cn("mt-3.5 text-xs font-medium", closedSummary.tone)}>
            {closedSummary.arrow} {closedSummary.label}
          </p>
        ) : (
          <p className="mt-3.5 text-xs text-stone-500">
            Proyección de cierre <span className="font-mono font-medium text-stone-950 tabular-nums">{fmtMoney(proyeccion)}</span>
            {" · "}
            {proyeccion >= data.metaAnual
              ? <span className="text-emerald-600">▲ supera meta</span>
              : <span className="text-amber-700">▼ por debajo de meta</span>}
            {" · incluye retail + mayoreo"}
          </p>
        )}
      </Card>

      {/* 5. Tabla detalle mensual retail + fila resumen wholesale */}
      <section>
        <h3 className="mb-2 font-display text-base font-semibold text-stone-950">Detalle mensual · retail</h3>
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
                {retail.meses.map(row => <RetailRow key={row.mes} row={row} year={year} />)}
                {wholesale.ytdVentas > 0 && (
                  <WholesaleSummaryRow
                    wholesale={wholesale}
                    label={wholesale.totalClientes > 1
                      ? `Mayoreo · ${wholesale.totalClientes} clientes`
                      : `Mayoreo · ${wholesale.topClienteName ?? "—"}`}
                  />
                )}
              </tbody>
            </table>
          </div>
          {partialDisclaimer && (
            <p className="border-t border-stone-200 bg-stone-50 px-3.5 py-2 text-xs text-stone-500">
              {partialDisclaimer}
            </p>
          )}
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

function RetailRow({ row, year }: { row: RetailMonthly; year: number }) {
  const isEmpty = row.tickets === 0 && row.ventas === 0;
  const vs = row.vs2025 ?? 0;
  const tone =
    vs > 0.05  ? "text-emerald-600" :
    vs < -0.05 ? "text-red-600"     : "text-stone-500";
  const empty = "border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm text-stone-400 tabular-nums";
  return (
    <tr>
      <td className="border-b border-stone-200 px-3.5 py-2.5 text-sm text-stone-950">{row.mes} {year}</td>
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

/** Fila resumen al pie del detalle mensual retail. Suma el wholesale YTD
 *  agregado + breakdown de meses con actividad inline. */
function WholesaleSummaryRow({
  wholesale, label,
}: {
  wholesale: { ytdVentas: number; ytdTickets: number; meses: WholesaleMonthly[] };
  label: string;
}) {
  const mesesConData = wholesale.meses
    .filter(m => m.ventas > 0)
    .map(m => `${m.mes} $${Math.round(m.ventas).toLocaleString()}`);
  const ticketProm = wholesale.ytdTickets > 0 ? wholesale.ytdVentas / wholesale.ytdTickets : 0;
  return (
    <tr className="bg-amber-50/60">
      <td className="border-b border-stone-200 px-3.5 py-2.5 text-sm text-stone-950">
        <div className="font-medium">{label}</div>
        {mesesConData.length > 0 && (
          <div className="mt-0.5 text-[11px] font-mono text-stone-500 tabular-nums">
            {mesesConData.join(" · ")}
          </div>
        )}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">
        {fmtMoney(wholesale.ytdVentas)}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm text-stone-700 tabular-nums">
        {wholesale.ytdTickets.toLocaleString()}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-sm text-stone-700 tabular-nums">
        ${ticketProm.toFixed(2)}
      </td>
      <td className="border-b border-stone-200 px-3.5 py-2.5 text-right font-mono text-xs text-stone-400 tabular-nums">
        —
      </td>
    </tr>
  );
}
