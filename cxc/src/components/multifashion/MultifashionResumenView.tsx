"use client";

// Vista unificada de Multifashion — reemplaza los subtabs "Overview" + "Detalle
// mensual" en una sola página con scroll:
//   1) (El nombre de la tienda, el pill de sync y "Actualizar ahora" viven en el
//      header de la página — MultifashionShell; el selector de mes, en
//      MultifashionView.)
//   2) Titular del mes (RETAIL PURO; el mayoreo se declara aparte) + 2 comparativos
//      con monto + línea de tickets/ticket promedio/proyección.
//   3) Gráfico "Ventas día por día" con toggle Mes/Año (Año = acumulado vs prev).
//   4) "Cuándo vende la tienda": UNA sección de 4 líneas, cada una diciendo de
//      qué período habla (ver `src/lib/multifashion/patrones.ts`).
//
// 🩸 EL "PANORAMA DEL AÑO" COLAPSABLE SE RETIRÓ (6-sep-2026). El año no puede
// vivir escondido detrás de un «Ver»: subió a las TARJETAS de arriba, con lo que
// ese desplegable traía (venta del año, proyección de cierre y margen de la
// tienda) puesto en la tarjeta «Año». Nada se perdió; dejó de estar guardado.
//
// NO toca cálculos ni vistas: cada número sale de la MISMA fuente que ya usaban
// Overview (prop `overview`, server → multifashion_mensual_v6) y Detalle mensual
// (endpoint /api/multifashion/detalle-mensual). El titular usa `ventas` (retail)
// (PR #131); los comparativos siguen sobre retail (sus % no cambian).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  Award, AlertTriangle, Info, Clock, CalendarDays,
} from "lucide-react";
import dynamic from "next/dynamic";
import type {
  Multifashion, RetailMonthly, MultifashionSerieAnio, MultifashionSerieMes,
} from "@/components/ventas/types";
import type { CumPoint } from "./CumulativeChartCard";
import { variacionPct, baseDesdeRatio, fmtVariacionPct } from "@/lib/variacion";
import { filaAnio, ROTULO_FILA_ANIO } from "@/lib/multifashion/fila-anio";

// recharts cargado aparte (ssr:false) → fuera del bundle inicial de /multifashion.
const VentasDiariasChart = dynamic(
  () => import("./DetalleMensualCharts").then((m) => m.VentasDiariasChart),
  { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded bg-gray-100" /> },
);
// 🩸 `HorasChart` se importaba acá con next/dynamic y NUNCA se renderizaba
// (auditoría del 5-sep-2026). Se retiró el import muerto; el componente sigue
// existiendo en `DetalleMensualCharts` por si alguna vez se dibuja.
const CumulativeChartCard = dynamic(
  () => import("./CumulativeChartCard").then((m) => m.CumulativeChartCard),
  { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded-lg bg-gray-100" /> },
);

import { fmtMoney, fmtMoneyCompact, fmtPct, MONTHS } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";
import { buildNotaMayoreo } from "@/lib/ventas/mayoreo";
import { ROTULO_ESTE_MES, ROTULO_VENTANA } from "@/lib/multifashion/patrones";

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
  /** Sobre CUÁNTOS días está hecha la proyección (`dia_corte` de la RPC). */
  proyeccion_dias?: number | null;
  proyeccion_dias_mes?: number | null;
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
  /** Día más fuerte y hora pico sobre los últimos N meses. Aditivo. */
  patrones?: {
    dow: HeatmapDow[];
    mejorDow: HeatmapDow | null;
    horas: HoraRow[];
    horaPico: number | null;
    horaPicoVentas: number | null;
    mesesUsados: number;
    n_meses: number;
    desde: string;
    hasta: string;
  };
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
          {/* Las CUATRO tarjetas de arriba. El año ya no está escondido detrás
              de un desplegable: es una de ellas. */}
          <TarjetasDelMes
            data={data}
            year={year}
            overview={overview}
            retailYtdSub={retailYtdSub}
            margenSub={margenSub}
            ytdSuffix={ytdSuffix}
            proyRetail={proyRetail}
            deltaCierreRetail={deltaCierreRetail}
            cierreActual={cierreActual}
            notaMayoreoAnio={notaMayoreoAnio?.texto ?? null}
          />
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
            totalAnio={overview.retail.ytdVentas}
          />
          <CuandoVendeLaTienda data={data} />
        </>
      )}
    </div>
  );
}

