"use client";

import { useEffect } from "react";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDelta, type DeltaTone } from "@/lib/ventas/formatDelta";
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
  /** Suma de los 12 meses ANTERIORES al período actual (idx 13-24 atrás).
   *  Usado para el delta del bloque Ventas del HoverCard. */
  total_12m_prior: number;
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

export interface CxcAging {
  saldo_total: number;
  monto_0_90: number;
  monto_91_120: number;
  monto_121_plus: number;
}

export type CxcAgingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: CxcAging }
  | { status: "error"; message: string };

interface ClienteHoverCardProps {
  nombre: string;
  /** Switch Soft código, ej. "D-04" — visible en el subtítulo */
  codigo: string;
  /** Empresa display name, ej. "Vistana International" — visible en el subtítulo */
  empresa: string;
  /** Fecha display "21 abr 2026" desde la fila — se combina con días del endpoint */
  ultima: string;
  /** Historial mensual cacheado en parent. idle = aún no triggered */
  historial: HistorialState;
  /** Aging CXC cacheado en parent. idle = aún no triggered */
  cxc: CxcAgingState;
  /** Trigger lazy load — fires once on mount del card. Padre dedupea. */
  onFirstHover: () => void;
}

const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-stone-500",
};

export function ClienteHoverCard({
  nombre,
  codigo,
  empresa,
  ultima,
  historial,
  cxc,
  onFirstHover,
}: ClienteHoverCardProps) {
  useEffect(() => {
    onFirstHover();
    // Una sola vez al montar — el padre dedupea por (codigo + empresaKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = historial.status === "ready" ? historial.data : null;
  const histLoading = historial.status === "loading" || historial.status === "idle";

  const delta = ready ? formatDelta(ready.total_12m, ready.total_12m_prior) : null;

  return (
    <div className="space-y-3">
      {/* Header: nombre + empresa·código + chip CXC */}
      <div className="space-y-1.5">
        <div className="font-display text-[17px] font-medium leading-tight text-stone-950">
          {nombre}
        </div>
        <div className="text-xs text-stone-600">
          {empresa} · <span className="font-mono">{codigo}</span>
        </div>
        <CxcChip state={cxc} />
      </div>

      {/* Bloque Ventas: total 12m + delta vs 12m anteriores */}
      <div className="border-t border-stone-100 pt-3">
        {histLoading ? (
          <div className="space-y-2">
            <div className="h-7 w-32 animate-pulse rounded bg-stone-100" />
            <div className="h-3 w-44 animate-pulse rounded bg-stone-100" />
          </div>
        ) : ready && delta ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="font-mono text-2xl font-medium leading-none tabular-nums text-stone-950">
                {fmtMoneyCompact(ready.total_12m)}
              </div>
              <div className={cn(
                "font-mono text-sm font-medium tabular-nums",
                TONE_LIGHT[delta.tone]
              )}>
                {delta.arrow && <span className="mr-1">{delta.arrow}</span>}
                {delta.displayValue}
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-wider text-stone-500">
              <span>en últimos 12 meses</span>
              <span className="normal-case tracking-normal text-stone-500">
                {ready.total_12m_prior > 0
                  ? `vs ${fmtMoneyCompact(ready.total_12m_prior)} hace 12-24m`
                  : "sin compras hace 12-24m"}
              </span>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-red-600">
            {historial.status === "error" ? historial.message : "Sin datos"}
          </p>
        )}
      </div>

      {/* Detalles: recurrencia + última compra */}
      <div className="space-y-2 border-t border-stone-100 pt-3 text-xs">
        <DetailRow
          label="Recurrencia"
          value={ready
            ? `${ready.meses_activos} de 12 meses · ${recurrenciaLabel(ready.meses_activos)}`
            : null}
          loading={histLoading}
        />
        <DetailRow
          label="Última compra"
          value={ready ? formatUltima(ultima, ready.dias_desde_ultima_compra) : null}
          loading={histLoading}
        />
      </div>
    </div>
  );
}

/** Chip CXC info-only: 4 estados según presencia/ausencia en buckets. */
function CxcChip({ state }: { state: CxcAgingState }) {
  if (state.status === "loading" || state.status === "idle") {
    return <div className="h-5 w-40 animate-pulse rounded bg-stone-100" />;
  }
  if (state.status === "error") {
    return (
      <div className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-stone-100 text-stone-500">
        Saldo no disponible
      </div>
    );
  }
  const { saldo_total, monto_91_120, monto_121_plus } = state.data;

  if (saldo_total <= 0) {
    return (
      <div className="inline-flex items-center rounded bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
        Sin saldo pendiente
      </div>
    );
  }

  let cls = "bg-emerald-50 text-emerald-800";
  let label = "Al día";
  if (monto_121_plus > 0) {
    cls = "bg-red-50 text-red-800";
    label = "Atención";
  } else if (monto_91_120 > 0) {
    cls = "bg-amber-50 text-amber-800";
    label = "Cuentas pendientes";
  }

  return (
    <div className={cn("inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium", cls)}>
      {label} · debe <span className="ml-1 font-mono tabular-nums">{fmtMoney(saldo_total)}</span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wider text-stone-500">{label}</span>
      {loading ? (
        <div className="h-3.5 w-32 animate-pulse rounded bg-stone-100" />
      ) : (
        <span className="text-stone-800">{value ?? "—"}</span>
      )}
    </div>
  );
}

/** 0 → inactivo / 1-3 esporádico / 4-6 regular / 7-10 recurrente / 11-12 muy recurrente. */
function recurrenciaLabel(mesesActivos: number): string {
  if (mesesActivos >= 11) return "muy recurrente";
  if (mesesActivos >= 7)  return "recurrente";
  if (mesesActivos >= 4)  return "regular";
  if (mesesActivos >= 1)  return "esporádico";
  return "inactivo";
}

/** "21 abr 2026 · hace 20 días" — concatena fecha display + días relativos. */
function formatUltima(fecha: string, dias: number | null): string {
  if (dias == null) return fecha || "Sin compras";
  const rel = dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  return fecha ? `${fecha} · ${rel}` : rel;
}
