"use client";

// Vista unificada de Multifashion — reemplaza los subtabs "Overview" + "Detalle
// mensual" en una sola página con scroll:
//   1) (El nombre de la tienda, el pill de sync y "Actualizar ahora" viven en el
//      header de la página — MultifashionShell; el selector de mes, en
//      MultifashionView.)
//   2) Titular del mes (RETAIL PURO; el mayoreo se declara aparte) + 2 comparativos
//      con monto + línea de tickets/ticket promedio/proyección.
//   3) Gráfico "Ventas día por día" con toggle Mes/Año (Año = acumulado vs prev).
//   4) Banda de 3 cards: mejor/peor día · mejor día de semana · hora pico.
//   5) "Panorama del año" colapsable (YTD / proyección cierre / margen tienda).
//
// NO toca cálculos ni vistas: cada número sale de la MISMA fuente que ya usaban
// Overview (prop `overview`, server → multifashion_mensual_v6) y Detalle mensual
// (endpoint /api/multifashion/detalle-mensual). El titular usa `ventas` (retail)
// (PR #131); los comparativos siguen sobre retail (sus % no cambian).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  Award, AlertTriangle, Info, Clock, CalendarDays, ChevronDown,
} from "lucide-react";
import dynamic from "next/dynamic";
import type {
  Multifashion, RetailMonthly, MultifashionSerieAnio, MultifashionSerieMes,
} from "@/components/ventas/types";
import type { CumPoint } from "./CumulativeChartCard";
import { variacionPct, baseDesdeRatio, fmtVariacionPct } from "@/lib/variacion";