// 2. LAS CUATRO TARJETAS DE ARRIBA (6-sep-2026).
//
//    Ventas del mes · Tickets · Cierra en · Año <Y>
//
// 🔴 EL AÑO SUBIÓ ACÁ. Vivía en dos lugares peores: la última fila de la tabla
// «Mes a mes» (rotulada «YTD», una sigla) y un desplegable «Panorama del año»
// que había que abrir. Ahora es una tarjeta, con lo que ese desplegable traía:
// la venta del año, la proyección de cierre contra el año pasado, el margen de
// la tienda y la nota de mayoreo.
//
// 🔴 «CIERRA EN» DICE SOBRE CUÁNTOS DÍAS ESTÁ HECHA. Medido el 6-sep-2026:
// $65.202,51 = $10.867,09 ÷ 5 × 30, al centavo. El número NO está inflado —con
// la forma real de septiembre de 2025 daría $74.077— pero leerlo sin saber que
// sale de CINCO días es leer otra cosa. Es la misma regla que el módulo ya
// aplica en Metas (por debajo del 5% de temporada no proyecta y lo dice).
// ⚠️ La FÓRMULA no se tocó (`proyeccion_mensual_retail_v1`, método B).
//
// El mes es RETAIL PURO: el mayoreo no entra al número y se declara debajo.
function TarjetasDelMes({
  data, year, overview, retailYtdSub, margenSub, ytdSuffix,
  proyRetail, deltaCierreRetail, cierreActual, notaMayoreoAnio,
}: {
  data: DetalleMensualResp;
  year: number;
  overview: Multifashion;
  retailYtdSub: string;
  margenSub: string;
  ytdSuffix: string;
  proyRetail: number;
  deltaCierreRetail: number | null;
  cierreActual: number;
  notaMayoreoAnio: string | null;
}) {
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

  const hayProyeccion = is_mes_actual && totales.proyeccion_cierre != null;
  const dias = totales.proyeccion_dias ?? null;
  const hayMargen = typeof totales.margen === "number" && Number.isFinite(totales.margen);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1 · Ventas del mes, con sus dos comparativos. */}
      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Ventas del mes
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold leading-tight tabular-nums text-gray-950">
          {fmtMoney(totales.ventas)}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{headerTitle}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-2">
          <ComparativoStat label="vs mes anterior" delta={deltaMoM} comp={mes_anterior} />
          <ComparativoStat label={`vs ${MESES_SHORT[data.mes - 1]} ${year - 1}`} delta={deltaYoy} comp={yoy} />
        </div>
        {notaMayoreo && (
          <>
            <p className="mt-2 text-xs text-gray-500">{notaMayoreo.texto}</p>
            {notaMayoreo.detalle && (
              <p className="mt-0.5 text-xs text-gray-400">{notaMayoreo.detalle}</p>
            )}
          </>
        )}
      </Card>

      {/* 2 · Tickets. */}
      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Tickets</p>
        <p className="mt-1 font-mono text-2xl font-semibold leading-tight tabular-nums text-gray-950">
          {totales.n_tickets.toLocaleString()}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          ticket promedio <span className="font-mono tabular-nums">${totales.ticket_promedio.toFixed(2)}</span>
        </p>
      </Card>

      {/* 3 · Cierra en (mes en curso) / Margen tienda (mes cerrado). */}
      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {hayProyeccion ? "Cierra en" : "Margen tienda"}
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold leading-tight tabular-nums text-gray-950">
          {hayProyeccion
            ? fmtMoney(totales.proyeccion_cierre as number)
            : hayMargen
              ? `${((totales.margen as number) * 100).toFixed(0)}%`
              : "—"}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {hayProyeccion
            ? (dias != null && dias > 0
                ? `con ${dias} ${dias === 1 ? "día" : "días"}`
                : "proyección del mes")
            : hayMargen
              ? "del mes, tienda completa"
              : "sin costo disponible"}
        </p>
      </Card>

      {/* 4 · El AÑO. Lo que traía el «Panorama del año», sin esconderlo. */}
      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Año {year}</p>
        <p className="mt-1 font-mono text-2xl font-semibold leading-tight tabular-nums text-gray-950">
          {fmtMoney(overview.retail.ytdVentas)}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{retailYtdSub}</p>
        <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-xs text-gray-500">
          {overview.proyeccionCierre.tiene_proyeccion ? (
            <p>
              cierra en <span className="font-mono tabular-nums text-gray-700">{fmtMoney(proyRetail)}</span>{" "}
              <span className={deltaToneCierre(deltaCierreRetail)}>{deltaStrCierre(deltaCierreRetail)}</span>{" "}
              vs {year - 1}
            </p>
          ) : (
            <p>
              acumulado <span className="font-mono tabular-nums text-gray-700">{fmtMoney(cierreActual)}</span>
              {ytdSuffix === "YTD" ? "" : ` de ${ytdSuffix}`}
            </p>
          )}
          <p>
            margen tienda <span className="font-mono tabular-nums text-gray-700">{fmtMargen(overview.total.margen)}</span>
            {" · "}{margenSub}
          </p>
          {notaMayoreoAnio && <p>{notaMayoreoAnio}</p>}
        </div>
      </Card>
    </div>
  );
}

