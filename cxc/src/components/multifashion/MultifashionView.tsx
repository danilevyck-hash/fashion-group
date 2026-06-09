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
import dynamic from "next/dynamic";
import type { Multifashion, RetailMonthly, MultifashionSerieAnio, MultifashionSerieMes } from "@/components/ventas/types";
import type { CumPoint } from "./CumulativeChartCard";

// recharts (≈100kB) cargado aparte → fuera del bundle inicial de /multifashion.
const CumulativeChartCard = dynamic(
  () => import("./CumulativeChartCard").then((m) => m.CumulativeChartCard),
  { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded-lg bg-stone-100" /> },
);
import { fmtMoney, fmtMoneyCompact, MONTHS } from "@/lib/ventas/format";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import SyncStatus from "@/components/shared/SyncStatus";
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
    // default = mes EN CURSO (tope navegable): mes calendario actual para el año
    // en curso, último mes con data para año cerrado. (Antes era el último mes
    // cerrado; Daniel pidió arrancar en el mes en curso/recurrente.)
    const def = max;
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
      {subtab === "mes" && (
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
          <ClientesMultifashionSubtab selectedYear={selectedYear} mes={mes} />
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

// ── Línea acumulada diaria (Overview) ───────────────────────────────────────
// Colores fijos por accesibilidad (Daniel daltónico): ámbar #BA7517 (año previo,
// completo), azul #185FA5 (año en curso, hasta hoy).


function doyOf(fecha: string): number {
  const d = new Date(fecha + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86400000) + 1;
}
function monthOf(fecha: string): number {
  return Number(fecha.slice(5, 7));
}

// Une las dos series diarias por día-del-año. cur/prev = ACUMULADO (no el día).
// connectNulls en el chart hace que el acumulado se vea como rampa continua.
function buildCumulativeChart(act: MultifashionSerieAnio, prev: MultifashionSerieAnio): CumPoint[] {
  const map = new Map<number, CumPoint>();
  for (const p of prev.dias) {
    const k = doyOf(p.fecha);
    map.set(k, { doy: k, mes: monthOf(p.fecha), cur: null, prev: p.acumulado });
  }
  for (const p of act.dias) {
    const k = doyOf(p.fecha);
    const ex = map.get(k);
    if (ex) ex.cur = p.acumulado;
    else map.set(k, { doy: k, mes: monthOf(p.fecha), cur: p.acumulado, prev: null });
  }
  return [...map.values()].sort((a, b) => a.doy - b.doy);
}

function deltaTone(d: number | null): string {
  if (d == null) return "text-stone-400";
  return d > 0.001 ? "text-emerald-600" : d < -0.001 ? "text-red-600" : "text-stone-500";
}
function deltaStr(d: number | null): string {
  if (d == null) return "—";
  return `${d >= 0 ? "▲ +" : "▼ "}${Math.abs(d * 100).toFixed(0)}%`;
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
    ? `${(margen * 100).toFixed(0)}%`
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

  // Línea acumulada diaria del Overview: año en curso (hasta hoy) vs año previo
  // (completo) + tooltip por mes. La proyección de cierre vive en el header.
  const serieAct = data.serieActual;
  const seriePrev = data.seriePrevio;
  const cierreActual = serieAct.dias.length ? serieAct.dias[serieAct.dias.length - 1].acumulado : 0;
  const cumChart = buildCumulativeChart(serieAct, seriePrev);
  const mesMapAct = new Map<number, MultifashionSerieMes>(serieAct.meses.map((m) => [m.mes, m]));
  const mesMapPrev = new Map<number, MultifashionSerieMes>(seriePrev.meses.map((m) => [m.mes, m]));

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

  // Desglose mayoreo por mes (preservado del detalle mensual eliminado, ítem 4).
  const wholesaleMeses = wholesale.meses
    .filter(m => m.ventas > 0)
    .map(m => `${m.mes} $${Math.round(m.ventas).toLocaleString()}`);

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
              Multifashion · {data.ubicacion} · Gerente {data.manager}
            </p>
            <div className="mt-1.5">
              <SyncStatus
                tabla="facturas"
                empresasEsperadas={["american_classic"]}
                empresaLabels={EMPRESA_KEY_TO_NAME}
                variant="pill"
                prefix="Data actualizada al"
              />
            </div>
          </div>
        </div>
        <div className="text-right">
          {data.proyeccionCierre.tiene_proyeccion ? (
            <>
              <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Proyección de cierre {year}</p>
              <p className="mt-1 font-mono text-xl font-medium text-stone-950 tabular-nums">{fmtMoney(data.proyeccionCierre.proyeccion ?? 0)}</p>
              <p className={cn("mt-0.5 font-mono text-[11px] font-medium tabular-nums", deltaTone(data.proyeccionCierre.delta_pct))}>
                {deltaStr(data.proyeccionCierre.delta_pct)}{" "}
                <span className="font-sans font-normal text-stone-500">vs cierre {prevYear}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Cierre {year}</p>
              <p className="mt-1 font-mono text-xl font-medium text-stone-950 tabular-nums">{fmtMoney(cierreActual)}</p>
            </>
          )}
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

      {/* 3. Wholesale card (debajo de los 4 retail KPIs). Incluye el desglose
          por mes que antes vivía en la tabla "Detalle mensual · retail" (ítem 4). */}
      {wholesale.ytdVentas > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-100 bg-amber-50 text-amber-700">
              <Package className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Mayoreo {ytdSuffix}</p>
              <p className="mt-0.5 font-mono text-xl font-medium text-stone-950 tabular-nums">{fmtMoney(wholesale.ytdVentas)}</p>
            </div>
            <div className="text-right text-xs text-stone-500">
              <p><span className="font-mono tabular-nums text-stone-700">{wholesale.ytdTickets}</span> tickets</p>
              <p className="mt-0.5 truncate max-w-[260px]" title={wholesaleClienteLabel}>
                {wholesaleClienteLabel}
              </p>
            </div>
          </div>
          {wholesaleMeses.length > 0 && (
            <p className="mt-2 border-t border-stone-100 pt-2 font-mono text-[11px] tabular-nums text-stone-500">
              {wholesaleMeses.join(" · ")}
            </p>
          )}
        </Card>
      )}

      {/* 4. Línea acumulada diaria — año en curso vs año previo (tooltip por mes) */}
      <CumulativeChartCard
        chart={cumChart}
        mesMapAct={mesMapAct}
        mesMapPrev={mesMapPrev}
        year={year}
        prevYear={prevYear}
      />

      {/* (Tabla "Detalle mensual · retail" eliminada — duplicaba el subtab
          Detalle mensual. El desglose mayoreo se preservó en el card de arriba.
          Ítem 4 del sprint "Multifashion claridad".) */}

    </div>
  );
}

// Línea ACUMULADA DIARIA: año en curso (azul 3px, hasta hoy) vs año previo
// (ámbar 1.5px, completo). Eje X por día-del-año con ticks mensuales. El hover
// muestra totales POR MES (venta del mes + acumulado, ambos años), nunca el día.
// Colores fijos por accesibilidad (Daniel daltónico): ámbar #BA7517, azul #185FA5.
function RetailKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-[10px] font-medium uppercase tracking-widest text-stone-500">{label}</p>
      <p className="mt-1.5 font-mono text-[22px] font-medium leading-tight text-stone-950 tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-stone-500">{sub}</p>}
    </Card>
  );
}

