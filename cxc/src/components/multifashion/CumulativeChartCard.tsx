"use client";

// Tarjeta del gráfico "Ventas acumuladas año vs año previo". Vive en su propio
// archivo para cargarse vía next/dynamic(ssr:false) desde MultifashionView →
// recharts (≈100kB) sale del bundle inicial de /multifashion y se carga aparte.

import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import type { MultifashionSerieMes } from "@/components/ventas/types";

export type CumPoint = { doy: number; mes: number; cur: number | null; prev: number | null };

const MONTH_TICKS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_ABBR = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function doyToMonthIndex(doy: number): number {
  let m = 1;
  for (let i = 0; i < MONTH_TICKS.length; i++) if (doy >= MONTH_TICKS[i]) m = i + 1;
  return m;
}

export function CumulativeChartCard({
  chart, mesMapAct, mesMapPrev, year, prevYear,
}: {
  chart: CumPoint[];
  mesMapAct: Map<number, MultifashionSerieMes>;
  mesMapPrev: Map<number, MultifashionSerieMes>;
  year: number;
  prevYear: number;
}) {
  return (
    <Card className="p-4">
      <p className="mb-2 text-[10.5px] font-medium uppercase tracking-widest text-stone-500">
        Ventas acumuladas · {year} vs {prevYear}
      </p>
      <div className="h-[200px] w-full">
        <ResponsiveContainer>
          <LineChart data={chart} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="doy"
              type="number"
              domain={[1, 366]}
              ticks={MONTH_TICKS}
              tickFormatter={(d) => MONTH_ABBR[doyToMonthIndex(Number(d))] ?? ""}
              tick={{ fontSize: 10, fill: "#78716c" }}
              axisLine={{ stroke: "#e7e5e4" }}
              tickLine={false}
            />
            <YAxis
              width={48}
              tickFormatter={(v) => fmtMoneyCompact(Number(v))}
              tick={{ fontSize: 10, fill: "#78716c" }}
              axisLine={false}
              tickLine={false}
            />
            <RTooltip
              cursor={{ stroke: "#d6d3d1", strokeWidth: 1 }}
              content={(p) => (
                <CumulativeTooltip
                  active={p.active}
                  payload={p.payload as ReadonlyArray<unknown> | undefined}
                  mesMapAct={mesMapAct}
                  mesMapPrev={mesMapPrev}
                  year={year}
                  prevYear={prevYear}
                />
              )}
            />
            {/* Año previo — ámbar, fino, punteado, año completo. */}
            <Line type="monotone" dataKey="prev" stroke="#BA7517" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
            {/* Año en curso — azul, grueso, hasta hoy. */}
            <Line type="monotone" dataKey="cur" stroke="#185FA5" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: "#185FA5" }} />{year} (hasta hoy)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: "#BA7517" }} />{prevYear} (completo)
        </span>
      </div>
    </Card>
  );
}

// Tooltip POR MES: del día bajo el cursor toma su mes y muestra venta del mes +
// acumulado de ambos años (nunca el valor del día puntual).
function CumulativeTooltip({
  active, payload, mesMapAct, mesMapPrev, year, prevYear,
}: {
  active?: boolean;
  payload?: ReadonlyArray<unknown>;
  mesMapAct: Map<number, MultifashionSerieMes>;
  mesMapPrev: Map<number, MultifashionSerieMes>;
  year: number;
  prevYear: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0] as { payload?: { mes?: number } } | undefined;
  const mes = first?.payload?.mes;
  if (mes == null) return null;
  const a = mesMapAct.get(mes);
  const p = mesMapPrev.get(mes);
  const cell = (v: number | undefined) => (v != null ? fmtMoney(v) : "—");
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-[11px] shadow-sm">
      <p className="mb-1.5 font-medium text-stone-700">{MONTH_ABBR[mes]}</p>
      <div className="grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-0.5">
        <span />
        <span className="text-right text-[9.5px] uppercase tracking-wider text-stone-400">Mes</span>
        <span className="text-right text-[9.5px] uppercase tracking-wider text-stone-400">Acum.</span>
        <span className="inline-flex items-center gap-1.5 text-stone-500">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: "#185FA5" }} />{year}
        </span>
        <span className="text-right font-mono tabular-nums text-stone-950">{cell(a?.ventas)}</span>
        <span className="text-right font-mono tabular-nums text-stone-950">{cell(a?.acumulado)}</span>
        <span className="inline-flex items-center gap-1.5 text-stone-500">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: "#BA7517" }} />{prevYear}
        </span>
        <span className="text-right font-mono tabular-nums text-stone-700">{cell(p?.ventas)}</span>
        <span className="text-right font-mono tabular-nums text-stone-700">{cell(p?.acumulado)}</span>
      </div>
    </div>
  );
}
