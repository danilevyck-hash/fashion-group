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
  data_coverage_last: string | null;
  data_coverage_age_days: number | null;
  data_coverage_label: string;
}

export interface FreshnessIndicatorProps {
  cxc: ModuleFreshness | null;
  ventas: ModuleFreshness | null;
  loading?: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, warning: 1, danger: 2 };

// Si la cobertura quedó atrasada más de 3 días respecto al upload, esa parte
// se pinta en amber para señalar el desfase entre "cuándo subí el CSV" vs
// "hasta qué fecha contiene data". Patrón típico: el CSV de Switch se
// descarga días después del cierre.
const COVERAGE_LAG_WARNING_DAYS = 3;

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

// "hasta 9 may" — sin año, más compacto para la línea 2 de cobertura.
// Para el year completo, ver el tooltip (data_coverage_label del backend).
function fmtCoverageShort(iso: string | null): string {
  if (!iso) return "sin datos";
  const datePart = iso.length >= 10 ? iso.slice(0, 10) : iso;
  try {
    const formatted = new Date(datePart + "T12:00:00")
      .toLocaleDateString("es-PA", { day: "numeric", month: "short" })
      .replace(".", "");
    return `hasta ${formatted}`;
  } catch {
    return `hasta ${datePart}`;
  }
}

// Diferencia entre fecha de upload y fecha de cobertura (días). Devuelve
// null si falta cualquiera de las dos. Usa solo la parte YYYY-MM-DD para
// evitar ruido de horario (un upload a las 23:59 con cobertura del mismo
// día no debe contar como 1 día de lag).
function coverageLagDays(uploadIso: string | null, coverageIso: string | null): number | null {
  if (!uploadIso || !coverageIso) return null;
  const upDay = new Date(uploadIso.slice(0, 10) + "T12:00:00").getTime();
  const covDay = new Date(coverageIso.slice(0, 10) + "T12:00:00").getTime();
  return Math.max(0, Math.floor((upDay - covDay) / (1000 * 60 * 60 * 24)));
}

interface CoveragePartProps {
  label: string;
  module: ModuleFreshness | null;
}

function CoveragePart({ label, module }: CoveragePartProps) {
  const lag = coverageLagDays(module?.last_update ?? null, module?.data_coverage_last ?? null);
  const isLagged = lag !== null && lag > COVERAGE_LAG_WARNING_DAYS;
  const partColor = isLagged ? "text-amber-600" : "";
  const partTooltip = isLagged ? `Data atrasada respecto al upload (${lag} días)` : undefined;

  return (
    <span className={partColor} title={partTooltip}>
      <span>{label} </span>
      <span title={partTooltip ?? fmtTimestampPanama(module?.data_coverage_last ?? null)} className="cursor-default">
        {fmtCoverageShort(module?.data_coverage_last ?? null)}
      </span>
    </span>
  );
}

export default function FreshnessIndicator({ cxc, ventas, loading }: FreshnessIndicatorProps) {
  if (loading) {
    return (
      <div aria-live="polite">
        <p className="text-sm text-gray-400">Actualizado: cargando…</p>
      </div>
    );
  }

  if (!cxc && !ventas) return null;

  const severity = worstSeverity(cxc?.severity ?? "ok", ventas?.severity ?? "ok");
  const colorClass = colorForSeverity(severity);
  const containerTooltip = tooltipForSeverity(severity);

  return (
    <div
      aria-label={
        containerTooltip
          ? `Estado de actualización: ${containerTooltip}`
          : "Estado de actualización"
      }
    >
      <p className={`text-sm ${colorClass}`} title={containerTooltip}>
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
      <p className="text-xs text-stone-400">
        <span>Cobertura: </span>
        <CoveragePart label="CXC" module={cxc} />
        <span className="text-stone-300"> · </span>
        <CoveragePart label="Ventas" module={ventas} />
      </p>
    </div>
  );
}