// recharts cargado aparte (ssr:false) → fuera del bundle inicial de /multifashion.
const VentasDiariasChart = dynamic(
  () => import("./DetalleMensualCharts").then((m) => m.VentasDiariasChart),
  { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded bg-gray-100" /> },
);
const HorasChart = dynamic(
  () => import("./DetalleMensualCharts").then((m) => m.HorasChart),
  { ssr: false, loading: () => <div className="h-[200px] w-full animate-pulse rounded bg-gray-100" /> },
);
const CumulativeChartCard = dynamic(
  () => import("./CumulativeChartCard").then((m) => m.CumulativeChartCard),
  { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded-lg bg-gray-100" /> },
);

import { fmtMoney, fmtMoneyCompact, fmtPct, MONTHS } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import { buildNotaMayoreo } from "@/lib/ventas/mayoreo";

interface DiaRow {
  dia: number;
  ventas: number;
  /** null cuando la fuente es switch_facturas (sin costo). */
  utilidad: number | null;
  n_tickets: number;
  ventas_mes_anterior: number;
  /** Ventas del MISMO día del MISMO mes del AÑO ANTERIOR (comparación YoY del
   *  gráfico). null si el año anterior no tiene datos (ej. antes de may 2024). */
  ventas_anio_anterior?: number | null;
}

interface HeatmapDow {
  dow: number;
  dow_label: string;
  ventas_promedio: number;
  count_dias: number;
}

interface HoraRow {
  /** Hora del día 0-23, en zona horaria de Panamá (UTC-5). */
  hora: number;
  ventas: number;
  n_tickets: number;
}

interface Totales {
  /** Retail mostrador (is_wholesale=false). Base de TODOS los comparativos
   *  (MoM/YoY), ticket promedio y proyección — NO cambia con el titular. */
  ventas: number;
  /** Mayoreo del mes (is_wholesale=true). Solo alimenta el titular + la nota. */
  mayoreo?: number;
  /** Tienda completa = ventas (retail) + mayoreo. Titular de VENTAS MES. */
  ventas_total?: number;
  /** null cuando la fuente es switch_facturas (sin costo). */
  utilidad: number | null;
  n_tickets: number;
  ticket_promedio: number;
  /** null cuando la fuente es switch_facturas (sin costo). UI → '—'. */
  margen: number | null;
  proyeccion_cierre: number | null;
}

interface ComparativoBlock {
  ventas: number;
  /** null cuando la fuente es switch_facturas (sin costo). */
  utilidad: number | null;
  n_tickets: number;
  tiene_data: boolean;
}

interface DetalleMensualResp {
  year: number;
  mes: number;
  mes_label: string;
  is_mes_actual: boolean;
  dia_actual: number;
  dias_en_mes: number;
  dias: DiaRow[];
  totales: Totales;
  mes_anterior: ComparativoBlock;
  yoy: ComparativoBlock;
  /** Año de la serie de comparación del gráfico (año actual − 1). */
  anio_anterior?: number;
  /** Si el mismo mes del año anterior tiene ventas (para dibujar la línea). */
  anio_anterior_tiene_data?: boolean;
  mejor_dia: { fecha: string; ventas: number } | null;
  peor_dia: { fecha: string; ventas: number } | null;
  heatmap_dia_semana: HeatmapDow[];
  /** Ventas por hora del día (0-23, hora Panamá). Aditivo: puede faltar. */
  horas?: HoraRow[];
  /** Hora con mayor venta neta del mes (0-23, Panamá). null si sin ventas. */
  hora_pico?: number | null;
  hora_pico_ventas?: number | null;
  /** Cliente(s) de mayoreo del mes, para la nota del titular. null si no hay. */
  mayoreo_cliente?: string | null;
  /** Lista de clientes distintos de mayoreo del mes (detalle de la nota). */
  mayoreo_clientes?: string[];
  /** Facturas de mayoreo del mes (resumen "N facturas" de la nota). */
  mayoreo_facturas?: number;
}

interface MultifashionResumenViewProps {
  /** Datos YTD/serie del año (server → multifashion_mensual_v6). Alimentan el
   *  bloque "Panorama del año". */
  overview: Multifashion;
  selectedYear: number;
  isClosedYear: boolean;
  /** Mes (1-12) del selector único de período en el shell de Multifashion. */
  mes: number;
  /** Contador que incrementa el shell tras un "Actualizar ahora" exitoso. El
   *  botón vive ahora en el header de la página (junto al nombre de la tienda),
   *  así que la orden de re-pedir el detalle del mes llega por esta señal. */
  syncTick?: number;
}

const MESES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MESES_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatFechaShort(iso: string): string {
  const d = parseIsoDateLocal(iso);
  return `${d.getDate()} ${MESES_SHORT[d.getMonth()]}`;
}

// Delta % entre ventas corrientes y comparativo. Devuelve null si !tiene_data
// o si el divisor es muy chico (evita spikes engañosos a +99999%).
// El umbral ya NO vive acá: es la regla única de `variacionPct` (variacion.ts),
// que nació justamente de este guard — era el ÚNICO del front que lo tenía.
function calcDeltaPct(cur: number, comp: ComparativoBlock): number | null {
  if (!comp.tiene_data) return null;
  return variacionPct(cur, comp.ventas);
}

// Un delta de < 1% absoluto es ruido — lo tratamos como "≈0%" sin signo ni
// color. Evita flechas verde/rojo engañosas cuando el cambio es despreciable.
function isDeltaNegligible(delta: number | null): boolean {
  return delta != null && Math.abs(delta) < 0.01;
}

function deltaTone(delta: number | null): string {
  if (delta == null) return "text-gray-500";
  if (isDeltaNegligible(delta)) return "text-gray-500";
  if (delta > 0.05)  return "text-emerald-700";
  if (delta < -0.05) return "text-red-700";
  return "text-gray-500";
}

// Hora 0-23 → etiqueta corta para el eje X ("9a", "12p", "4p").
function horaLabelShort(h: number): string {
  const period = h < 12 ? "a" : "p";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
}

// Hora pico 0-23 → rango legible ("4–5 pm", cruce de meridiano "11 pm–12 am").
function horaPicoLabel(h: number): string {
  const end = (h + 1) % 24;
  const hr = (x: number) => (x % 12 === 0 ? 12 : x % 12);
  const per = (x: number) => (x < 12 ? "am" : "pm");
  return per(h) === per(end)
    ? `${hr(h)}–${hr(end)} ${per(h)}`
    : `${hr(h)} ${per(h)}–${hr(end)} ${per(end)}`;
}

// ── Helpers del Panorama del año (movidos desde el viejo OverviewSubtab) ──────
function parseIsoDateOverview(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// "Ene–May 2026 · ajustado al día de corte (9 may)" / "Ene–Dic 2025" / "Ene–<mes> 2026"
function buildRetailYtdSub(meses: RetailMonthly[], year: number, isClosedYear: boolean): string {
  const partial = meses.find((m) => m.es_periodo_parcial);
  if (isClosedYear) return `Ene–Dic ${year}`;
  let lastMes = 0;
  meses.forEach((m, i) => { if (m.tickets > 0 || m.ventas > 0) lastMes = i + 1; });
  const rangeLabel = lastMes > 0 ? `Ene–${MONTHS[lastMes - 1]} ${year}` : `${year}`;
  if (partial?.fecha_corte) {
    const d = parseIsoDateOverview(partial.fecha_corte);
    const mesShort = MONTHS[d.getMonth()].toLowerCase();
    return `${rangeLabel} · ajustado al día de corte (${d.getDate()} ${mesShort})`;
  }
  return rangeLabel;
}

// Sub-label del margen TIENDA COMPLETA. "▲ +3.0 pts vs 2025" cuando hay margen
// del año anterior. Chequeo estricto por si JSON/Next.js coacciona null→0.
function buildMargenSub(margen: number | null, margenPrev: number | null, prevYear: number): string {
  const mOk = typeof margen === "number" && Number.isFinite(margen);
  if (!mOk) return "Sin costo disponible";
  const pOk = typeof margenPrev === "number" && Number.isFinite(margenPrev);
  if (!pOk) return "Retail + mayoreo";
  const deltaPts = ((margen as number) - (margenPrev as number)) * 100;
  if (Math.abs(deltaPts) < 0.05) return `Sin cambio vs ${prevYear}`;
  const sign = deltaPts >= 0 ? "▲ +" : "▼ ";
  return `${sign}${Math.abs(deltaPts).toFixed(1)} pts vs ${prevYear}`;
}

function fmtMargen(margen: number | null): string {
  return typeof margen === "number" && Number.isFinite(margen)
    ? `${(margen * 100).toFixed(0)}%`
    : "—";
}

function deltaToneCierre(d: number | null): string {
  if (d == null) return "text-gray-400";
  return d > 0.001 ? "text-emerald-600" : d < -0.001 ? "text-red-600" : "text-gray-500";
}
function deltaStrCierre(d: number | null): string {
  if (d == null) return "—";
  return `${d >= 0 ? "▲ +" : "▼ "}${Math.abs(d * 100).toFixed(0)}%`;
}

function doyOf(fecha: string): number {
  const d = new Date(fecha + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86400000) + 1;
}
function monthOf(fecha: string): number {
  return Number(fecha.slice(5, 7));
}

// Une las dos series diarias por día-del-año. cur/prev = ACUMULADO (no el día).
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


export function MultifashionResumenView({
  overview, selectedYear, isClosedYear, mes, syncTick = 0,
}: MultifashionResumenViewProps) {
  const year = selectedYear;
  const prevYear = year - 1;
  const [data, setData] = useState<DetalleMensualResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"mes" | "anio">("mes");
  const [panoramaOpen, setPanoramaOpen] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/multifashion/detalle-mensual?year=${year}&mes=${mes}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<DetalleMensualResp>;
      })
      .then(setData)
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.error("[multifashion-resumen] fetch failed", err);
        setError(err instanceof Error ? err.message : "error inesperado");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // syncTick: lo incrementa el shell tras un "Actualizar ahora" → re-pide el
    // detalle del mismo year/mes con la data recién sincronizada.
  }, [year, mes, syncTick]);

  // ── Panorama del año (prop overview, siempre disponible) ──────────────────
  const serieAct = overview.serieActual;
  const seriePrev = overview.seriePrevio;
  const cierreActual = serieAct.dias.length ? serieAct.dias[serieAct.dias.length - 1].acumulado : 0;
  // RETAIL PURO (25-jul-2026). Antes el Panorama sumaba el mayoreo a la
  // proyección y al cierre ("tienda completa"). Ahora Multifashion mide SOLO la
  // tienda: proyección, cierre y ventas del año van sin mayoreo, y el mayoreo se
  // declara aparte con la nota "no incluye $X de mayoreo · …".
  const mayActualYear = overview.wholesale.ytdVentas;
  const proyRetail = overview.proyeccionCierre.proyeccion ?? 0;
  const cierrePrevRetail = overview.proyeccionCierre.cierre_prev;
  const deltaCierreRetail = variacionPct(proyRetail, cierrePrevRetail);
  // Nota YTD del año: monto, cantidad de facturas y cliente representativo salen
  // del bloque wholesale del overview (mismo bucket que la fila de Ventas).
  const notaMayoreoAnio = buildNotaMayoreo({
    incluido: false,
    monto: mayActualYear,
    clientesCount: overview.wholesale.totalClientes,
    clienteNombre: overview.wholesale.topClienteName,
    facturas: overview.wholesale.ytdTickets,
  });
  const cumChart = useMemo(() => buildCumulativeChart(serieAct, seriePrev), [serieAct, seriePrev]);
  const mesMapAct = useMemo(() => new Map<number, MultifashionSerieMes>(serieAct.meses.map((m) => [m.mes, m])), [serieAct]);
  const mesMapPrev = useMemo(() => new Map<number, MultifashionSerieMes>(seriePrev.meses.map((m) => [m.mes, m])), [seriePrev]);
  const retailYtdSub = buildRetailYtdSub(overview.retail.meses, year, isClosedYear);
  const margenSub = buildMargenSub(overview.total.margen, overview.total.margenPrev, prevYear);
  const ytdSuffix = isClosedYear ? String(year) : "YTD";

  return (
    <div className={cn("space-y-5", loading && data && "opacity-60 pointer-events-none transition-opacity")}>
      {/* La card de identidad (ícono + nombre de la tienda + pill de sync +
          "Actualizar ahora") se eliminó en la limpieza de jul-2026: el nombre
          comercial y esos dos controles viven ahora en el header de la página
          (MultifashionShell), sin repetir el bloque en cada visita al tab. */}

      {error && (
        <Card className="rounded-md border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900">
          No se pudo cargar el detalle del mes: {error}
        </Card>
      )}

      {loading && !data && (
        <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-gray-500">
          Cargando {MESES_FULL[mes - 1]} {year}…
        </Card>
      )}

      {/* 2-4. Titular del mes → gráfico Mes/Año → banda de 3 cards. */}
      {data && (
        <>
          <Titular data={data} year={year} />
          {/* PANORAMA DEL AÑO — colapsable, debajo del titular y antes del gráfico. */}
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setPanoramaOpen((o) => !o)}
              aria-expanded={panoramaOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
            >
              <span className="font-display text-sm font-semibold text-gray-950">
                Panorama del año {year}
              </span>
              <span className="flex items-center gap-2 text-xs text-gray-500">
                {panoramaOpen ? "Ocultar" : "Ver"}
                <ChevronDown className={cn("h-4 w-4 transition-transform", panoramaOpen && "rotate-180")} />
              </span>
            </button>
            {panoramaOpen && (
              <div className="border-t border-gray-200 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <MiniKpi
                    label={`VENTAS ${ytdSuffix}`}
                    value={fmtMoney(overview.retail.ytdVentas)}
                    sub={
                      <>
                        {retailYtdSub}
                        {notaMayoreoAnio && (
                          <span className="block text-gray-500">{notaMayoreoAnio.texto}</span>
                        )}
                      </>
                    }
                  />
                  {overview.proyeccionCierre.tiene_proyeccion ? (
                    <MiniKpi
                      label={`PROYECCIÓN CIERRE ${year}`}
                      value={fmtMoney(proyRetail)}
                      sub={
                        <>
                          <span className={deltaToneCierre(deltaCierreRetail)}>
                            {deltaStrCierre(deltaCierreRetail)}{" "}
                            <span className="text-gray-500">vs cierre {prevYear}</span>
                          </span>
                          {notaMayoreoAnio && (
                            <span className="block text-gray-500">{notaMayoreoAnio.texto}</span>
                          )}
                        </>
                      }
                    />
                  ) : (
                    <MiniKpi
                      label={`CIERRE ${year}`}
                      value={fmtMoney(cierreActual)}
                      sub={
                        <>
                          acumulado del año
                          {notaMayoreoAnio && (
                            <span className="block text-gray-500">{notaMayoreoAnio.texto}</span>
                          )}
                        </>
                      }
                    />
                  )}
                  <MiniKpi label="MARGEN BRUTO · TIENDA" value={fmtMargen(overview.total.margen)} sub={margenSub} />
                </div>
              </div>
            )}
          </div>
          <ChartMesAnioMount
            chartView={chartView}
            setChartView={setChartView}
            cumChart={cumChart}
            mesMapAct={mesMapAct}
            mesMapPrev={mesMapPrev}
            year={year}
            prevYear={prevYear}
            data={data}
          />
          <ComparativoInteranualCard
            meses={overview.retail.meses}
            year={year}
            diaActual={data.dia_actual}
          />
          <BandCards data={data} />
        </>
      )}
    </div>
  );
}

