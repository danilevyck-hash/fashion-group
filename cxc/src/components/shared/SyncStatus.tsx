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

import { useEffect, useRef } from "react";
import { Calendar } from "lucide-react";
import { FRESCURA_VISIBLE_2026_10 } from "@/lib/ui/frescura";

import { useEstadoSync, type SyncTable } from "./useEstadoSync";
export type { SyncTable };

interface StaleEntry {
  empresa: string;
  last_synced_at: string | null;
}

interface SyncStatusProps {
  tabla: SyncTable;
  empresasEsperadas: readonly string[];
  empresaLabels: Record<string, string>;
  variant?: "block" | "pill";
  prefix?: string;
  className?: string;
  /** Aviso "alguna empresa sin actualizar" hacia afuera. Lo usa Comisiones, que
   *  guarda la frescura dentro de un popover ⓘ: sin esto, la advertencia solo
   *  se vería al abrirlo. Opcional — los demás llamadores no cambian. */
  onStale?: (stale: boolean) => void;
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

function buildWarning(
  // 🩸 Puede llegar AUSENTE. `/api/sync-status` siempre manda `stale`, pero este
  // componente pinta plata en el CXC (grupo y Boston) y en Ventas: si un día la
  // respuesta viniera sin el campo —un 200 de un proxy, una versión vieja
  // cacheada—, un `stale.length` sobre `undefined` tumbaba el render ENTERO y la
  // pantalla se quedaba en blanco. Se prefiere quedarse sin el aviso ámbar antes
  // que sin los números: el aviso es un extra, la cartera no.
  stale: StaleEntry[] | undefined,
  empresaLabels: Record<string, string>,
): string | null {
  if (!stale?.length) return null;
  const parts = stale.map((s) => {
    const label = empresaLabels[s.empresa] ?? s.empresa;
    if (!s.last_synced_at) return `${label} sin datos`;
    return `${label} sin actualizar desde ${fmtShortDate(s.last_synced_at)}`;
  });
  return `⚠️ ${parts.join(" · ")}`;
}

// La lectura de `/api/sync-status` (fetch compartido en vuelo, foco y sondeo)
// vive en `useEstadoSync.ts` desde el 4-oct-2026: la usa también
// `LineaDeFrescura`, y así un `vi.mock` de este archivo no la apaga.
export { useEstadoSync };

export default function SyncStatus({
  tabla,
  empresasEsperadas,
  empresaLabels,
  variant = "block",
  prefix,
  className,
  onStale,
}: SyncStatusProps) {
  const { data, error } = useEstadoSync(tabla, empresasEsperadas);

  // El callback puede no ser estable en el llamador; se lee por ref para que no
  // reinicie el fetch/polling de arriba.
  const onStaleRef = useRef(onStale);
  onStaleRef.current = onStale;
  useEffect(() => {
    onStaleRef.current?.((data?.stale?.length ?? 0) > 0);
  }, [data]);

  if (error || !data) return null;

  const tsLabel = data.last_global ? fmtTimestamp(data.last_global) : "sin datos";
  const labelPrefix = prefix ?? "Actualizado:";
  const mainLabel = data.last_global ? `${labelPrefix} ${tsLabel}` : `${labelPrefix} sin datos`;
  const warning = buildWarning(data.stale, empresaLabels);

  // 🔴 4-oct-2026 (`FRESCURA_VISIBLE_2026_10`): «Actualizado: 4 oct 2026, 1:45
  // am» y la pastilla con calendario eran OTRA forma de decir la frescura. La
  // hora la dice ahora `LineaDeFrescura`; aquí queda solo el aviso de la
  // empresa sin actualizar, que es un aviso y va aparte.
  if (FRESCURA_VISIBLE_2026_10) {
    return warning ? (
      <p className={`text-xs text-amber-600 ${className ?? ""}`} role="status">
        {warning}
      </p>
    ) : null;
  }

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
