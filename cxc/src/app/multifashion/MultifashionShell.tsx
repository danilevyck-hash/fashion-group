"use client";

// Shell del módulo de primer nivel Multifashion (/multifashion). Antes era un
// tab dentro de Ventas; ahora vive solo. Tiene su PROPIO selector de año (el
// año global de Ventas no aplica aquí). El MES y los sub-tabs los maneja
// MultifashionView (selector único de mes + flechas ‹ ›, PR #25) — este shell
// solo provee año + data overview y delega el resto.
//
// Gate vía useAuth (mismo patrón que /admin): admin + gerente_acs (Jennifer).
// gerente_acs va explícito en allowedRoles — sin eso dependía del fallback
// fg_modules de sessionStorage y un load frío podía rebotarla a /home, que la
// re-redirige aquí (loop).

import { useMemo, useState } from "react";
import useSWR from "swr";
import { opcionesDelServidor, useSembrarDelServidor } from "@/lib/swr-servidor";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import { PullToRefresh } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultifashionView } from "@/components/multifashion/MultifashionView";
import { VentaHoyCard } from "@/components/multifashion/VentaHoyCard";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { esRolAcotado } from "@/lib/multifashion/ventana-gerente";
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
  // Mientras no esté chequeado no renderizamos contenido para no parpadear
  // data a un rol sin acceso (useAuth redirige si no pasa).
  const { authChecked, role } = useAuth({ moduleKey: "multifashion", allowedRoles: ["admin", "gerente_acs"] });

  // Ventana acotada (gerente_acs): mes en curso + mismo mes del año pasado. Acá
  // solo se DIBUJA menos — el candado real vive en /api/multifashion/* (ver
  // src/lib/multifashion/ventana-gerente.ts). Esconder controles no cierra nada:
  // es exactamente el error que ya se cometió en Catálogos (CLAUDE.md).
  const ventanaAcotada = esRolAcotado(role);
  const añosVisibles = ventanaAcotada
    ? availableYears.filter(y => y === currentYear || y === currentYear - 1)
    : availableYears;
  const años = añosVisibles.length > 0 ? añosVisibles : [currentYear];

  // El año es estado de UI local (no data de SWR): cambia la KEY del overview.
  const [selectedYear, setSelectedYear] = useState(initialYear);
  // Señal de "acabo de sincronizar": el botón del header la incrementa y el tab
  // Resumen la usa para re-pedir el detalle del mes (mismos year/mes).
  const [syncTick, setSyncTick] = useState(0);

  // Lo que ya armó el server component, SOLO para el año inicial.
  const delServidor = useMemo<Multifashion | undefined>(
    () => (selectedYear === initialYear ? (initialMulti ?? undefined) : undefined),
    [selectedYear, initialYear, initialMulti],
  );

  // Overview por año vía SWR (clave null hasta authChecked → respeta el gate
  // admin-only). El dato del SSR es el del año inicial; los demás años se piden
  // bajo demanda. Cambiar el selector solo cambia la key (sin fetch manual):
  // SWR sirve caché si ya se vio ese año y revalida en background.
  //
  // 🔑 `opcionesDelServidor` evita re-pedir `/api/multifashion/overview` (618 ms
  // medidos) apenas llega el HTML que el servidor acaba de armar con ESE MISMO
  // dato. Ojo con la key `null` de `authChecked`: mientras la key es null SWR ni
  // siquiera monta el efecto, así que al activarse sigue siendo "primer montaje"
  // y la opción que apaga la revalidación inicial aplica igual.
  const { data: multi, error, isLoading, mutate } = useSWR<Multifashion>(
    authChecked ? ["multifashion-overview", selectedYear] : null,
    () => fetchOverview(selectedYear),
    {
      dedupingInterval: 5 * 60_000,
      revalidateOnFocus: false,
      ...opcionesDelServidor(delServidor),
    },
  );

  // Que un render nuevo del servidor gane sobre lo que quedó en caché (sin red).
  useSembrarDelServidor(mutate, delServidor);

  // Deshabilita el selector mientras carga un año sin dato en caché.
  const loading = isLoading && !multi;
  const fetchError = error && !multi ? (error instanceof Error ? error.message : "error inesperado") : null;

  if (!authChecked) return null;

  const isClosedYear = selectedYear < currentYear;

  return (
    <>
    {/* Único chrome en móvil (drawer/búsqueda/logout/notifs) — el Sidebar es
        desktop-only. Para gerente_acs (módulo único, PWA) es su ÚNICA salida. */}
    <AppHeader module="Multifashion" />
    <PullToRefresh onRefresh={async () => { await mutate(); }}>
    <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
      <header className="relative z-20 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Sin título grande: "Multifashion" ya lo dicen la barra sticky
              (celular) y el breadcrumb (escritorio). Queda sr-only para no
              dejar la página sin encabezado. */}
          <h1 className="sr-only">Multifashion</h1>
          {/* Nombre comercial de la tienda + frescura del sync + "Actualizar
              ahora". Antes vivían en una card de identidad dentro del tab
              Resumen; acá se ven desde cualquier sub-tab y sin repetir el
              bloque. El nombre se conserva porque el módulo se llama
              Multifashion pero la tienda se conoce por su nombre comercial. */}
          {multi?.tienda && (
            <p className="text-sm font-medium text-gray-700">{multi.tienda}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <SyncStatus
              tabla="facturas"
              empresasEsperadas={["american_classic"]}
              empresaLabels={EMPRESA_KEY_TO_NAME}
              variant="pill"
              prefix="Sincronizado"
            />
            {/* gerente_acs NO lo ve — el gate de rol vive en SyncNowButton. Un
                clic = sync de facturas de american_classic (mismo candado y
                cooldown del endpoint). Al terminar se revalida el overview y
                sube syncTick para que el Resumen re-pida el detalle del mes;
                SyncStatus se refresca solo (evento focus). */}
            <SyncNowButton
              opciones={[{ modulo: "facturas", empresa: "american_classic" }]}
              onSuccess={async () => {
                await mutate();
                setSyncTick((t) => t + 1);
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* iPhone: el trigger medía 88×36. h-11 = 44px exactos (regla táctil),
              igual que el selector de mes de MultifashionView, que ya iba en 44. */}
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v, 10))}>
            <SelectTrigger className="h-11 w-auto min-w-[88px] gap-1.5 text-xs font-mono tabular-nums" disabled={loading}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {años.map(y => (
                <SelectItem key={y} value={String(y)} className="font-mono tabular-nums">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Venta del día — lo PRIMERO que se ve, arriba de los sub-tabs y del
          selector de mes: es la pregunta con la que se abre el módulo. Se pide
          aparte del overview (que es anual y pesado) para que aparezca sin
          esperarlo, y se re-pide tras un "Actualizar ahora". No se le pasa
          `ventanaAcotada`: "hoy" está dentro de la ventana de gerente_acs, y
          el recorte real de los comparativos lo hace el servidor. */}
      <VentaHoyCard syncTick={syncTick} habilitado={authChecked} />

      {fetchError && (
        <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo actualizar el año: {fetchError}
        </div>
      )}

      {multi ? (
        <MultifashionView
          data={multi}
          selectedYear={selectedYear}
          isClosedYear={isClosedYear}
          syncTick={syncTick}
          ventanaAcotada={ventanaAcotada}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-700">
            No se pudieron cargar los datos de <strong>Multifashion</strong>.
          </p>
          <p className="mt-1 text-xs text-gray-500">Intenta recargar en unos segundos.</p>
        </div>
      )}
    </main>
    </PullToRefresh>
    </>
  );
}