// 2. Titular del mes: RETAIL PURO (la tienda) + 2 comparativos con monto +
// línea de tickets/ticket promedio/proyección. El mayoreo del mes (venta
// intercompañía / Frontera facturada por la caja) NO entra al número y se
// declara debajo con "no incluye $X de mayoreo · …".
function Titular({ data, year }: { data: DetalleMensualResp; year: number }) {
  const { totales, mes_anterior, yoy, mes_label, is_mes_actual } = data;
  const notaMayoreo = buildNotaMayoreo({
    incluido: false,
    monto: totales.mayoreo ?? 0,
    clientes: data.mayoreo_clientes,
    clienteNombre: data.mayoreo_cliente,
    facturas: data.mayoreo_facturas,
  });
  const deltaMoM = calcDeltaPct(totales.ventas, mes_anterior);
  const deltaYoy = calcDeltaPct(totales.ventas, yoy);

  const headerTitle = is_mes_actual
    ? `${mes_label} ${year} · al día ${data.dia_actual}`
    : `${mes_label} ${year}`;

  return (
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[200px]">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Ventas del mes · {headerTitle}
            </p>
            <p className="mt-1 font-mono text-3xl font-semibold leading-tight tabular-nums text-gray-950">
              {fmtMoney(totales.ventas)}
            </p>
            {notaMayoreo && (
              <>
                <p className="mt-1 text-xs text-gray-500">{notaMayoreo.texto}</p>
                {notaMayoreo.detalle && (
                  <p className="mt-0.5 text-xs text-gray-400">{notaMayoreo.detalle}</p>
                )}
              </>
            )}
          </div>
          <div className="flex gap-6">
            {/* El "(al día N)" salió de los dos labels: el título de la card ya
                dice "· al día N" y aplica a los dos comparativos. */}
            <ComparativoStat label="vs mes anterior" delta={deltaMoM} comp={mes_anterior} />
            <ComparativoStat label={`vs ${MESES_SHORT[data.mes - 1]} ${year - 1}`} delta={deltaYoy} comp={yoy} />
          </div>
        </div>
        {/* Línea inferior: tickets retail · ticket promedio · proyección/margen */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-gray-100 pt-3 font-mono text-xs tabular-nums text-gray-600">
          <span>{totales.n_tickets.toLocaleString()} tickets retail</span>
          <span>ticket promedio ${totales.ticket_promedio.toFixed(2)}</span>
          {is_mes_actual && totales.proyeccion_cierre != null ? (
            <span>proyección cierre {fmtMoney(totales.proyeccion_cierre)}</span>
          ) : typeof totales.margen === "number" && Number.isFinite(totales.margen) ? (
            <span>margen tienda {(totales.margen * 100).toFixed(0)}%</span>
          ) : null}
        </div>
      </Card>
  );
}

// 3b. Comparativo interanual mes a mes (RETAIL, mismo corte) — debajo del gráfico.
// El monto del año anterior se DERIVA del vs2025 full-precision (ventas/(1+vs2025)),
// que cuadra al centavo con switch_facturas; NO usa la serie blend (ventas_raw) para
// no mezclar fuentes. El mes en curso se compara al mismo día (parcial), consistente
// con el % mostrado. Es retail por la decisión híbrida (mayoreo no entra a comparativos).
function ComparativoInteranualCard({
  meses, year, diaActual,
}: {
  meses: RetailMonthly[];
  year: number;
  diaActual: number;
}) {
  const prevYear = year - 1;
  const filas = meses
    .map((m, i) => {
      // La base del año anterior se despeja del ratio ANTES de aplicarle la
      // regla: mayo 2024 vale $0,01 y ese centavo se sigue mostrando en la
      // columna del año previo — puesto al lado de "n/a" explica por qué no
      // hay porcentaje. Lo que se calla es el "+363024750%", no el dato.
      const vPrev = baseDesdeRatio(m.ventas, m.vs2025);
      const pct = variacionPct(m.ventas, vPrev);
      return {
        label: MESES_SHORT[i],
        parcial: !!m.es_periodo_parcial,
        v: m.ventas,
        vPrev,
        pct,
        abs: vPrev != null ? m.ventas - vPrev : null,
        tieneData: m.ventas > 0 || m.tickets > 0,
      };
    })
    .filter((f) => f.tieneData);

  if (filas.length === 0) return null;

  // YTD a mismo corte: solo meses con comparación del año anterior disponible.
  // El criterio NO cambió (sigue siendo "hay base"): los montos del YTD tienen
  // que quedar exactamente iguales — acá solo se arregla el %.
  const comp = filas.filter((f) => f.vPrev != null);
  const tot = comp.reduce((s, f) => s + f.v, 0);
  const totPrev = comp.reduce((s, f) => s + (f.vPrev ?? 0), 0);
  const totPct = variacionPct(tot, totPrev);

  const GRID = "grid grid-cols-[2.8rem_minmax(0,1fr)_minmax(0,1fr)_6rem] items-center gap-2 px-4";
  const deltaTone = (n: number | null) =>
    n == null ? "text-gray-400" : n >= 0 ? "text-emerald-600" : "text-rose-600";
  const fmtPct = (p: number | null) => fmtVariacionPct(p, true, 1);
  const fmtAbs = (n: number | null) => (n == null ? "" : `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 px-4 py-3">
        <h4 className="font-display text-sm font-semibold text-gray-950">Mes a mes vs {prevYear}</h4>
        <p className="mt-0.5 text-xs text-gray-400">
          Retail (sin mayoreo) · mismo corte
        </p>
      </div>
      <div className={cn(GRID, "border-b border-gray-200 bg-gray-50 py-2 text-xs font-medium uppercase tracking-[0.04em] text-gray-500")}>
        <span>Mes</span>
        <span className="text-right">{year}</span>
        <span className="text-right">{prevYear}</span>
        <span className="text-right">Δ</span>
      </div>
      {filas.map((f) => (
        <div key={f.label} className={cn(GRID, "border-t border-gray-100 py-2 text-sm")}>
          <span className="capitalize text-gray-700">
            {f.label}
            {f.parcial ? <span className="ml-1 text-xs text-gray-400">d{diaActual}</span> : null}
          </span>
          <span className="text-right font-mono tabular-nums text-gray-950">{fmtMoney(f.v)}</span>
          <span className="text-right font-mono tabular-nums text-gray-500">
            {f.vPrev != null ? fmtMoney(f.vPrev) : "—"}
          </span>
          <span className="text-right font-mono tabular-nums leading-tight">
            <span className={cn("font-medium", deltaTone(f.pct))}>{fmtPct(f.pct)}</span>
            {f.abs != null && (
              <span className={cn("block text-xs", deltaTone(f.abs))}>{fmtAbs(f.abs)}</span>
            )}
          </span>
        </div>
      ))}
      <div className={cn(GRID, "border-t border-gray-300 bg-gray-50 py-2 text-sm font-semibold")}>
        <span className="text-gray-700">YTD</span>
        <span className="text-right font-mono tabular-nums text-gray-950">{fmtMoney(tot)}</span>
        <span className="text-right font-mono tabular-nums text-gray-600">{fmtMoney(totPrev)}</span>
        <span className="text-right font-mono tabular-nums leading-tight">
          <span className={cn("font-medium", deltaTone(totPct))}>{fmtPct(totPct)}</span>
          <span className={cn("block text-xs", deltaTone(tot - totPrev))}>{fmtAbs(tot - totPrev)}</span>
        </span>
      </div>
    </Card>
  );
}

// 4. Banda de 3 cards: mejor/peor día · mejor día de semana · hora pico.
function BandCards({ data }: { data: DetalleMensualResp }) {
  const { totales, mejor_dia, peor_dia, heatmap_dia_semana } = data;
  if (totales.n_tickets <= 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <BestWorstDayCard mejor={mejor_dia} peor={peor_dia} />
      <BestDowCard heatmap={heatmap_dia_semana} />
      <HoraPicoCard hora={data.hora_pico ?? null} ventas={data.hora_pico_ventas ?? null} horas={data.horas ?? []} />
    </div>
  );
}

// 3. Gráfico "Ventas día por día" con toggle Mes/Año. Mes = día-por-día (retail
// diario + línea mes anterior). Año = acumulado del año vs año previo (el que
// vivía en Overview). Un solo gráfico con switch.
function ChartMesAnioMount({
  chartView, setChartView, cumChart, mesMapAct, mesMapPrev, year, prevYear, data,
}: {
  chartView: "mes" | "anio";
  setChartView: (v: "mes" | "anio") => void;
  cumChart: CumPoint[];
  mesMapAct: Map<number, MultifashionSerieMes>;
  mesMapPrev: Map<number, MultifashionSerieMes>;
  year: number;
  prevYear: number;
  data: DetalleMensualResp | null;
}) {
  if (!data) return null;
  const { totales, dias, mes_label, is_mes_actual } = data;
  const hasData = totales.n_tickets > 0;
  // Comparación del gráfico = MISMO mes del AÑO ANTERIOR (estacionalidad retail),
  // no el mes previo. Solo se dibuja si el año anterior tiene datos.
  const showPrevLine = data.anio_anterior_tiene_data === true;
  const anioAnterior = data.anio_anterior ?? year - 1;
  const chartData = dias.map((d) => ({
    dia: d.dia,
    ventas: Math.max(0, d.ventas),
    ventas_anio_anterior: showPrevLine ? Math.max(0, d.ventas_anio_anterior ?? 0) : 0,
  }));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="font-display text-sm font-semibold text-gray-950">
          {chartView === "mes" ? "Ventas día por día" : "Ventas acumuladas"}
        </h4>
        <SegmentedToggle
          value={chartView}
          onChange={setChartView}
          options={[{ value: "mes", label: "Mes" }, { value: "anio", label: "Año" }]}
        />
      </div>
      {chartView === "mes" ? (
        <Card className="overflow-hidden p-3">
          {hasData ? (
            <>
              <VentasDiariasChart
                chartData={chartData}
                isMesActual={is_mes_actual}
                diaActual={data.dia_actual}
                showPrevLine={showPrevLine}
                mesLabel={mes_label}
                year={year}
              />
              <p className="mt-2 px-1 text-xs text-gray-500">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-teal-700" />
                {mes_label} {year}
                {showPrevLine ? (
                  <>
                    {" · "}
                    <span className="mr-1 inline-block h-[2px] w-2 bg-gray-400" />
                    Mismo mes {anioAnterior}
                  </>
                ) : (
                  <span className="text-gray-400"> · sin datos de {anioAnterior} para comparar</span>
                )}
              </p>
            </>
          ) : (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
              <Info className="h-6 w-6 text-gray-400" strokeWidth={1.5} />
              <p className="text-sm text-gray-500">No hay datos para este período</p>
              <p className="text-xs text-gray-400">{mes_label} {year} no registra ventas retail.</p>
            </div>
          )}
        </Card>
      ) : (
        <CumulativeChartCard
          chart={cumChart}
          mesMapAct={mesMapAct}
          mesMapPrev={mesMapPrev}
          year={year}
          prevYear={prevYear}
        />
      )}
    </section>
  );
}

// Toggle segmentado compacto (Mes / Año).
function SegmentedToggle<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-md bg-gray-100 p-0.5" role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              // 26px de alto era el target más chico de la vista. min-h-[44px]
              // con la caja gris de p-0.5 alrededor → 45px reales al tacto.
              "flex min-h-[44px] items-center justify-center rounded px-3 text-xs font-medium transition",
              active ? "bg-white text-gray-950 shadow-sm" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Comparativo con % grande + monto del período comparado debajo.
function ComparativoStat({
  label, delta, comp,
}: {
  label: string;
  delta: number | null;
  comp: ComparativoBlock;
}) {
  const tone = deltaTone(delta);
  let pct: string;
  if (delta == null) pct = "—";
  else if (isDeltaNegligible(delta)) pct = "≈0%";
  else pct = `${delta >= 0 ? "▲" : "▼"} ${fmtPct(delta)}`;
  const monto = !comp.tiene_data
    ? "sin data"
    : comp.ventas < 100
      ? "base baja"
      : `$${Math.round(comp.ventas).toLocaleString()}`;
  return (
    <div className="text-right">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn("mt-0.5 font-mono text-base font-semibold tabular-nums", tone)}>{pct}</p>
      <p className="font-mono text-xs tabular-nums text-gray-500">{monto}</p>
    </div>
  );
}

// Card combinada mejor / peor día del mes (antes eran 2 cards separadas).
function BestWorstDayCard({
  mejor, peor,
}: {
  mejor: { fecha: string; ventas: number } | null;
  peor: { fecha: string; ventas: number } | null;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Mejor / peor día</p>
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
            <Award className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-base font-medium tabular-nums text-gray-950">
              {mejor ? fmtMoney(mejor.ventas) : "—"}
            </p>
            <p className="text-xs text-gray-500">
              mejor{mejor ? ` · ${formatFechaShort(mejor.fecha)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-100 bg-amber-50 text-amber-700">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-base font-medium tabular-nums text-gray-950">
              {peor ? fmtMoney(peor.ventas) : "—"}
            </p>
            <p className="text-xs text-gray-500">
              peor{peor ? ` · ${formatFechaShort(peor.fecha)}` : ""}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Mini gráfico de barras (CSS, sin recharts) para las cards de patrones. Usa los
// mismos datos que ya alimentan la card (heatmap día-semana / ventas por hora).
function MiniBars({
  data, highlightIdx, tone, showLabels = false,
}: {
  data: { label: string; value: number; full?: string }[];
  highlightIdx: number;
  tone: "teal" | "violet";
  showLabels?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const on = tone === "violet" ? "bg-violet-600" : "bg-teal-700";
  const off = tone === "violet" ? "bg-violet-200" : "bg-teal-200";
  return (
    <div>
      <div className="flex h-12 items-end gap-px">
        {data.map((d, i) => (
          <div key={i} className="flex h-full flex-1 items-end" title={`${d.full ?? d.label}: ${fmtMoney(d.value)}`}>
            <div
              className={cn("w-full rounded-sm", i === highlightIdx ? on : off)}
              style={{ height: `${d.value > 0 ? Math.max(3, (d.value / max) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      {/* Iniciales de día (L M X J V S D) del mini gráfico "Mejor día de la
          semana". Estaban a 8.5px — el texto más chico de toda la app. */}
      {showLabels && (
        <div className="mt-1 flex gap-px">
          {data.map((d, i) => (
            <span key={i} className="flex-1 text-center text-xs leading-tight uppercase text-gray-400">{d.label.slice(0, 1)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Mejor día de la semana (max promedio) + mini gráfico de barras lun→dom.
function BestDowCard({ heatmap }: { heatmap: HeatmapDow[] }) {
  const best = heatmap.reduce<HeatmapDow | null>(
    (acc, h) => (h.ventas_promedio > (acc?.ventas_promedio ?? -1) ? h : acc),
    null,
  );
  // Reordenar lun→dom (dow 1..6, luego 0) para el mini gráfico.
  const bars = [1, 2, 3, 4, 5, 6, 0]
    .map((dow) => heatmap.find((h) => h.dow === dow))
    .filter((h): h is HeatmapDow => !!h)
    .map((h) => ({ label: h.dow_label, value: h.ventas_promedio, full: `${h.dow_label} (promedio)` }));
  const highlightIdx = best ? bars.findIndex((b) => b.label === best.dow_label) : -1;
  const hayData = bars.some((b) => b.value > 0);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-teal-100 bg-teal-50 text-teal-700">
          <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Mejor día de semana</p>
          <p className="mt-0.5 font-display text-base font-semibold text-gray-950">{hayData ? best!.dow_label : "—"}</p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-gray-500">
            {hayData ? `${fmtMoneyCompact(best!.ventas_promedio)} promedio` : "sin data"}
          </p>
        </div>
      </div>
      {hayData && (
        <div className="mt-3">
          <MiniBars data={bars} highlightIdx={highlightIdx} tone="teal" showLabels />
        </div>
      )}
    </Card>
  );
}

// Hora pico del mes (hora Panamá) + mini gráfico de barras por hora del día.
function HoraPicoCard({
  hora, ventas, horas,
}: {
  hora: number | null;
  ventas: number | null;
  horas: HoraRow[];
}) {
  const bars = horas.map((h) => ({ label: String(h.hora), value: h.ventas, full: horaPicoLabel(h.hora) }));
  const highlightIdx = hora != null ? bars.findIndex((b) => Number(b.label) === hora) : -1;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-100 bg-violet-50 text-violet-700">
          <Clock className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Hora pico</p>
          <p className="mt-0.5 font-display text-base font-semibold text-gray-950">
            {hora != null ? horaPicoLabel(hora) : "—"}
          </p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-gray-500">
            {ventas != null ? `${fmtMoneyCompact(ventas)} en la hora` : "sin data"}
          </p>
        </div>
      </div>
      {bars.length > 0 && (
        <div className="mt-3">
          <MiniBars data={bars} highlightIdx={highlightIdx} tone="violet" />
        </div>
      )}
    </Card>
  );
}

function MiniKpi({
  label, value, sub, valueClassName,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="p-3.5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn(
        "mt-1.5 font-mono text-[22px] font-medium leading-tight tabular-nums text-gray-950",
        valueClassName,
      )}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </Card>
  );
}
