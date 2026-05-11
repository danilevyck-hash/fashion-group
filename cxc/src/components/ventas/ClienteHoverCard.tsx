"use client";

import { useEffect, useState } from "react";
import { fmtMoneyCompact } from "@/lib/ventas/format";
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

type CxcState =
  | { status: "loading" }
  | { status: "ready"; data: CxcAging }
  | { status: "error" };

// Cache module-level del aging CXC keyed por (codigo|empresaScope). El
// HoverCard se monta/desmonta con cada hover (Radix HoverCardContent),
// así que un estado local se pierde entre aperturas. Este cache sobrevive
// mientras la sesión esté viva — primer hover dispara fetch, hovers
// subsecuentes son instantáneos.
const cxcCache = new Map<string, CxcState>();
const cxcInFlight = new Set<string>();
const cxcSubscribers = new Map<string, Set<() => void>>();

function subscribeCxc(key: string, cb: () => void): () => void {
  let set = cxcSubscribers.get(key);
  if (!set) {
    set = new Set();
    cxcSubscribers.set(key, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) cxcSubscribers.delete(key);
  };
}

function notifyCxc(key: string) {
  cxcSubscribers.get(key)?.forEach(cb => cb());
}

function fetchCxcAging(codigo: string, empresaScope: string): void {
  const key = `${codigo}|${empresaScope}`;
  if (cxcCache.has(key) || cxcInFlight.has(key)) return;
  cxcInFlight.add(key);
  cxcCache.set(key, { status: "loading" });
  notifyCxc(key);

  const url = `/api/cxc/aging-por-cliente/${encodeURIComponent(codigo)}?empresa=${encodeURIComponent(empresaScope)}`;
  fetch(url)
    .then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<CxcAging>;
    })
    .then(data => {
      cxcCache.set(key, { status: "ready", data });
    })
    .catch(() => {
      cxcCache.set(key, { status: "error" });
    })
    .finally(() => {
      cxcInFlight.delete(key);
      notifyCxc(key);
    });
}

/** Hook que retorna el aging del cliente, disparando fetch al montar si
 *  no está en cache. Re-renderiza cuando llega data. */
function useCxcAging(codigo: string, empresaScope: string): CxcState {
  const key = `${codigo}|${empresaScope}`;
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeCxc(key, () => setTick(t => t + 1));
    fetchCxcAging(codigo, empresaScope);
    return unsubscribe;
  }, [codigo, empresaScope, key]);

  return cxcCache.get(key) ?? { status: "loading" };
}

interface ClienteHoverCardProps {
  nombre: string;
  /** Switch Soft código, ej. "D-04" — visible en el subtítulo */
  codigo: string;
  /** Empresa display name, ej. "Vistana International" — visible en el subtítulo */
  empresa: string;
  /** Filtro empresa actual del ClientesView ("todas" o key específica).
   *  Define el scope del fetch CXC: empresa específica → solo esa, "todas" →
   *  suma cross-empresa. */
  empresaScope: string;
  /** Historial mensual cacheado en parent. idle = aún no triggered */
  historial: HistorialState;
  /** Trigger lazy load del histórico — fires once on mount. Padre dedupea. */
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
  empresaScope,
  historial,
  onFirstHover,
}: ClienteHoverCardProps) {
  useEffect(() => {
    onFirstHover();
    // Una sola vez al montar — el padre dedupea por (codigo + empresaKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cxc = useCxcAging(codigo, empresaScope);

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

      {/* Detalles: recurrencia (última compra vive en la columna de la fila) */}
      <div className="space-y-2 border-t border-stone-100 pt-3 text-xs">
        <DetailRow
          label="Recurrencia"
          value={ready
            ? `${ready.meses_activos} de 12 meses · ${recurrenciaLabel(ready.meses_activos)}`
            : null}
          loading={histLoading}
        />
      </div>
    </div>
  );
}

/** Chip CXC info-only. Cuando hay saldo, expone SIEMPRE los 3 buckets
 *  (0-90, 91-120, 121+) — incluso si alguno es $0 — para que la vista de
 *  cara al cliente sea consistente y comparable entre filas. El label
 *  semántico ("Al día" / "Cuentas pendientes" / "Atención") deriva del
 *  bucket más severo con saldo > 0.
 *
 *  Errores se silencian (no se renderiza el chip) para no romper el card. */
function CxcChip({ state }: { state: CxcState }) {
  if (state.status === "loading") {
    return <div className="h-5 w-56 animate-pulse rounded bg-stone-100" />;
  }
  if (state.status === "error") {
    return null;
  }
  const { saldo_total, monto_0_90, monto_91_120, monto_121_plus } = state.data;

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
    <div className={cn(
      "inline-flex flex-wrap items-center gap-x-1.5 rounded px-2 py-1 text-[11px] font-medium leading-tight",
      cls
    )}>
      <span>{label}</span>
      <span aria-hidden className="opacity-50">·</span>
      <span>0-90 <span className="font-mono tabular-nums">{fmtBucketK(monto_0_90)}</span></span>
      <span aria-hidden className="opacity-50">·</span>
      <span>91-120 <span className="font-mono tabular-nums">{fmtBucketK(monto_91_120)}</span></span>
      <span aria-hidden className="opacity-50">·</span>
      <span>121+ <span className="font-mono tabular-nums">{fmtBucketK(monto_121_plus)}</span></span>
    </div>
  );
}

/** Redondeo a "k" para los buckets del chip:
 *  $0 → "$0", $500 → "$500", $113000 → "$113k", $216509 → "$217k".
 *  Bajo $1000 mantiene unidades; ≥$1000 redondea a miles enteros. */
function fmtBucketK(n: number): string {
  if (n <= 0) return "$0";
  if (n < 1000) return `$${Math.round(n)}`;
  return `$${Math.round(n / 1000)}k`;
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
