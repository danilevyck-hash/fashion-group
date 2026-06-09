"use client";

// Sub-tab "Detalle mensual" de Multifashion. Solo retail (is_wholesale=false).
// Server data: RPC multifashion_detalle_mensual_v1(p_year, p_mes).
//
// Reemplaza al anterior MesEnCursoSubtab. Soporta cualquier mes histórico
// (no solo el mes en curso). Year y mes vienen como props desde el shell de
// Multifashion (selector único de período); este sub-tab solo los consume.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Award, AlertTriangle, Info } from "lucide-react";
import dynamic from "next/dynamic";

// recharts cargado aparte (ssr:false) → fuera del bundle inicial de /multifashion.
const VentasDiariasChart = dynamic(
  () => import("./DetalleMensualCharts").then((m) => m.VentasDiariasChart),
  { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded bg-stone-100" /> },
);
const HorasChart = dynamic(
  () => import("./DetalleMensualCharts").then((m) => m.HorasChart),
  { ssr: false, loading: () => <div className="h-[200px] w-full animate-pulse rounded bg-stone-100" /> },
);
import { fmtMoney, fmtMoneyCompact, fmtPct } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

interface DiaRow {
  dia: number;
  ventas: number;
  /** null cuando la fuente es switch_facturas (sin costo). */
  utilidad: number | null;
  n_tickets: number;
  ventas_mes_anterior: number;
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
  ventas: number;
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
  mejor_dia: { fecha: string; ventas: number } | null;
  peor_dia: { fecha: string; ventas: number } | null;
  heatmap_dia_semana: HeatmapDow[];
  /** Ventas por hora del día (0-23, hora Panamá). Aditivo: puede faltar. */
  horas?: HoraRow[];
  /** Hora con mayor venta neta del mes (0-23, Panamá). null si sin ventas. */
  hora_pico?: number | null;
  hora_pico_ventas?: number | null;
}

interface DetalleMensualSubtabProps {
  year: number;
  /** Mes (1-12) del selector único de período en el shell de Multifashion. */
  mes: number;
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
function calcDeltaPct(cur: number, comp: ComparativoBlock): number | null {
  if (!comp.tiene_data) return null;
  if (comp.ventas < 100) return null;
  return (cur - comp.ventas) / comp.ventas;
}

// Un delta de < 1% absoluto es ruido — lo tratamos como "≈0%" sin signo ni
// color. Evita flechas verde/rojo engañosas cuando el cambio es despreciable.
function isDeltaNegligible(delta: number | null): boolean {
  return delta != null && Math.abs(delta) < 0.01;
}

function deltaTone(delta: number | null): string {
  if (delta == null) return "text-stone-500";
  if (isDeltaNegligible(delta)) return "text-stone-500";
  if (delta > 0.05)  return "text-emerald-700";
  if (delta < -0.05) return "text-red-700";
  return "text-stone-500";
}

// Hint para mostrar el delta debajo del chart: "▲ +X%" / "▼ −X%" / "≈0%"
function renderDeltaInline(delta: number): string {
  if (isDeltaNegligible(delta)) return "≈0%";
  const arrow = delta >= 0 ? "▲" : "▼";
  return `${arrow} ${fmtPct(delta)}`;
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


export function DetalleMensualSubtab({ year, mes }: DetalleMensualSubtabProps) {
  const [data, setData] = useState<DetalleMensualResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/multifashion/detalle-mensual?year=${year}&mes=${mes}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<DetalleMensualResp>;
      })
      .then(setData)
      .catch(err => {
        if (err?.name === "AbortError") return;
        console.error("[detalle-mensual] fetch failed", err);
        setError(err instanceof Error ? err.message : "error inesperado");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [year, mes]);

  const heatmapMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.heatmap_dia_semana.map(h => h.ventas_promedio), 0);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <DetalleHeader
          title={`${MESES_FULL[mes - 1]} ${year}`}
          subtitle="Cargando…"
        />
        <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-stone-500">
          Cargando detalle mensual…
        </Card>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-5">
        <DetalleHeader
          title={`${MESES_FULL[mes - 1]} ${year}`}
          subtitle="—"
        />
        <Card className="rounded-md border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900">
          No se pudo cargar el detalle mensual: {error}
        </Card>
      </div>
    );
  }
  if (!data) return null;

  const { totales, mes_anterior, yoy, mejor_dia, peor_dia, heatmap_dia_semana, dias, mes_label, is_mes_actual } = data;
  const hasData = totales.n_tickets > 0;

  const deltaMoM = calcDeltaPct(totales.ventas, mes_anterior);
  const deltaYoy = calcDeltaPct(totales.ventas, yoy);

  // Mostrar línea dashed del mes anterior sólo si el comparativo es viable
  // (mismo guard que aplicamos en el KPI "VS Mes Anterior"). Si la base es
  // muy baja o nula, la línea no aporta y enrarece el chart.
  const showPrevLine = mes_anterior.tiene_data && mes_anterior.ventas >= 100;

  // chartData: clampea ventas/mes_anterior negativos a 0 para que el YAxis
  // domain [0, dataMax] no termine con la zona baja del chart desperdiciada
  // cuando hay NCs heavy. Sólo afecta visualización; los totales del banner
  // siguen siendo los reales (con netos negativos descontados).
  const chartData = dias.map(d => ({
    dia:                 d.dia,
    ventas:              Math.max(0, d.ventas),
    ventas_mes_anterior: showPrevLine ? Math.max(0, d.ventas_mes_anterior) : 0,
  }));

  // Ventas por hora (hora Panamá). Recorta el chart al rango con actividad
  // (primera→última hora con tickets) para no mostrar horas muertas.
  const horas = data.horas ?? [];
  const horaPico = data.hora_pico ?? null;
  const horasConData = horas.filter(h => h.n_tickets > 0);
  const minHora = horasConData.length ? Math.min(...horasConData.map(h => h.hora)) : 0;
  const maxHora = horasConData.length ? Math.max(...horasConData.map(h => h.hora)) : 0;
  const horasChart = horas
    .filter(h => h.hora >= minHora && h.hora <= maxHora)
    .map(h => ({
      hora:      h.hora,
      label:     horaLabelShort(h.hora),
      ventas:    Math.max(0, h.ventas),
      n_tickets: h.n_tickets,
    }));

  const headerTitle = is_mes_actual
    ? `${mes_label} ${year} · al día ${data.dia_actual} (data más reciente)`
    : `${mes_label} ${year}`;

  return (
    <div className={cn("space-y-5", loading && "opacity-60 pointer-events-none transition-opacity")}>
      <DetalleHeader
        title={headerTitle}
        subtitle="Retail mostrador. Mayoreo se reporta en Clientes."
      />

      {/* 5 KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniKpi
          label="VENTAS MES"
          value={fmtMoney(totales.ventas)}
          sub={`${totales.n_tickets.toLocaleString()} tickets`}
        />
        <DeltaKpi
          label="VS MES ANTERIOR"
          delta={deltaMoM}
          comp={mes_anterior}
          subTieneData={`$${Math.round(mes_anterior.ventas).toLocaleString()} mes anterior`}
        />
        <DeltaKpi
          label={`VS ${year - 1} (retail)`}
          delta={deltaYoy}
          comp={yoy}
          subTieneData={`$${Math.round(yoy.ventas).toLocaleString()} en ${year - 1}`}
        />
        <MiniKpi
          label="TICKET PROMEDIO"
          value={"$" + totales.ticket_promedio.toFixed(2)}
          sub="por boleta"
        />
        {is_mes_actual ? (
          <MiniKpi
            label="PROYECCIÓN CIERRE"
            value={totales.proyeccion_cierre != null ? fmtMoney(totales.proyeccion_cierre) : "—"}
            sub={`extrapola a ${data.dias_en_mes} días`}
          />
        ) : (
          <MiniKpi
            label="MARGEN · TIENDA COMPLETA"
            value={
              typeof totales.margen === "number" && Number.isFinite(totales.margen)
                ? `${(totales.margen * 100).toFixed(0)}%`
                : "—"
            }
            sub={
              typeof totales.margen === "number" && Number.isFinite(totales.margen)
                ? "retail + mayoreo"
                : "sin costo este mes"
            }
          />
        )}
      </div>

      {/* Chart día por día — si no hay data, empty state en lugar del chart */}
      <section>
        <h4 className="mb-2 font-display text-sm font-semibold text-stone-950">Ventas día por día</h4>
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
              <p className="mt-2 px-1 text-[10.5px] text-stone-500">
                <span className="inline-block w-2 h-2 mr-1 bg-teal-700 rounded-sm" />
                {mes_label} {year}
                {showPrevLine && (
                  <>
                    {" · "}
                    <span className="inline-block w-2 h-[2px] mr-1 bg-stone-400" />
                    Mes anterior
                  </>
                )}
              </p>
            </>
          ) : (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
              <Info className="h-6 w-6 text-stone-400" strokeWidth={1.5} />
              <p className="text-sm text-stone-500">No hay datos para este período</p>
              <p className="text-[11px] text-stone-400">
                {mes_label} {year} no registra ventas retail.
              </p>
            </div>
          )}
        </Card>
      </section>

      {/* Mejor / peor día */}
      {hasData && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DayCard label="MEJOR DÍA DEL MES" tone="emerald" row={mejor_dia} />
          <DayCard label="PEOR DÍA DEL MES" tone="amber" row={peor_dia} />
        </div>
      )}

      {/* Heatmap día de semana */}
      {hasData && (
        <section>
          <h4 className="mb-2 font-display text-sm font-semibold text-stone-950">Promedio por día de la semana</h4>
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-7">
              {heatmap_dia_semana.map(h => {
                const intensity = heatmapMax > 0 ? h.ventas_promedio / heatmapMax : 0;
                const bg = h.ventas_promedio === 0
                  ? "bg-stone-50"
                  : intensity > 0.75 ? "bg-teal-200"
                  : intensity > 0.5  ? "bg-teal-100"
                  : intensity > 0.25 ? "bg-teal-50/80"
                  :                    "bg-teal-50/40";
                return (
                  <div key={h.dow} className={cn("flex flex-col items-center border-r border-stone-200 px-3 py-3 last:border-r-0", bg)}>
                    <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">{h.dow_label}</p>
                    <p className="mt-1 font-mono text-sm font-medium text-stone-950 tabular-nums">
                      {h.ventas_promedio === 0 ? "—" : fmtMoneyCompact(h.ventas_promedio)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-stone-500">
                      {h.count_dias} {h.count_dias === 1 ? "día" : "días"}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
          <p className="mt-1.5 text-[10.5px] text-stone-500">
            Promedio de ventas por día calendario en {mes_label} {year}.
          </p>
        </section>
      )}

      {/* Ventas por hora del día + hora pico (hora Panamá). Reemplaza el aviso
          viejo "hora no disponible" — la fecha SÍ trae hora (timestamptz). */}
      {hasData && horasChart.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h4 className="font-display text-sm font-semibold text-stone-950">Ventas por hora</h4>
            {horaPico != null && (
              <span className="text-xs text-stone-500">
                Hora pico <span className="font-medium text-teal-700">{horaPicoLabel(horaPico)}</span>
              </span>
            )}
          </div>
          <Card className="overflow-hidden p-3">
            <HorasChart horasChart={horasChart} horaPico={horaPico} />
            <p className="mt-2 px-1 text-[10.5px] text-stone-500">
              Ventas netas por hora del día (hora de Panamá) · {mes_label} {year}
            </p>
          </Card>
        </section>
      )}

      {/* Línea de contexto comparativo cuando ambos tienen data, debajo del chart */}
      {(deltaMoM != null || deltaYoy != null) && hasData && (
        <p className="text-[11px] text-stone-500">
          {deltaMoM != null && (
            <span>vs mes anterior {renderDeltaInline(deltaMoM)}</span>
          )}
          {deltaMoM != null && deltaYoy != null && <span className="mx-2 text-stone-300">·</span>}
          {deltaYoy != null && (
            <span>
              vs {year - 1} {renderDeltaInline(deltaYoy)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}


// Header del sub-tab (título + subtítulo). El selector de mes vive ahora en el
// header del tab Multifashion (selector único de período), no aquí.
function DetalleHeader({
  title, subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h3 className="font-display text-base font-semibold text-stone-950">{title}</h3>
      <p className="mt-0.5 text-[11px] text-stone-500">{subtitle}</p>
    </div>
  );
}

function MiniKpi({
  label, value, sub, valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <Card className="p-3">
      <p className="text-[9.5px] font-medium uppercase tracking-widest text-stone-500">{label}</p>
      <p className={cn(
        "mt-1.5 font-mono text-[17px] font-medium leading-tight tabular-nums text-stone-950",
        valueClassName,
      )}>{value}</p>
      {sub && <p className="mt-1 text-[10.5px] text-stone-500">{sub}</p>}
    </Card>
  );
}

function DeltaKpi({
  label, delta, comp, subTieneData,
}: {
  label: string;
  delta: number | null;
  comp: ComparativoBlock;
  subTieneData: string;
}) {
  const tone = deltaTone(delta);
  let value: string;
  if (delta == null) {
    value = "—";
  } else if (isDeltaNegligible(delta)) {
    value = "≈0%";
  } else {
    const arrow = delta >= 0 ? "▲" : "▼";
    value = `${arrow} ${fmtPct(delta)}`;
  }
  const sub = !comp.tiene_data
    ? "sin data en período"
    : comp.ventas < 100
      ? "base muy baja"
      : subTieneData;
  return <MiniKpi label={label} value={value} sub={sub} valueClassName={tone} />;
}

function DayCard({
  label, tone, row,
}: {
  label: string;
  tone: "emerald" | "amber";
  row: { fecha: string; ventas: number } | null;
}) {
  const bg = tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100";
  const Icon = tone === "emerald" ? Award : AlertTriangle;
  if (!row) {
    return (
      <Card className="p-4">
        <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">{label}</p>
        <p className="mt-2 text-sm text-stone-400">Sin data del mes</p>
      </Card>
    );
  }
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", bg)}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="flex-1">
        <p className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">{label}</p>
        <p className="mt-0.5 font-mono text-base font-medium tabular-nums text-stone-950">
          {fmtMoney(row.ventas)}
        </p>
        <p className="mt-0.5 text-[11px] text-stone-500">{formatFechaShort(row.fecha)}</p>
      </div>
    </Card>
  );
}
