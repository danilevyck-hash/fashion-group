"use client";

// Shell del módulo de primer nivel Multifashion (/multifashion). Antes era un
// tab dentro de Ventas; ahora vive solo. Tiene su PROPIO selector de año (el
// año global de Ventas no aplica aquí). El MES y los sub-tabs los maneja
// MultifashionView (selector único de mes + flechas ‹ ›, PR #25) — este shell
// solo provee año + data overview y delega el resto.
//
// Gate admin-only vía useAuth (mismo patrón que /admin). Permisos de los demás
// roles se definen después.

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultifashionView } from "@/components/multifashion/MultifashionView";
import type { Multifashion } from "@/components/ventas/types";

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

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [multi, setMulti] = useState<Multifashion | null>(initialMulti);
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Cambio de año: refetch SOLO del overview de Multifashion. Los sub-tabs
  // (Detalle mensual / Vendedoras / Clientes) hacen su propio refetch al
  // recibir el nuevo selectedYear como prop vía MultifashionView.
  const onYearChange = useCallback(async (year: number) => {
    if (year === selectedYear) return;
    setSelectedYear(year);
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/multifashion/overview?year=${year}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Multifashion;
      startTransition(() => setMulti(data));
    } catch (err) {
      console.error("[multifashion] year change refetch failed", err);
      setFetchError(err instanceof Error ? err.message : "error inesperado");
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  if (!authChecked) return null;

  const isClosedYear = selectedYear < currentYear;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
      <header className="relative z-20 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
            Multifashion
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            Retail tienda física · año fiscal {selectedYear}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Deep-link al tab Productos de Ventas con Multifashion preseleccionado.
              No duplica la tabla: reusa Ventas → Productos. */}
          <Link
            href="/ventas?tab=productos&empresa=american_classic"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition hover:bg-stone-50 active:scale-[0.97]"
          >
            <Package className="h-3.5 w-3.5" /> Top productos
          </Link>
          <Select value={String(selectedYear)} onValueChange={v => onYearChange(parseInt(v, 10))}>
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
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center">
          <p className="text-sm text-stone-700">
            No se pudieron cargar los datos de <strong>Multifashion</strong>.
          </p>
          <p className="mt-1 text-xs text-stone-500">Intenta recargar en unos segundos.</p>
        </div>
      )}
    </main>
  );
}
