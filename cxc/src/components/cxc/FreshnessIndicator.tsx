"use client";

// TODO: replicar este indicador en:
// - Módulo Ventas (header)
// - Módulo Cheques (header)
// cuando se redesignen en sprint Claude Design.
// El componente FreshnessIndicator es reutilizable; solo
// necesita un endpoint /api/<modulo>/freshness por módulo.

import { fmtDate } from "@/lib/format";

export type Severity = "ok" | "warning" | "danger";

export interface ModuleFreshness {
  last_update: string | null;
  age_days: number | null;
  age_label: string;
  severity: Severity;
  source: "activity_logs" | "fallback_max_created_at" | null;
}

export interface FreshnessIndicatorProps {
  cxc: ModuleFreshness | null;
  ventas: ModuleFreshness | null;
  loading?: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, warning: 1, danger: 2 };

function worstSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function colorForSeverity(severity: Severity): string {
  if (severity === "danger") return "text-red-600";
  if (severity === "warning") return "text-amber-600";
  return "text-stone-500";
}

function tooltipForSeverity(severity: Severity): string | undefined {
  if (severity === "danger") return "Data desactualizada (>7 días)";
  if (severity === "warning") return "Considerá subir CSV reciente";
  return undefined;
}

function fmtTimestampPanama(iso: string | null): string {
  if (!iso) return "Sin data";
  try {
    return new Date(iso).toLocaleString("es-PA", {
      timeZone: "America/Panama",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtShort(last: string | null): string {
  if (!last) return "Sin data";
  // last_update viene como timestamptz ISO. fmtDate espera 'YYYY-MM-DD'.
  return fmtDate(last.slice(0, 10));
}

export default function FreshnessIndicator({ cxc, ventas, loading }: FreshnessIndicatorProps) {
  if (loading) {
    return (
      <p className="text-sm text-gray-400" aria-live="polite">
        Actualizado: cargando…
      </p>
    );
  }

  if (!cxc && !ventas) return null;

  const severity = worstSeverity(cxc?.severity ?? "ok", ventas?.severity ?? "ok");
  const colorClass = colorForSeverity(severity);
  const containerTooltip = tooltipForSeverity(severity);

  return (
    <p
      className={`text-sm ${colorClass}`}
      title={containerTooltip}
      aria-label={
        containerTooltip
          ? `Estado de actualización: ${containerTooltip}`
          : "Estado de actualización"
      }
    >
      <span className="text-gray-500">Actualizado: </span>
      <span>CXC </span>
      <span title={fmtTimestampPanama(cxc?.last_update ?? null)} className="cursor-default">
        {fmtShort(cxc?.last_update ?? null)}
      </span>
      <span className="text-gray-400"> · </span>
      <span>Ventas </span>
      <span title={fmtTimestampPanama(ventas?.last_update ?? null)} className="cursor-default">
        {fmtShort(ventas?.last_update ?? null)}
      </span>
    </p>
  );
}
