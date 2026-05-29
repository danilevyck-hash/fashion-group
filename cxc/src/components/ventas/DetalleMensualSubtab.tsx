"use client";

// Sub-tab "Detalle mensual" de Multifashion. Solo retail (is_wholesale=false).
// Server data: RPC multifashion_detalle_mensual_v1(p_year, p_mes).
//
// Reemplaza al anterior MesEnCursoSubtab. Soporta cualquier mes histórico
// (no solo el mes en curso). Year viene desde el selector global del módulo
// Ventas; el selector de mes es local a este sub-tab.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Award, AlertTriangle, Info } from "lucide-react";
import {
  Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, Line, ComposedChart,
} from "recharts";
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
}

interface DetalleMensualSubtabProps {
  year: number;
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

// Default selectedMes según year:
//   - year == currentYear → mes actual del calendario
//   - year <  currentYear → 12 (diciembre)
//   - year >  currentYear → 1  (raro, pero defensivo)
function defaultMesForYear(year: number): number {
  const now = new Date();
  if (year === now.getFullYear()) return now.getMonth() + 1;
  if (year < now.getFullYear()) return 12;
  return 1;
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

export function DetalleMensualSubtab({ year }: DetalleMensualSubtabProps) {
  const [selectedMes, setSelectedMes] = useState<number>(() => defaultMesForYear(year));
  const [data, setData] = useState<DetalleMensualResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cuando year cambia (selector global), resetear mes con la misma regla.
  useEffect(() => {
    setSelectedMes(defaultMesForYear(year));
  }, [year]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/multifashion/detalle-mensual?year=${year}&mes=${selectedMes}`, {
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
  }, [year, selectedMes]);

  const heatmapMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.heatmap_dia_semana.map(h => h.ventas_promedio), 0);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <MonthSelectorHeader
          year={year}
          selectedMes={selectedMes}
          onMesChange={setSelectedMes}
          title={`${MESES_FULL[selectedMes - 1]} ${year}`}
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
        <MonthSelectorHeader
          year={year}
          selectedMes={selectedMes}
          onMesChange={setSelectedMes}
          title={`${MESES_FULL[selectedMes - 1]} ${year}`}
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

  const headerTitle = is_mes_actual
    ? `${mes_label} ${year} · al día ${data.dia_actual} (data más reciente)`
    : `${mes_label} ${year}`;

  return (
    <div className={cn("space-y-5", loading && "opacity-60 pointer-events-none transition-opacity")}>
      <MonthSelectorHeader
        year={year}
        selectedMes={selectedMes}
        onMesChange={setSelectedMes}
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
          label={`VS ${year - 1}`}
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
            label="MARGEN BRUTO"
            value={totales.margen == null ? "—" : `${(totales.margen * 100).toFixed(1)}%`}
            sub={totales.margen == null ? "sin costo en la fuente" : "utilidad / ventas"}
          />
        )}
      </div>

      {/* Chart día por día — si no hay data, empty state en lugar del chart */}
      <section>
        <h4 className="mb-2 font-display text-sm font-semibold text-stone-950">Ventas día por día</h4>
        <Card className="overflow-hidden p-3">
          {hasData ? (
            <>
              <div className="h-[260px] w-full">
                <ResponsiveContainer>
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 10, fill: "#78716c" }}
                      axisLine={{ stroke: "#e7e5e4" }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, "dataMax"]}
                      allowDataOverflow={false}
                      tick={{ fontSize: 10, fill: "#78716c" }}
                      axisLine={{ stroke: "#e7e5e4" }}
                      tickLine={false}
                      tickFormatter={(v: number) => fmtMoneyCompact(v)}
                    />
                    <RTooltip
                      cursor={{ fill: "rgba(0,0,0,0.03)" }}
                      content={(p) => (
                        <ChartTooltip
                          active={p.active}
                          payload={p.payload as ReadonlyArray<unknown> | undefined}
                          label={typeof p.label === "number" || typeof p.label === "string" ? p.label : undefined}
                          isMesActual={is_mes_actual}
                          diaActual={data.dia_actual}
                          showPrevLine={showPrevLine}
                          mesLabel={mes_label}
                          year={year}
                        />
                      )}
                    />
                    <Bar dataKey="ventas" fill="#0d9488" radius={[2, 2, 0, 0]} />
                    {showPrevLine && (
                      <Line
                        type="monotone"
                        dataKey="ventas_mes_anterior"
                        stroke="#a8a29e"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        dot={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
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

      {/* Nota hora pico — solo si tiene data, no llenar visualmente cuando no hay nada */}
      {hasData && (
        <section>
          <Card className="flex items-center gap-3 border-stone-200 bg-stone-50 p-4">
            <Info className="h-4 w-4 text-stone-400" />
            <p className="text-xs text-stone-500">
              Hora pico no disponible (la venta solo registra fecha, no hora).
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

// Tooltip con semántica de día. Reglas:
//   - Día futuro (is_mes_actual && día > dia_actual): NO mostrar "$0.00"
//     del mes actual. Si hay valor de mes anterior, mostrarlo. Si no, "pendiente".
//   - Día pasado con ventas=0: mostrar "Sin operación" en vez de "$0.00".
//   - Día con ventas > 0: monto formateado normal.
//   - Línea mes anterior se incluye sólo si showPrevLine y el valor > 0.
//
// `payload` se tipa como unknown porque recharts expone tipos complejos
// (TooltipPayload con dataKey función y value variante). Narrow defensivo
// abajo: si el item no tiene dataKey/value útiles, devuelve 0.
function readDataKey(item: unknown, key: string): number {
  if (typeof item !== "object" || item === null) return 0;
  const rec = item as Record<string, unknown>;
  if (rec.dataKey !== key) return 0;
  const v = rec.value;
  return typeof v === "number" ? v : 0;
}

function matchesKey(item: unknown, key: string): boolean {
  if (typeof item !== "object" || item === null) return false;
  return (item as Record<string, unknown>).dataKey === key;
}

function ChartTooltip({
  active, payload, label,
  isMesActual, diaActual, showPrevLine, mesLabel, year,
}: {
  active?: boolean;
  payload?: ReadonlyArray<unknown>;
  label?: string | number;
  isMesActual: boolean;
  diaActual: number;
  showPrevLine: boolean;
  mesLabel: string;
  year: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const day = typeof label === "number" ? label : parseInt(String(label ?? ""), 10);
  if (!Number.isFinite(day)) return null;

  const ventasItem = payload.find(p => matchesKey(p, "ventas"));
  const prevItem   = payload.find(p => matchesKey(p, "ventas_mes_anterior"));
  const ventas = readDataKey(ventasItem, "ventas");
  const prev   = readDataKey(prevItem,   "ventas_mes_anterior");
  const isFuture = isMesActual && day > diaActual;

  const rows: { label: string; value: string; tone?: string }[] = [];

  if (!isFuture) {
    if (ventas === 0) {
      rows.push({ label: `${mesLabel} ${year}`, value: "Sin operación", tone: "text-stone-400" });
    } else {
      rows.push({ label: `${mesLabel} ${year}`, value: fmtMoney(ventas) });
    }
  }
  if (showPrevLine && prev > 0) {
    rows.push({ label: "Mes anterior", value: fmtMoney(prev), tone: "text-stone-600" });
  }
  if (rows.length === 0) {
    rows.push({ label: "Pendiente", value: "—", tone: "text-stone-400" });
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] shadow-sm">
      <div className="mb-1 font-medium text-stone-700">Día {day}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="text-stone-500">{r.label}</span>
          <span className={cn("font-mono tabular-nums text-stone-950", r.tone)}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function MonthSelectorHeader({
  year, selectedMes, onMesChange, title, subtitle,
}: {
  year: number;
  selectedMes: number;
  onMesChange: (mes: number) => void;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-base font-semibold text-stone-950">{title}</h3>
        <p className="mt-0.5 text-[11px] text-stone-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Mes</span>
        <Select value={String(selectedMes)} onValueChange={v => onMesChange(parseInt(v, 10))}>
          <SelectTrigger className="h-8 w-[140px] border-stone-300 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES_FULL.map((label, i) => (
              <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">
                {label} {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
