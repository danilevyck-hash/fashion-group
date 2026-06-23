"use client";

// Chip de frescura "datos de hace X · sin conexión" (Modo viaje — Fase 1).
//
// SIEMPRE visible cuando hay un timestamp (online y offline). Muestra qué tan
// viejo es el dato que se está viendo. Agrega "· sin conexión" cuando no hay
// red. En vistas financieras (financial), si el snapshot pasa de 24h se pone
// ROJO — nunca mostrar cifras financieras viejas como si fueran frescas.

import { useEffect, useState } from "react";
import { useOnline } from "@/lib/OnlineContext";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatAgo(ts: number): string {
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const hr = Math.floor(diffMin / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  return `hace ${d} d`;
}

interface FreshnessChipProps {
  /** Timestamp (ms) del snapshot que se está mostrando. null = aún sin dato → no renderiza. */
  ts: number | null;
  /** true cuando el dato viene del cache (no se pudo refrescar de la red). */
  fromCache?: boolean;
  /** Vista financiera: si el snapshot pasa de 24h, el chip se pone rojo. */
  financial?: boolean;
  className?: string;
}

export default function FreshnessChip({ ts, fromCache = false, financial = false, className = "" }: FreshnessChipProps) {
  const online = useOnline();
  const [, setTick] = useState(0);

  // Re-render cada 60s para mantener "hace X" al día sin recargar.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (ts == null) return null;

  const stale = financial && Date.now() - ts > DAY_MS; // financiero >24h → rojo
  const label = `datos de ${formatAgo(ts)}${online ? "" : " · sin conexión"}`;

  const tone = stale
    ? "bg-red-50 text-red-700 border-red-200"
    : fromCache || !online
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-gray-50 text-gray-500 border-gray-200";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${tone} ${className}`}
      title={new Date(ts).toLocaleString("es-PA")}
    >
      {(stale || !online) && (
        <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-red-500" : "bg-amber-500"}`} />
      )}
      {label}
    </span>
  );
}
