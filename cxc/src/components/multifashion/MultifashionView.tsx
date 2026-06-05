"use client";

import { useEffect, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, CalendarRange, Users, UserCircle, Package, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, XAxis, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import type { Multifashion, RetailMonthly, WholesaleMonthly } from "@/components/ventas/types";
import { fmtMoney, fmtPct, deltaSymbol, MONTHS } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import { VendedorasSubtab } from "./VendedorasSubtab";
import { DetalleMensualSubtab } from "./DetalleMensualSubtab";
import { ClientesMultifashionSubtab } from "./ClientesMultifashionSubtab";

const SUBTAB_TRIGGER_CLASS =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs text-stone-500 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none";

interface MultifashionViewProps {
  data: Multifashion;
  selectedYear: number;
  isClosedYear: boolean;
}

export function MultifashionView({ data, selectedYear, isClosedYear }: MultifashionViewProps) {
  // Sub-tab activo en la URL (?subtab=overview|mes|vendedoras|clientes). Key
  // distinta a "tab" del shell para no chocar. Persiste en refresh/back-forward.
  const [subtab, setSubtab] = useUrlState("subtab", "overview");

  // PERÍODO global de Multifashion: el AÑO viene del selector global de Ventas
  // (selectedYear) y el MES se eleva a este shell para compartirlo entre los
  // sub-tabs que lo usan (Detalle mensual + Vendedoras). Overview (YTD anual) y
  // Clientes (rangos relativos) lo ignoran. El mes persiste en URL (?mfMes=),
  // sin chocar con ?subtab= ni con el ?tab= del shell de Ventas.
  //
  // FUENTE ÚNICA DE VERDAD del rango de meses navegables. La consumen el
  // dropdown, ‹ y › — no se duplica la lista de meses ni el cálculo del tope.
  //   - minMonth: primer mes con data del año (piso, ‹ se deshabilita ahí).
  //   - maxMonth: tope navegable. Año en curso = mes calendario actual (junio:
  //     navegable, es el mes en curso parcial). Año cerrado = último mes con
  //     data. › se deshabilita ahí. No se navega al futuro.
  //   - mesDefault: ÚLTIMO mes con data que NO sea el mes calendario en curso
  //     (hoy 2 jun → mayo, no junio). Solo el valor inicial del estado de UI.
  //     Fallbacks: si solo el mes en curso tiene data, ese mismo; sin data,
  //     Dic (año cerrado) / mes calendario (año en curso).
  const { minMonth, maxMonth, mesDefault } = useMemo(() => {
    const now = new Date();
    const isCurrentYear = selectedYear === now.getFullYear();
    const currentCalMonth = now.getMonth() + 1;
    const withData: number[] = [];
    data.retail.meses.forEach((m, i) => {
      if (m.tickets > 0 || m.ventas > 0) withData.push(i + 1);
    });
    const min = withData.length > 0 ? withData[0] : 1;
    const max = isCurrentYear
      ? currentCalMonth
      : (withData.length > 0 ? withData[withData.length - 1] : 12);
    // default = último con data excluyendo el mes calendario en curso.
    const closed = withData.filter(m => !(isCurrentYear && m === currentCalMonth));
    const def = closed.length > 0
      ? closed[closed.length - 1]
      : withData.length > 0
        ? withData[withData.length - 1]
        : (isClosedYear ? 12 : currentCalMonth);
    return { minMonth: min, maxMonth: max, mesDefault: def };
  }, [data.retail.meses, selectedYear, isClosedYear]);

  const [mes, setMes] = useUrlState("mfMes", mesDefault);

  // Meses para el dropdown: el mismo rango [minMonth, maxMonth] que limita a
  // las flechas. Una sola fuente de verdad para los tres controles.
  const navMonths = useMemo(() => {
    const out: number[] = [];
    for (let m = minMonth; m <= maxMonth; m++) out.push(m);
    return out;
  }, [minMonth, maxMonth]);

  // Límites de navegación. › tope = mes en curso (año actual) / último con data
  // (año cerrado). ‹ piso = primer mes con data. Sin cruce de año (el año se
  // cambia con el selector global de Ventas).
  const canPrev = mes > minMonth;
  const canNext = mes < maxMonth;
  const goPrev = () => { if (canPrev) setMes(mes - 1); };
  const goNext = () => { if (canNext) setMes(mes + 1); };

  // Aclaración sutil bajo el selector: cuando muestra el ÚLTIMO MES CERRADO por
  // default (ej. mayo estando en junio) explica por qué no es el mes en curso.
  // Solo en ese caso (default + año actual + el mes no es el calendario actual);
  // navegar manualmente a otro mes lo oculta. No cambia data ni el default.
  const nowRef = new Date();
  const currentCalMonth = nowRef.getMonth() + 1;
  const showMesCerradoHint =
    selectedYear === nowRef.getFullYear() && mes === mesDefault && mes !== currentCalMonth;

  // Al cambiar el año global, snap del mes al default del nuevo año. En el
  // primer render se respeta un ?mfMes= compartido por link SOLO si cae en el
  // rango navegable; si viene fuera de rango (URL manual/obsoleta) se hace snap
  // al default. Dep en mesDefault además de selectedYear porque la data del año
  // nuevo llega un tick después (refetch en VentasShell); mesDefault es estable
  // dentro de un mismo año, así que no pisa la selección manual. setMes se omite
  // a propósito: su identidad cambia con cada update de la URL.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (mes < minMonth || mes > maxMonth) setMes(mesDefault);
      return;
    }
    setMes(mesDefault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, mesDefault]);

  return (
    <div className="w-full">
      {/* Selector único de período (mes) con flechas ‹ › a los lados. Alineado
          a la derecha, mismo alto (h-9) que el selector de año global de Ventas.
          El año lo fija ese selector global; aquí solo el mes. Solo se muestra en
          los subtabs que lo usan (Detalle mensual y Vendedoras); Overview (YTD) y
          Clientes (pills propias) lo ocultan para no parecer un control roto.
          Flechas y dropdown comparten el rango [minMonth, maxMonth]. */}
      {(subtab === "mes" || subtab === "vendedoras") && (
      <div className="mb-4">
        <div className="flex items-center justify-end gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Mes</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            aria-label="Mes anterior"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-stone-200 disabled:hover:text-stone-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Select value={String(mes)} onValueChange={v => setMes(parseInt(v, 10))}>
            <SelectTrigger className="h-9 w-auto min-w-[140px] gap-1.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {navMonths.map(m => (
                <SelectItem key={m} value={String(m)} className="text-xs">
                  {MES_FULL_OVERVIEW[m - 1]} {selectedYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            aria-label="Mes siguiente"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-stone-200 disabled:hover:text-stone-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        </div>
        {showMesCerradoHint && (
          <p className="mt-1 text-right text-[10.5px] text-stone-400">
            último mes cerrado · {MES_FULL_OVERVIEW[currentCalMonth - 1].toLowerCase()} en curso
          </p>
        )}
      </div>
      )}

      <Tabs value={subtab} onValueChange={setSubtab} className="w-full">
        <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0 overflow-x-auto rounded-none border-b border-stone-200 bg-transparent px-4 p-0 md:mx-0 md:px-0">
          <TabsTrigger value="overview" className={SUBTAB_TRIGGER_CLASS}>
            <TrendingUp className="h-3 w-3" /> Overview
          </TabsTrigger>
          <TabsTrigger value="mes" className={SUBTAB_TRIGGER_CLASS}>
            <CalendarRange className="h-3 w-3" /> Detalle mensual
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
          <DetalleMensualSubtab year={selectedYear} mes={mes} />
        </TabsContent>
        <TabsContent value="vendedoras" className="mt-5">
          <VendedorasSubtab data={data} selectedYear={selectedYear} mes={mes} onMesChange={setMes} />
        </TabsContent>
        <TabsContent value="clientes" className="mt-5">
          <ClientesMultifashionSubtab selectedYear={selectedYear} />
        </TabsContent>
      </Tabs>
    </div>
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

type ProyChartPoint = { mes: string; prev: number | null; cur: number | null };
type Proyeccion = {
  chart: ProyChartPoint[];
  proyeccion: number;
  delta: number | null;
  has: boolean;
};

// Proyección de cierre PONDERADA POR TEMPORADA (no lineal). Escala el cierre
// real del año anterior por el ritmo YTD real del año en curso, usando solo
// meses COMPLETOS en ambos lados (excluye el mes en curso parcial):
//   proyeccion = ytd_actual × (cierre_prev / ytd_prev_mismos_meses)
// Respeta la forma estacional de 2025 sin inventar meses futuros. Para año
// cerrado, lastComplete=12 ⇒ proyeccion = cierre real del año (ytd_actual).
// chart: 12 puntos { prev (año anterior, mes completo), cur (año en curso,
// solo hasta el último mes completo; null después para cortar la línea) }.
function buildProyeccion(meses: RetailMonthly[]): Proyeccion {
  let lastComplete = 0;
  meses.forEach((m, i) => {
    if (!m.es_periodo_parcial && (m.ventas > 0 || m.tickets > 0)) lastComplete = i + 1;
  });
  const cierrePrev = meses.reduce((s, m) => s + (m.ventasPrev ?? 0), 0);
  const ytdActual = meses.slice(0, lastComplete).reduce((s, m) => s + m.ventas, 0);
  const ytdPrev = meses.slice(0, lastComplete).reduce((s, m) => s + (m.ventasPrev ?? 0), 0);
  const has = lastComplete > 0 && ytdPrev > 0 && cierrePrev > 0;
  const proyeccion = has ? ytdActual * (cierrePrev / ytdPrev) : 0;
  const delta = has ? (proyeccion - cierrePrev) / cierrePrev : null;
  const chart: ProyChartPoint[] = meses.map((m, i) => ({
    mes: m.mes,
    prev: m.ventasPrev ?? null,
    cur: i + 1 <= lastComplete ? m.ventas : null,
  }));
  return { chart, proyeccion, delta, has };
}

// Sub-label del card de margen TIENDA COMPLETA (v4: costo real de
// switch_costo_diario). "▲ +3.0 pts vs 2025" cuando hay margen del año anterior.
// Chequeo estricto con typeof+isFinite por si JSON/Next.js coacciona null→0.
function buildMargenSub(margen: number | null, margenPrev: number | null, prevYear: number): string {
  const mOk = typeof margen === "number" && Number.isFinite(margen);
  if (!mOk) return "Sin costo disponible";
  const pOk = typeof margenPrev === "number" && Number.isFinite(margenPrev);
  // Hay margen actual pero no del año anterior: aclara el alcance en vez de
  // mostrar un delta falso.
  if (!pOk) return "Retail + mayoreo";
  const deltaPts = ((margen as number) - (margenPrev as number)) * 100;
  if (Math.abs(deltaPts) < 0.05) {
    return `Sin cambio vs ${prevYear}`;
  }
  const sign = deltaPts >= 0 ? "▲ +" : "▼ ";
  return `${sign}${Math.abs(deltaPts).toFixed(1)} pts vs ${prevYear}`;
}

// FASE 2.1b: '—' cuando margen no es un número finito (null/undefined/NaN).
function fmtMargen(margen: number | null): string {
  return typeof margen === "number" && Number.isFinite(margen)
    ? `${(margen * 100).toFixed(1)}%`
    : "—";
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

  // Hero de proyección: serie mensual retail del año anterior (mes completo) vs
  // año en curso, + proyección de cierre PONDERADA POR TEMPORADA (no lineal).
  // Reemplaza la barra "avance vs meta". Retail-only.
  const proy = buildProyeccion(retail.meses);

  // Disclaimer del mes parcial para el footer de la tabla retail.
  // Para años cerrados no aplica (no hay mes parcial).
  const partialMonth = isClosedYear ? null : retail.meses.find(m => m.es_periodo_parcial);
  const partialDisclaimer = partialMonth ? buildPartialMonthDisclaimer(partialMonth) : null;

  const retailYtdSub = buildRetailYtdSub(retail.meses, year, isClosedYear);
  // Margen a nivel TIENDA COMPLETA (retail + mayoreo): la API (tipo=03) da costo
  // agregado, no separa retail puro, así que el margen solo es honesto a nivel
  // tienda. Usa total.margen, NO retail.margen.
  const margenSub = buildMargenSub(total.margen, total.margenPrev, prevYear);

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

      {/* 2. 4 KPI cards — los 3 primeros RETAIL ONLY; el margen es TIENDA COMPLETA
          (la API tipo=03 da costo agregado retail+mayoreo, no separa retail puro). */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <RetailKpi label={`VENTAS RETAIL ${ytdSuffix}`} value={fmtMoney(retail.ytdVentas)} sub={retailYtdSub} />
        <RetailKpi label={`TICKETS RETAIL ${ytdSuffix}`} value={retail.ytdTickets.toLocaleString()} sub="boletas emitidas" />
        <RetailKpi label="TICKET PROMEDIO RETAIL" value={"$" + retail.ticketProm.toFixed(2)} sub="por boleta" />
        <RetailKpi label="MARGEN BRUTO · TIENDA COMPLETA" value={fmtMargen(total.margen)} sub={margenSub} />
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

      {/* 4. Hero de proyección — líneas año anterior vs año en curso + cierre */}
      <ProyeccionHero proy={proy} year={year} prevYear={prevYear} isClosedYear={isClosedYear} />

      {/* 5. Tabla detalle mensual retail + fila resumen wholesale */}
      <section>
        <h3 className="mb-2 font-display text-base font-semibold text-stone-950">Detalle mensual · retail</h3>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 640 }}>
              <thead>
                <tr className="bg-stone-100">
                  {["Mes", "Ventas", "Tickets", "Ticket prom.", `vs ${prevYear}`].map((h, i) => (
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

// Hero de proyección: a la izquierda dos líneas finas (año anterior ámbar full
// year 1.5px + año en curso azul 3px, corta donde no hay data); a la derecha el
// número de proyección de cierre + delta vs cierre del año anterior.
// Colores fijos por accesibilidad (Daniel daltónico): ámbar #BA7517, azul #185FA5.
function ProyeccionHero({
  proy, year, prevYear, isClosedYear,
}: {
  proy: Proyeccion;
  year: number;
  prevYear: number;
  isClosedYear: boolean;
}) {
  const label = isClosedYear ? `Cierre ${year}` : "Proyección de cierre";
  const sub = isClosedYear ? "cierre real del año" : "ponderado por temporada";
  const delta = proy.delta;
  const deltaTone = delta == null ? "text-stone-400"
    : delta > 0.001 ? "text-emerald-600"
    : delta < -0.001 ? "text-red-600"
    : "text-stone-500";
  const deltaStr = delta == null ? "—"
    : `${delta >= 0 ? "▲ +" : "▼ "}${Math.abs(delta * 100).toFixed(0)}%`;

  return (
    <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
      {/* Izquierda: líneas finas año anterior vs año en curso */}
      <div className="min-w-0 flex-1">
        <div className="h-[170px] w-full">
          <ResponsiveContainer>
            <LineChart data={proy.chart} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 10, fill: "#78716c" }}
                axisLine={{ stroke: "#e7e5e4" }}
                tickLine={false}
                interval={0}
              />
              <RTooltip
                cursor={{ stroke: "#d6d3d1", strokeWidth: 1 }}
                content={(p) => (
                  <ProyeccionTooltip
                    active={p.active}
                    payload={p.payload as ReadonlyArray<unknown> | undefined}
                    label={typeof p.label === "string" ? p.label : undefined}
                    year={year}
                    prevYear={prevYear}
                  />
                )}
              />
              {/* Año anterior — ámbar, fino, completa los 12 meses. */}
              <Line
                type="monotone"
                dataKey="prev"
                stroke="#BA7517"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              {/* Año en curso — azul, grueso, corta donde no hay data real. */}
              <Line
                type="monotone"
                dataKey="cur"
                stroke="#185FA5"
                strokeWidth={3}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Derecha: proyección de cierre + delta */}
      <div className="shrink-0 border-stone-200 md:w-56 md:border-l md:pl-5">
        <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">{label}</p>
        <p className="mt-1 font-mono text-3xl font-medium leading-tight text-stone-950 tabular-nums">
          {proy.has ? fmtMoney(proy.proyeccion) : "—"}
        </p>
        {proy.has && (
          <p className={cn("mt-1.5 font-mono text-sm font-medium tabular-nums", deltaTone)}>
            {deltaStr}{" "}
            <span className="font-sans text-[11px] font-normal text-stone-500">vs cierre {prevYear}</span>
          </p>
        )}
        <p className="mt-1 text-[11px] text-stone-400">{sub}</p>
      </div>
    </Card>
  );
}

function ProyeccionTooltip({
  active, payload, label, year, prevYear,
}: {
  active?: boolean;
  payload?: ReadonlyArray<unknown>;
  label?: string;
  year: number;
  prevYear: number;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const read = (key: string): number | null => {
    for (const it of payload) {
      if (typeof it === "object" && it !== null && (it as Record<string, unknown>).dataKey === key) {
        const v = (it as Record<string, unknown>).value;
        return typeof v === "number" ? v : null;
      }
    }
    return null;
  };
  const cur = read("cur");
  const prev = read("prev");
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-[11px] shadow-sm">
      <p className="mb-1 font-medium text-stone-700">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 text-stone-500">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: "#185FA5" }} />
          {year}
        </span>
        <span className="font-mono tabular-nums text-stone-950">{cur != null ? fmtMoney(cur) : "—"}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 text-stone-500">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: "#BA7517" }} />
          {prevYear}
        </span>
        <span className="font-mono tabular-nums text-stone-700">{prev != null ? fmtMoney(prev) : "—"}</span>
      </div>
    </div>
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
  const vs = row.vs2025;
  // Bug #2 fix: cuando prev_year era casi cero el RPC devolvía deltas
  // gigantes (ej. +363024900% en Mayo 2025 retail). Heurística:
  //   - vs null               → "— —"  (sin comparativo)
  //   - |vs| > 100 (10000%)   → "n/a"   (divisor cercano a cero, no informativo)
  //   - resto                 → "▲/▼ X%" normal
  const vsAbsHuge = vs != null && Math.abs(vs) > 100;
  const tone = vs == null || vsAbsHuge
    ? "text-stone-400"
    : vs > 0.05  ? "text-emerald-600"
    : vs < -0.05 ? "text-red-600"
    : "text-stone-500";
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
            {vs == null
              ? "—"
              : vsAbsHuge
                ? "n/a"
                : `${deltaSymbol(vs)} ${fmtPct(vs)}`}
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
