"use client";

// Sub-tab "Mes en curso" de Multifashion. Solo retail (is_wholesale=false).
// Server data: RPC multifashion_dia_a_dia(p_year, p_mes).
//
// Cuando selectedYear < año calendario actual el padre (MultifashionView)
// muestra el placeholder "Año cerrado · no hay mes en curso", así que este
// componente solo se renderiza con datos del año en curso o un mes parcial.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Calendar, Award, AlertTriangle, Info } from "lucide-react";
import {
  Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, Line, ComposedChart,
} from "recharts";
import { fmtMoney, fmtMoneyCompact, fmtPct } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

interface DiaRow {
  dia: number;
  ventas: number;
  tickets: number;
  ticket_prom: number;
  ventas_mes_anterior: number;
}

interface HeatmapDow {
  dow: number;
  dow_label: string;
  ventas_promedio: number;
  count_dias: number;
}

interface MesEnCursoResp {
  anio: number;
  mes: number;
  mes_label: string;
  hoy: string;
  dia_actual: number;
  dias_transcurridos: number;
  dias_en_mes: number;
  dias: DiaRow[];
  totales: {
    ventas_mes_corriente: number;
    tickets_mes_corriente: number;
    ticket_prom_corriente: number;
    ventas_mismo_periodo_anterior: number;
    delta_pct: number | null;
    proyeccion_cierre: number;
  };
  mejor_dia: { fecha: string; ventas: number } | null;
  peor_dia: { fecha: string; ventas: number } | null;
  heatmap_dia_semana: HeatmapDow[];
  hora_pico: unknown | null;
}

