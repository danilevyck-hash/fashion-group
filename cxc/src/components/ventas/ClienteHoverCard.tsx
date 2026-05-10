"use client";

import { useEffect } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { fmtMoneyCompact } from "@/lib/ventas/format";
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
  /** Promedio sobre meses ACTIVOS (no sobre 12 fijos). */
  promedio_mensual: number;
  /** Cantidad de meses con compra en últimos 12 meses (0-12). */
  meses_activos: number;
  /** Días desde la última factura registrada. null si no hay compras. */
  dias_desde_ultima_compra: number | null;
}

export type HistorialState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: HistorialMensual }
  | { status: "error"; message: string };

interface ClienteHoverCardProps {
  /** Display name fallback while loading */
  nombre: string;
  /** Switch Soft codigo, e.g. "D-04" — kept for API key, NOT shown */
  codigo: string;
  /** Última compra (display string) — kept for compat, NOT shown (vive en la fila) */
  ultima: string;
  /** Cached state in parent — null = nunca cargado */
  state: HistorialState;
  /** Trigger first load (called once on first hover) */
  onFirstHover: () => void;
}

export function ClienteHoverCard({
  nombre,
  state,
  onFirstHover,
}: ClienteHoverCardProps) {
  // Trigger lazy load on mount of the popover content
  useEffect(() => {
    if (state.status === "idle") onFirstHover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = state.status === "ready" ? state.data : null;
  const isLoading = state.status === "loading" || state.status === "idle";

  return (
    <div className="space-y-2.5">
      {/* Header: solo nombre. Codigo + última compra ya están en la fila. */}
      <div className="text-sm font-medium leading-tight text-stone-950">{nombre}</div>

      <Sparkline state={state} />

      {/* Stats grid 2x2 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-stone-100 pt-2.5">
        <Stat
          label="Total 12m"
          value={ready ? fmtMoneyCompact(ready.total_12m) : ""}
          loading={isLoading}
        />
        <Stat
          label="Promedio mensual"
          value={ready ? `${fmtMoneyCompact(ready.promedio_mensual)}/mes` : ""}
          caption={ready ? "sobre meses activos" : undefined}
          loading={isLoading}
        />
        <Stat
          label="Meses activos"
          value={ready ? `${ready.meses_activos}/12` : ""}
          caption={ready ? activityLabel(ready.meses_activos) : undefined}
          loading={isLoading}
        />
        <Stat
          label="Última compra"
          value={ready ? formatDias(ready.dias_desde_ultima_compra) : ""}
          caption={ready && ready.dias_desde_ultima_compra != null ? "sin comprar" : undefined}
          valueTone={ready ? diasTone(ready.dias_desde_ultima_compra) : undefined}
          loading={isLoading}
        />
      </div>

      {state.status === "error" && (
        <p className="text-[11px] text-red-600">{state.message}</p>
      )}
    </div>
  );
}

/** Label semántico según meses activos (0-12) */
function activityLabel(mesesActivos: number): string {
  if (mesesActivos >= 10) return "muy recurrente";
  if (mesesActivos >= 6)  return "regular";
  if (mesesActivos >= 3)  return "ocasional";
  if (mesesActivos >= 1)  return "esporádico";
  return "sin actividad";
}

/** Display "Hace N días" o "—" cuando no hay compras */
function formatDias(dias: number | null): string {
  if (dias == null) return "—";
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Hace 1 día";
  return `Hace ${dias} días`;
}

/** Color del valor "Última compra" según días sin comprar */
function diasTone(dias: number | null): string | undefined {
  if (dias == null)        return "text-stone-400";
  if (dias <= 30)          return "text-stone-700";
  if (dias <= 60)          return "text-amber-600";
  return                          "text-orange-600";
}

function Stat({
  label,
  value,
  caption,
  loading,
  valueTone,
}: {
  label: string;
  value: string;
  caption?: string;
  loading: boolean;
  valueTone?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
        <div className="h-4 w-16 animate-pulse rounded bg-stone-100" />
        <div className="h-2.5 w-12 animate-pulse rounded bg-stone-100" />
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className={cn(
        "font-mono text-sm font-medium tabular-nums",
        valueTone ?? "text-stone-950"
      )}>
        {value}
      </div>
      {caption && <div className="text-[10px] text-stone-500">{caption}</div>}
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
