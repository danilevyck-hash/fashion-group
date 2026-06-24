"use client";

// Shell del módulo de primer nivel Multifashion (/multifashion). Antes era un
// tab dentro de Ventas; ahora vive solo. Tiene su PROPIO selector de año (el
// año global de Ventas no aplica aquí). El MES y los sub-tabs los maneja
// MultifashionView (selector único de mes + flechas ‹ ›, PR #25) — este shell
// solo provee año + data overview y delega el resto.
//
// Gate admin-only vía useAuth (mismo patrón que /admin). Permisos de los demás
// roles se definen después.

import { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultifashionView } from "@/components/multifashion/MultifashionView";
import type { Multifashion } from "@/components/ventas/types";

// Fetcher puro del overview por año. Misma llamada que tenía el onYearChange
// (cache:"no-store"); SWR la cachea por año → volver a un año ya visto pinta al
// instante y revalida en background, en vez del refetch desde cero anterior.
async function fetchOverview(year: number): Promise<Multifashion> {
  const res = await fetch(`/api/multifashion/overview?year=${year}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Multifashion;
}

interface MultifashionShellProps {
  year: number;
  availableYears: number[];
  multi: Multifashion | null;
}

export function MultifashionShell({
  year: initialYear,
  availableYears,
  multi: initialMulti,
}: MultifashionShellProps) {
  const currentYear = new Date().getFullYear();
  // Gate admin-only. Mientras no esté chequeado no renderizamos contenido para
  // no parpadear data a un rol sin acceso (useAuth redirige si no pasa).
  const { authChecked } = useAuth({ moduleKey: "multifashion", allowedRoles: ["admin"] });

  // El año es estado de UI local (no data de SWR): cambia la KEY del overview.
  const [selectedYear, setSelectedYear] = useState(initialYear);

  // Overview por año vía SWR (clave null hasta authChecked → respeta el gate
  // admin-only). fallbackData = el SSR SOLO para el año inicial; los demás años
  // se piden bajo demanda. Cambiar el selector solo cambia la key (sin fetch
  // manual): SWR sirve caché si ya se vio ese año y revalida en background.
  const { data: multi, error, isLoading } = useSWR<Multifashion>(
    authChecked ? ["multifashion-overview", selectedYear] : null,
    () => fetchOverview(selectedYear),
    {
      dedupingInterval: 5 * 60_000,
      revalidateOnFocus: false,
      fallbackData: selectedYear === initialYear ? (initialMulti ?? undefined) : undefined,
    },
  );

  // Deshabilita el selector mientras carga un año sin dato en caché.
  const loading = isLoading && !multi;
  const fetchError = error && !multi ? (error instanceof Error ? error.message : "error inesperado") : null;

  if (!authChecked) return null;

  const isClosedYear = selectedYear < currentYear;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
      <header className="relative z-20 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-gray-950 md:text-4xl">
            Multifashion
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Retail tienda física · año fiscal {selectedYear}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v, 10))}>
            <SelectTrigger className="h-9 w-auto min-w-[88px] gap-1.5 text-xs font-mono tabular-nums" disabled={loading}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(y => (
                <SelectItem key={y} value={String(y)} className="font-mono tabular-nums">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {fetchError && (
        <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo actualizar el año: {fetchError}
        </div>
      )}

      {multi ? (
        <MultifashionView data={multi} selectedYear={selectedYear} isClosedYear={isClosedYear} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-700">
            No se pudieron cargar los datos de <strong>Multifashion</strong>.
          </p>
          <p className="mt-1 text-xs text-gray-500">Intenta recargar en unos segundos.</p>
        </div>
      )}
    </main>
  );
}