interface MesEnCursoSubtabProps {
  selectedYear: number;
}

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatFechaShort(iso: string): string {
  const d = parseIsoDateLocal(iso);
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getDate()} ${MES[d.getMonth()]}`;
}

export function MesEnCursoSubtab({ selectedYear }: MesEnCursoSubtabProps) {
  const [data, setData] = useState<MesEnCursoResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/multifashion/mes-en-curso?year=${selectedYear}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<MesEnCursoResp>;
      })
      .then(setData)
      .catch(err => {
        if (err?.name === "AbortError") return;
        console.error("[mes-en-curso] fetch failed", err);
        setError(err instanceof Error ? err.message : "error inesperado");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [selectedYear]);

  // Máximo del heatmap dia-semana para color intensity
  const heatmapMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.heatmap_dia_semana.map(h => h.ventas_promedio), 0);
  }, [data]);

  if (loading && !data) {
    return (
      <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-stone-500">
        Cargando mes en curso…
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="rounded-md border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900">
        No se pudo cargar el mes en curso: {error}
      </Card>
    );
  }
  if (!data) return null;

  const { totales, mejor_dia, peor_dia, heatmap_dia_semana, dias, mes_label, anio } = data;
  const deltaPct = totales.delta_pct;
  const deltaTone =
    deltaPct == null     ? "text-stone-500"  :
    deltaPct > 0.05      ? "text-emerald-700" :
    deltaPct < -0.05     ? "text-red-700"     : "text-stone-500";
  const deltaArrow = deltaPct == null ? null : deltaPct >= 0 ? "▲" : "▼";
  const proyeccion = totales.proyeccion_cierre;

  return (
    <div className={cn("space-y-5", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {/* Header — `dia_actual` = MAX(día) con data retail, no día calendario. */}
      <div>
        <h3 className="font-display text-base font-semibold text-stone-950">
          {mes_label} {anio} · al día {data.dia_actual} (data más reciente)
        </h3>
        <p className="mt-0.5 text-[11px] text-stone-500">
          Retail mostrador. Mayoreo se reporta en Clientes.
        </p>
      </div>

      {/* 5 KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniKpi
          label="VENTAS MES"
          value={fmtMoney(totales.ventas_mes_corriente)}
          sub={`${totales.tickets_mes_corriente.toLocaleString()} tickets`}
        />
        <MiniKpi
          label="MISMO PERÍODO MES ANTERIOR"
          value={fmtMoney(totales.ventas_mismo_periodo_anterior)}
          sub={`día 1 al ${data.dia_actual} del mes pasado`}
        />
        <MiniKpi
          label="DIFERENCIA"
          value={deltaPct == null ? "—" : `${deltaArrow} ${fmtPct(deltaPct)}`}
          sub={deltaPct == null ? "sin base comparable" : "vs mismo período"}
          valueClassName={deltaTone}
        />
        <MiniKpi
          label="TICKET PROMEDIO"
          value={"$" + totales.ticket_prom_corriente.toFixed(2)}
          sub="por boleta"
        />
        <MiniKpi
          label="PROYECCIÓN CIERRE"
          value={fmtMoney(proyeccion)}
          sub={`extrapola a ${data.dias_en_mes} días`}
        />
      </div>

      {/* Chart día por día */}
      <section>
        <h4 className="mb-2 font-display text-sm font-semibold text-stone-950">Ventas día por día</h4>
        <Card className="overflow-hidden p-3">
          <div className="h-[260px] w-full">
            <ResponsiveContainer>
              <ComposedChart data={dias} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 10, fill: "#78716c" }}
                  axisLine={{ stroke: "#e7e5e4" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#78716c" }}
                  axisLine={{ stroke: "#e7e5e4" }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtMoneyCompact(v)}
                />
                <RTooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e7e5e4" }}
                  formatter={(value, name) => {
                    const v = typeof value === "number" ? value : Number(value) || 0;
                    if (name === "ventas") return [fmtMoney(v), `${mes_label} ${anio}`];
                    if (name === "ventas_mes_anterior") return [fmtMoney(v), "Mes anterior"];
                    return [String(value), String(name)];
                  }}
                  labelFormatter={(label) => `Día ${label}`}
                />
                <Bar dataKey="ventas" fill="#0d9488" radius={[2, 2, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="ventas_mes_anterior"
                  stroke="#a8a29e"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 px-1 text-[10.5px] text-stone-500">
            <span className="inline-block w-2 h-2 mr-1 bg-teal-700 rounded-sm" />
            Mes corriente
            {" · "}
            <span className="inline-block w-2 h-[2px] mr-1 bg-stone-400" />
            Mes anterior
          </p>
        </Card>
      </section>

      {/* Mejor / peor día */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DayCard
          label="MEJOR DÍA DEL MES"
          icon={Award}
          tone="emerald"
          row={mejor_dia}
        />
        <DayCard
          label="PEOR DÍA DEL MES"
          icon={AlertTriangle}
          tone="amber"
          row={peor_dia}
        />
      </div>

      {/* Heatmap día de semana */}
      <section>
        <h4 className="mb-2 font-display text-sm font-semibold text-stone-950">Promedio por día de la semana</h4>
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7">
            {heatmap_dia_semana.map(h => {
              const intensity = heatmapMax > 0 ? h.ventas_promedio / heatmapMax : 0;
              // Color intensity 0..1 → teal-50 (light) a teal-700 (dark)
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
          Promedio de ventas por día calendario en {mes_label} {anio}.
        </p>
      </section>

      {/* Hora pico — no disponible */}
      <section>
        <Card className="flex items-center gap-3 border-stone-200 bg-stone-50 p-4">
          <Info className="h-4 w-4 text-stone-400" />
          <p className="text-xs text-stone-500">
            Hora pico no disponible: <span className="font-mono">ventas_raw.fecha</span> guarda solo fecha (date), sin componente horario.
          </p>
        </Card>
      </section>
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

function DayCard({
  label, icon: Icon, tone, row,
}: {
  label: string;
  icon: typeof TrendingUp;
  tone: "emerald" | "amber";
  row: { fecha: string; ventas: number } | null;
}) {
  const bg = tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100";
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

// Silenciar warnings TS de imports no usados (algunos iconos quedan
// reservados para futuras secciones, ej. TrendingDown si agregamos
// indicador de baja semanal).
void TrendingDown;
void Calendar;
