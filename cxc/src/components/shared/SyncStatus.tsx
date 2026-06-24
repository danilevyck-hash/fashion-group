"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <SyncStatus />
//
// Indicador compartido de frescura del sync de Switch (switch_facturas o
// switch_estadocuenta). Se renderiza hoy en:
//   - Panel CXC (variant="block", tabla="estadocuenta", 6 B2B)
//   - Resumen de Ventas (variant="pill", tabla="facturas", 3 empresas)
//
// Lee /api/sync-status. Muestra el timestamp más reciente del sync (en TZ
// Panamá, formato "30 may 2026, 1:45 a. m.") y, si alguna empresa esperada
// tiene su último sync hace >26h o no tiene filas, agrega una línea de
// warning con el detalle por empresa.
//
// Cuando todas las empresas están al día, el warning se omite.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

export type SyncTable = "facturas" | "estadocuenta";

interface StaleEntry {
  empresa: string;
  last_synced_at: string | null;
}

interface SyncStatusData {
  last_global: string | null;
  stale: StaleEntry[];
}

interface SyncStatusProps {
  tabla: SyncTable;
  empresasEsperadas: readonly string[];
  empresaLabels: Record<string, string>;
  variant?: "block" | "pill";
  prefix?: string;
  className?: string;
}

const TS_FMT = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const DATE_FMT = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama",
  day: "numeric",
  month: "short",
});

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return TS_FMT.format(d).replace(/\./g, "");
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_FMT.format(d).replace(/\./g, "");
}

function buildWarning(stale: StaleEntry[], empresaLabels: Record<string, string>): string | null {
  if (stale.length === 0) return null;
  const parts = stale.map((s) => {
    const label = empresaLabels[s.empresa] ?? s.empresa;
    if (!s.last_synced_at) return `${label} sin datos`;
    return `${label} sin actualizar desde ${fmtShortDate(s.last_synced_at)}`;
  });
  return `⚠️ ${parts.join(" · ")}`;
}

export default function SyncStatus({
  tabla,
  empresasEsperadas,
  empresaLabels,
  variant = "block",
  prefix,
  className,
}: SyncStatusProps) {
  const [data, setData] = useState<SyncStatusData | null>(null);
  const [error, setError] = useState(false);

  const empresasKey = empresasEsperadas.join(",");

  useEffect(() => {
    let cancelled = false;
    const url = `/api/sync-status?tabla=${tabla}&empresas=${empresasKey}`;

    // Mismo fetch de siempre, extraído para poder re-disparar. No cambia el
    // endpoint ni la lógica de stale — solo permite re-consultar.
    const fetchStatus = () => {
      fetch(url, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((json: SyncStatusData) => {
          if (cancelled) return;
          setData(json);
          setError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setError(true);
        });
    };

    fetchStatus(); // inicial al montar

    // (a) Re-fetch cuando la pestaña vuelve a tener foco — cubre el caso
    //     "disparé un sync y volví a la pestaña": el banner se actualiza solo.
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchStatus);

    // (b) Polling cada 5 min, solo mientras la pestaña está visible (no gasta
    //     requests en background).
    const POLL_MS = 5 * 60 * 1000;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchStatus();
    }, POLL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchStatus);
      clearInterval(interval);
    };
  }, [tabla, empresasKey]);

  if (error || !data) return null;

  const tsLabel = data.last_global ? fmtTimestamp(data.last_global) : "sin datos";
  const labelPrefix = prefix ?? "Actualizado:";
  const mainLabel = data.last_global ? `${labelPrefix} ${tsLabel}` : `${labelPrefix} sin datos`;
  const warning = buildWarning(data.stale, empresaLabels);

  if (variant === "pill") {
    return (
      <span className={className}>
        <span
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-600"
          title={warning ?? undefined}
        >
          <Calendar className="h-3 w-3 text-gray-400" />
          {mainLabel}
        </span>
        {warning && (
          <span className="basis-full mt-1 block text-xs text-amber-600" role="status">
            {warning}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={className} aria-live="polite">
      <p className="text-xs text-gray-500">{mainLabel}</p>
      {warning && (
        <p className="mt-0.5 text-xs text-amber-600" role="status">
          {warning}
        </p>
      )}
    </div>
  );
}