// 3b. Comparativo interanual mes a mes (RETAIL, mismo corte) — debajo del gráfico.
// El monto del año anterior se DERIVA del vs2025 full-precision (ventas/(1+vs2025)),
// que cuadra al centavo con switch_facturas; NO usa la serie blend (ventas_raw) para
// no mezclar fuentes. El mes en curso se compara al mismo día (parcial), consistente
// con el % mostrado. Es retail por la decisión híbrida (mayoreo no entra a comparativos).
//
// 🩸 EL AÑO SE DECÍA DOS VECES CON NÚMEROS DISTINTOS (hasta el 11-sep-2026). La
// tarjeta «Año» dice `overview.retail.ytdVentas` (los 12 meses) y la fila del
// pie de esta tabla sumaba SOLO los meses que tienen base del año anterior:
// medido contra producción, 2025 daba $652.420,19 arriba y $509.291,64 abajo
// (ene–abr 2025 no tienen 2024). Ahora el total de la fila ES el de la tarjeta
// (`totalAnio`), la fila se llama «Año» (la sigla YTD se fue) y el Δ sigue
// midiéndose sobre los meses comparables — con una línea que dice sobre
// cuántos, cuando no son todos. Regla en `lib/multifashion/fila-anio.ts`.
function ComparativoInteranualCard({
  meses, year, diaActual, totalAnio,
}: {
  meses: RetailMonthly[];
  year: number;
  diaActual: number;
  /** El MISMO número de la tarjeta «Año» (`overview.retail.ytdVentas`). */
  totalAnio: number;
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

  // La fila del año: el total es el de la TARJETA; el Δ, sobre los meses que
  // tienen base del año anterior (ver `filaAnio`).
  const anio = filaAnio({
    totalAnio,
    meses: filas.map((f) => ({ label: f.label, v: f.v, vPrev: f.vPrev })),
    prevYear,
  });

  // 🩸 POR QUÉ SON DOS REPARTOS Y NO UNO (30-jul-2026). Daniel, sobre el iPhone:
  // *"lo pegado que estan los numeros"*. Medido en el navegador a 390 px, el aire
  // entre la cifra del año actual y la del anterior era de **−4,8 px**: no es que
  // estuvieran apretadas, es que se SUPERPONÍAN. La causa no era el relleno ni el
  // interletrado: con 4 columnas en una sola línea, a cada monto le tocaba una
  // pista de 79,6 px cuando el texto pide 92,4 — cada uno desbordaba 12,8 px y
  // eso se comía los 8 px del `gap` (8 − 12,8 = −4,8). Las dos columnas estaban
  // COMPITIENDO por un ancho que no alcanzaba.
  //
  // La cuenta a 390 px: quedan 326 px útiles adentro de la tarjeta. Mes (44,8) +
  // dos montos (92,4 × 2) + Δ (96) + 3 separaciones = 350,4. **Faltan 24,4 px**,
  // así que las 4 columnas en una línea NO entran — y bajar la letra (piso de 12
  // px, decidido en el #301) o abreviar los montos está prohibido: esta pantalla
  // es de plata.
  //
  // Solución: en celular la fila usa DOS líneas. Arriba Mes + los dos montos;
  // abajo el Δ, alineado a la derecha. Los montos van en columnas `auto`, que en
  // un grid valen lo mismo para TODAS las filas (el ancho del contenido más
  // largo, el YTD), así que siguen alineados de arriba abajo y el aire entre
  // ellos es EXACTAMENTE el `gap-x-4` = 16 px. La columna Mes se queda con el
  // sobrante.
  //
  // Desde `md` no cambia NADA: vuelve el reparto de 4 columnas en una línea, que
  // ahí tiene aire de sobra (93 px a 834, 396 px a 1440). El corte es `md` y no
  // `sm` porque a 640 px la tabla quedaría con 8 px de aire total — otra vez al
  // borde de tocarse.
  const GRID = [
    "grid items-center px-4",
    "grid-cols-[minmax(2.8rem,1fr)_auto_auto] gap-x-4 gap-y-1",
    "md:grid-cols-[2.8rem_minmax(0,1fr)_minmax(0,1fr)_6rem] md:gap-x-2 md:gap-y-0",
  ].join(" ");
  // El Δ: segunda línea en celular (ocupando el ancho de los dos montos), su
  // propia columna desde `md`.
  const CELDA_DELTA = "col-start-2 col-span-2 md:col-start-4 md:col-span-1";
  const deltaTone = (n: number | null) =>
    n == null ? "text-gray-400" : n >= 0 ? "text-emerald-600" : "text-rose-600";
  const fmtPct = (p: number | null) => fmtVariacionPct(p, true, 1);
  const fmtAbs = (n: number | null) => (n == null ? "" : `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`);

  return (
    <Card data-tabla="mes-a-mes" className="overflow-hidden p-0">
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
        {/* En celular el Δ vive en la segunda línea de cada fila, así que un
            encabezado suelto ahí sobra: el valor ya se explica solo (lleva signo,
            % y $). Desde `md` recupera su columna. */}
        <span className={cn("hidden text-right md:block", CELDA_DELTA)}>Δ</span>
      </div>
      {filas.map((f) => (
        <div key={f.label} data-fila="mes" className={cn(GRID, "border-t border-gray-100 py-2 text-sm")}>
          <span data-col="mes" className="capitalize text-gray-700">
            {f.label}
            {f.parcial ? <span className="ml-1 text-xs text-gray-400">d{diaActual}</span> : null}
          </span>
          <span data-col="actual" className="text-right font-mono tabular-nums text-gray-950">{fmtMoney(f.v)}</span>
          <span data-col="previo" className="text-right font-mono tabular-nums text-gray-500">
            {f.vPrev != null ? fmtMoney(f.vPrev) : "—"}
          </span>
          {/* En celular los dos datos del Δ van uno al lado del otro en la
              segunda línea (hay ancho de sobra); desde `md` se apilan como
              siempre dentro de su columna de 6rem. */}
          <span data-col="delta" className={cn(CELDA_DELTA, "flex items-baseline justify-end gap-2 text-right font-mono tabular-nums leading-tight md:block md:gap-0")}>
            <span className={cn("font-medium", deltaTone(f.pct))}>{fmtPct(f.pct)}</span>
            {f.abs != null && (
              <span className={cn("text-xs md:block", deltaTone(f.abs))}>{fmtAbs(f.abs)}</span>
            )}
          </span>
        </div>
      ))}
      <div data-fila="mes" className={cn(GRID, "border-t border-gray-300 bg-gray-50 py-2 text-sm font-semibold")}>
        <span data-col="mes" className="text-gray-700">{ROTULO_FILA_ANIO}</span>
        <span data-col="actual" className="text-right font-mono tabular-nums text-gray-950">{fmtMoney(anio.total)}</span>
        <span data-col="previo" className="text-right font-mono tabular-nums text-gray-600">
          {anio.totalPrev != null ? fmtMoney(anio.totalPrev) : "—"}
        </span>
        <span data-col="delta" className={cn(CELDA_DELTA, "flex items-baseline justify-end gap-2 text-right font-mono tabular-nums leading-tight md:block md:gap-0")}>
          <span className={cn("font-medium", deltaTone(anio.pct))}>{fmtPct(anio.pct)}</span>
          {anio.abs != null && (
            <span className={cn("text-xs md:block", deltaTone(anio.abs))}>{fmtAbs(anio.abs)}</span>
          )}
        </span>
      </div>
      {anio.nota && (
        <p data-nota="anio" className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">{anio.nota}</p>
      )}
    </Card>
  );
}

// 4. «CUÁNDO VENDE LA TIENDA» — UNA sección, no tres tarjetas (6-sep-2026).
//
// Daniel: *«¿lo podemos juntar para que se sienta una sola sección?»* → sí. Y
// con eso se arregla el defecto de fondo, que era peor que el desorden:
//
// 🩸 El 6-sep-2026, con septiembre corriendo su quinto día, la pantalla decía
//    «mejor día de semana: **Sáb, $3.364 promedio**» y «mejor día del mes:
//    **$3.364,19, el 5 de septiembre**». **Es el mismo número.** Ese «promedio»
//    del sábado era UN SOLO sábado, porque la tarjeta miraba nada más el mes.
//
// Ahora «Día más fuerte» y «Hora pico» miran los ÚLTIMOS 3 MESES —donde un
// sábado se repite diez veces— y «Mejor / peor día» sigue siendo del mes, que
// ahí sí es la pregunta. 🔑 Y **cada línea dice de qué período habla**: eso es lo
// que faltaba y lo que hacía que un sábado pareciera un patrón.
function CuandoVendeLaTienda({ data }: { data: DetalleMensualResp }) {
  const { totales, mejor_dia, peor_dia, heatmap_dia_semana, patrones } = data;
  if (totales.n_tickets <= 0) return null;

  // Sin `patrones` (una respuesta vieja en caché, o una lectura que falló) se
  // cae al mes, que es lo que había antes — y el rótulo lo dice, no miente.
  const hayVentana = patrones != null && patrones.mesesUsados > 0;
  const dow = hayVentana ? patrones!.dow : heatmap_dia_semana;
  const mejorDow = hayVentana
    ? patrones!.mejorDow
    : heatmap_dia_semana.reduce<HeatmapDow | null>(
        (acc, h) => (h.ventas_promedio > (acc?.ventas_promedio ?? -1) ? h : acc),
        null,
      );
  const horas = hayVentana ? patrones!.horas : (data.horas ?? []);
  const horaPico = hayVentana ? patrones!.horaPico : (data.hora_pico ?? null);
  const horaVentas = hayVentana ? patrones!.horaPicoVentas : (data.hora_pico_ventas ?? null);
  const rotuloVentana = hayVentana ? ROTULO_VENTANA : ROTULO_ESTE_MES;

  // Reordenar lun→dom (dow 1..6, luego 0) para el mini gráfico.
  const barsDow = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => dow.find((h) => h.dow === d))
    .filter((h): h is HeatmapDow => !!h)
    .map((h) => ({ label: h.dow_label, value: h.ventas_promedio, full: `${h.dow_label} (promedio)` }));
  const idxDow = mejorDow ? barsDow.findIndex((b) => b.label === mejorDow.dow_label) : -1;
  const hayDow = barsDow.some((b) => b.value > 0);

  const barsHora = horas.map((h) => ({ label: String(h.hora), value: h.ventas, full: horaPicoLabel(h.hora) }));
  const idxHora = horaPico != null ? barsHora.findIndex((b) => Number(b.label) === horaPico) : -1;

  return (
    <Card className="p-4">
      <h4 className="font-display text-sm font-semibold text-gray-950">Cuándo vende la tienda</h4>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Las dos del MES. */}
        <div className="space-y-2.5">
          <LineaPatron
            icono={<Award className="h-4 w-4" strokeWidth={1.75} />}
            tono="emerald"
            titulo="Mejor día"
            valor={mejor_dia ? fmtMoney(mejor_dia.ventas) : "—"}
            detalle={mejor_dia ? formatFechaShort(mejor_dia.fecha) : null}
            periodo={ROTULO_ESTE_MES}
          />
          <LineaPatron
            icono={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
            tono="amber"
            titulo="Peor día"
            valor={peor_dia ? fmtMoney(peor_dia.ventas) : "—"}
            detalle={peor_dia ? formatFechaShort(peor_dia.fecha) : null}
            periodo={ROTULO_ESTE_MES}
          />
        </div>

        {/* Las dos del HÁBITO. */}
        <div className="space-y-2.5">
          <LineaPatron
            icono={<CalendarDays className="h-4 w-4" strokeWidth={1.75} />}
            tono="teal"
            titulo="Día más fuerte"
            valor={hayDow && mejorDow ? mejorDow.dow_label : "—"}
            detalle={hayDow && mejorDow ? `${fmtMoneyCompact(mejorDow.ventas_promedio)} promedio` : "sin data"}
            periodo={rotuloVentana}
            grafico={hayDow ? <MiniBars data={barsDow} highlightIdx={idxDow} tone="teal" showLabels /> : null}
          />
          <LineaPatron
            icono={<Clock className="h-4 w-4" strokeWidth={1.75} />}
            tono="violet"
            titulo="Hora pico"
            valor={horaPico != null ? horaPicoLabel(horaPico) : "—"}
            detalle={horaVentas != null ? `${fmtMoneyCompact(horaVentas)} en la hora` : "sin data"}
            periodo={rotuloVentana}
            grafico={barsHora.length > 0 ? <MiniBars data={barsHora} highlightIdx={idxHora} tone="violet" /> : null}
          />
        </div>
      </div>
    </Card>
  );
}

const TONO_PATRON: Record<string, string> = {
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  teal: "border-teal-100 bg-teal-50 text-teal-700",
  violet: "border-violet-100 bg-violet-50 text-violet-700",
};

/** Una línea de la sección. 🔑 El período va SIEMPRE, pegado al título. */
function LineaPatron({
  icono, tono, titulo, valor, detalle, periodo, grafico,
}: {
  icono: ReactNode;
  tono: keyof typeof TONO_PATRON;
  titulo: string;
  valor: string;
  detalle: string | null;
  periodo: string;
  grafico?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", TONO_PATRON[tono])}>
          {icono}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500">
            {titulo} <span className="text-gray-400">· {periodo}</span>
          </p>
          <p className="mt-0.5 font-mono text-base font-medium tabular-nums text-gray-950">{valor}</p>
          {detalle && <p className="text-xs text-gray-500">{detalle}</p>}
        </div>
      </div>
      {grafico && <div className="mt-2 pl-[42px]">{grafico}</div>}
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
              {/* Una sola línea: el período ya está dicho en el selector de mes
                  de arriba, así que la segunda decía lo mismo con otras palabras. */}
              <p className="text-sm text-gray-500">{mes_label} {year} no registra ventas retail</p>
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
