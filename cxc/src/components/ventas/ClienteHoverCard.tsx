"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { fmtMoneyCompact, MONTHS } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

interface MesPunto {
  anio: number;
  mes: number;
  total: number;
  facturas: number;
}

export interface HistorialMensual {
  cliente_nombre: string;
  meses: MesPunto[];
  total_12m: number;
  promedio_mensual: number;
  mejor_mes: MesPunto | null;
  peor_mes: MesPunto | null;
}

export type HistorialState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: HistorialMensual }
  | { status: "error"; message: string };

interface ClienteHoverCardProps {
  /** Display name fallback while loading */
  nombre: string;
  /** Switch Soft codigo, e.g. "D-04" */
  codigo: string;
  /** Última compra (display string), e.g. "27 abr 2026" */
  ultima: string;
  /** Cached state in parent — null = nunca cargado */
  state: HistorialState;
  /** Trigger first load (called once on first hover) */
  onFirstHover: () => void;
}

export function ClienteHoverCard({
  nombre,
  codigo,
  ultima,
  state,
  onFirstHover,
}: ClienteHoverCardProps) {
  // Trigger lazy load on mount of the popover content
  useEffect(() => {
    if (state.status === "idle") onFirstHover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-sm font-semibold leading-tight text-stone-950">{nombre}</div>
        <div className="font-mono text-[11px] leading-tight text-stone-500">{codigo}</div>
      </div>

      <Sparkline state={state} />

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-stone-100 pt-2.5 text-[11px]">
        <Stat
          label="Total 12m"
          value={state.status === "ready" ? fmtMoneyCompact(state.data.total_12m) : "…"}
          loading={state.status === "loading"}
        />
        <Stat
          label="Promedio"
          value={
            state.status === "ready"
              ? `${fmtMoneyCompact(state.data.promedio_mensual)}/mes`
              : "…"
          }
          loading={state.status === "loading"}
        />
        <Stat
          label="Mejor mes"
          value={
            state.status === "ready" && state.data.mejor_mes
              ? `${MONTHS[state.data.mejor_mes.mes - 1]} ${state.data.mejor_mes.anio} · ${fmtMoneyCompact(state.data.mejor_mes.total)}`
              : state.status === "ready"
                ? "Sin compras"
                : "…"
          }
          loading={state.status === "loading"}
        />
        <Stat
          label="Última compra"
          value={ultima || "—"}
          loading={false}
        />
      </div>

      {state.status === "error" && (
        <p className="text-[11px] text-red-600">{state.message}</p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  loading,
}: { label: string; value: string; loading: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div
        className={cn(
          "font-mono text-stone-950 tabular-nums",
          loading && "animate-pulse text-stone-400"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Sparkline({ state }: { state: HistorialState }) {
  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="h-[60px] w-full animate-pulse rounded-sm bg-stone-100" aria-hidden />
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-[60px] w-full items-center justify-center rounded-sm bg-stone-50 text-[11px] text-stone-400">
        Sin datos
      </div>
    );
  }

  const data = state.data.meses.map((m, i) => ({
    idx: i,
    total: m.total,
  }));
  const lastIdx = data.length - 1;

  return (
    <div className="h-[60px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          {/* Y axis hidden but enables proper scaling */}
          <YAxis hide domain={[0, "dataMax"]} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#0f766e"
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, index } = props as { cx: number; cy: number; index: number };
              if (index !== lastIdx) {
                return <g key={`d-${index}`} />;
              }
              return (
                <circle
                  key={`d-${index}`}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill="#0f766e"
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
