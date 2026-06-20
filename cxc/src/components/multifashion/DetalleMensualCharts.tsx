"use client";

// Gráficos del mes (ventas día por día + ventas por hora). Aislados en su propio
// archivo para cargarse vía next/dynamic(ssr:false) desde MultifashionResumenView
// → recharts sale del bundle inicial de /multifashion.

import {
  Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, Line, ComposedChart, Cell,
} from "recharts";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

type DiaPoint = { dia: number; ventas: number; ventas_anio_anterior: number };
type HoraPoint = { hora: number; label: string; ventas: number; n_tickets: number };

// Hora pico 0-23 → rango legible ("4–5 pm", cruce de meridiano "11 pm–12 am").
function horaPicoLabel(h: number): string {
  const end = (h + 1) % 24;
  const hr = (x: number) => (x % 12 === 0 ? 12 : x % 12);
  const per = (x: number) => (x < 12 ? "am" : "pm");
  return per(h) === per(end)
    ? `${hr(h)}–${hr(end)} ${per(h)}`
    : `${hr(h)} ${per(h)}–${hr(end)} ${per(end)}`;
}

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

// ── Ventas día por día ──────────────────────────────────────────────────────
export function VentasDiariasChart({
  chartData, isMesActual, diaActual, showPrevLine, mesLabel, year,
}: {
  chartData: DiaPoint[];
  isMesActual: boolean;
  diaActual: number;
  showPrevLine: boolean;
  mesLabel: string;
  year: number;
}) {
  return (
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
                isMesActual={isMesActual}
                diaActual={diaActual}
                showPrevLine={showPrevLine}
                mesLabel={mesLabel}
                year={year}
              />
            )}
          />
          <Bar dataKey="ventas" fill="#0d9488" radius={[2, 2, 0, 0]} />
          {showPrevLine && (
            <Line
              type="monotone"
              dataKey="ventas_anio_anterior"
              stroke="#a8a29e"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Ventas por hora ─────────────────────────────────────────────────────────
export function HorasChart({
  horasChart, horaPico,
}: {
  horasChart: HoraPoint[];
  horaPico: number | null;
}) {
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer>
        <ComposedChart data={horasChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            interval={0}
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
            content={(p) => <HoraTooltip active={p.active} payload={p.payload as ReadonlyArray<unknown> | undefined} />}
          />
          <Bar dataKey="ventas" radius={[2, 2, 0, 0]}>
            {horasChart.map(h => (
              // Barra de la hora pico en teal más oscuro para destacarla.
              <Cell key={h.hora} fill={h.hora === horaPico ? "#0f766e" : "#5eead4"} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Tooltip del chart de ventas por hora.
function HoraTooltip({ active, payload }: {
  active?: boolean;
  payload?: ReadonlyArray<unknown> | undefined;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = (payload[0] as { payload?: { hora: number; ventas: number; n_tickets: number } }).payload;
  if (!row) return null;
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-stone-950">{horaPicoLabel(row.hora)}</p>
      <p className="mt-0.5 font-mono tabular-nums text-stone-700">{fmtMoney(row.ventas)}</p>
      <p className="text-[10px] text-stone-500">
        {row.n_tickets} {row.n_tickets === 1 ? "ticket" : "tickets"}
      </p>
    </div>
  );
}

// Tooltip con semántica de día (futuro = no mostrar $0; pasado con 0 = "Sin
// operación"; línea mes anterior solo si showPrevLine y > 0).
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
  const prevItem   = payload.find(p => matchesKey(p, "ventas_anio_anterior"));
  const ventas = readDataKey(ventasItem, "ventas");
  const prev   = readDataKey(prevItem,   "ventas_anio_anterior");
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
    rows.push({ label: `Mismo mes ${year - 1}`, value: fmtMoney(prev), tone: "text-stone-600" });
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
