"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Shell del módulo Multifashion (/multifashion).
//
// 🔴 EL MÓDULO SE LLAMA MULTIFASHION EN TODOS LADOS (6-sep-2026). Daniel,
// textual: *«multifashion en todos lados»*. El menú ya decía Multifashion y el
// título de la pantalla decía «American Classics» (el nombre comercial que
// guarda `app_settings.multifashion_tienda`): ese título es el que cambia. La
// ruta `/multifashion` y la clave interna `american_classic` NO se tocan — la
// tienda sigue siendo constante del servidor y nunca se lee de la URL.
//
// 🩸 EL ENCABEZADO DEL TELÉFONO PASÓ DE SEIS BLOQUES A TRES. Medido sobre la
// captura de Daniel: antes de la primera cifra se pasaban ONCE bloques y una
// pantalla entera de scroll — nombre de la tienda, píldora «Sincronizado …»,
// botón «Actualizar ahora», selector de año, la tarjeta «Hoy» de cuatro
// renglones y recién ahí las pestañas. Quedan tres:
//
//   1. título + período   (un solo desplegable: ver `lib/multifashion/periodo.ts`)
//   2. la línea de hoy    (`VentaHoyCard`, ahora de una línea)
//   3. las pestañas
//
// «Sincronizado …» y «Actualizar ahora» se fueron al menú ☰ en el teléfono
// (`AppHeader acciones=`); en el escritorio, donde sobra ancho, se quedan a la
// vista. ⚠️ El botón conserva su gate de rol y su acelerador: no cambió QUIÉN lo
// puede tocar ni cada cuánto, cambió dónde está.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { opcionesDelServidor, useSembrarDelServidor } from "@/lib/swr-servidor";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import AppHeader from "@/components/AppHeader";
import { PullToRefresh } from "@/components/ui";
import { MultifashionView } from "@/components/multifashion/MultifashionView";
import { PeriodoSelect } from "@/components/multifashion/PeriodoSelect";
import { VentaHoyCard } from "@/components/multifashion/VentaHoyCard";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { resolverTabMultifashion, type TabMultifashion } from "@/lib/multifashion/pestanas";
import {
  ajustarPeriodo, anioDelPeriodo, etiquetaPeriodo, opcionesPeriodo, periodoAUrl,
  periodoDesdeUrl, periodoPorDefecto, type CortePeriodo, type Periodo,
} from "@/lib/multifashion/periodo";
import type { Multifashion } from "@/components/ventas/types";

// Fetcher puro del overview por año. SWR lo cachea por año → volver a un año ya
// visto pinta al instante y revalida en background.
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
  // Mientras no esté chequeado no renderizamos contenido para no parpadear
  // data a un rol sin acceso (useAuth redirige si no pasa).
  // 🔴 La lista se LEE de `acceso.ts` (derivada de `modules.ts`), nunca se
  // escribe acá: era la única copia a mano que quedaba (11-sep-2026).
  const { authChecked } = useAuth({ moduleKey: "multifashion", allowedRoles: ROLES_MULTIFASHION });

  // 🔴 El corte es el mes de PANAMÁ (UTC−5 fijo), no el del navegador: es la
  // misma regla de borde de mes de todo el módulo.
  const corte: CortePeriodo = useMemo(() => {
    const hoy = hoyPanama();
    return { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
  }, []);

  // Pestaña y período: los dos en la URL, los dos filtros del MISMO nivel
  // (`replace`, no ciclan el back). `?subtab=` viejo redirige y la basura cae en
  // Resumen, nunca en una pantalla en blanco.
  const [subtabRaw, setSubtabRaw] = useUrlState("subtab", "resumen");
  const tab: TabMultifashion = resolverTabMultifashion(subtabRaw).tab;

  const [periodoRaw, setPeriodoRaw] = useUrlState("mfPeriodo", "");
  const periodoPedido: Periodo = periodoDesdeUrl(periodoRaw) ?? periodoPorDefecto(corte);
  // Un período que la pestaña no sabe servir cae a SU MES — nunca a otra cosa
  // en silencio (ver la nota de `periodo.ts`).
  const periodo = ajustarPeriodo(periodoPedido, tab, corte);

  const selectedYear = anioDelPeriodo(periodo, corte);
  const currentYear = corte.anio;
  const años = availableYears.length > 0 ? availableYears : [currentYear];

  // Señal de "acabo de sincronizar": el botón la incrementa y el tab Resumen la
  // usa para re-pedir el detalle del mes.
  const [syncTick, setSyncTick] = useState(0);

  // Lo que ya armó el server component, SOLO para el año inicial.
  const delServidor = useMemo<Multifashion | undefined>(
    () => (selectedYear === initialYear ? (initialMulti ?? undefined) : undefined),
    [selectedYear, initialYear, initialMulti],
  );

  const { data: multi, error, isLoading, mutate } = useSWR<Multifashion>(
    authChecked ? ["multifashion-overview", selectedYear] : null,
    () => fetchOverview(selectedYear),
    {
      dedupingInterval: 5 * 60_000,
      revalidateOnFocus: false,
      ...opcionesDelServidor(delServidor),
    },
  );

  useSembrarDelServidor(mutate, delServidor);

  const loading = isLoading && !multi;
  const fetchError = error && !multi ? (error instanceof Error ? error.message : "error inesperado") : null;

  // Los meses con dato del año que se está mirando: el desplegable no ofrece un
  // mes en el que la tienda no vendió nada. De los OTROS años se ofrecen todos
  // (el overview de ese año todavía no se pidió) y la lista se afina sola al
  // cambiar de año.
  const mesesConDato = useMemo<Record<number, number[]> | undefined>(() => {
    if (!multi) return undefined;
    const conDato: number[] = [];
    multi.retail.meses.forEach((m, i) => {
      if (m.tickets > 0 || m.ventas > 0) conDato.push(i + 1);
    });
    return conDato.length > 0 ? { [selectedYear]: conDato } : undefined;
  }, [multi, selectedYear]);

  const opciones = useMemo(
    () => opcionesPeriodo({ tab, anios: años, corte, mesesConDato }),
    [tab, años, corte, mesesConDato],
  );

  const onPeriodo = useCallback((valor: string) => setPeriodoRaw(valor), [setPeriodoRaw]);
  const onTab = useCallback((t: TabMultifashion) => setSubtabRaw(t), [setSubtabRaw]);

  // Las dos acciones de sync: en el teléfono viven en el menú ☰; desde `md`
  // están a la vista en el encabezado. El componente es el MISMO en los dos
  // lados — el gate de rol y el acelerador viven adentro de SyncNowButton.
  const accionesSync = (
    <div className="flex flex-wrap items-center gap-2">
      <SyncStatus
        tabla="facturas"
        empresasEsperadas={["american_classic"]}
        empresaLabels={EMPRESA_KEY_TO_NAME}
        variant="pill"
        prefix="Sincronizado"
      />
      {/* 🩸 Sin `roles` el botón usaba su default (admin + secretaria) y
          Jennifer —cuyo ÚNICO módulo es este— no tenía «Actualizar ahora»
          (11-sep-2026). Los roles son los del módulo. */}
      <SyncNowButton
        opciones={[{ modulo: "facturas", empresa: "american_classic" }]}
        roles={ROLES_MULTIFASHION}
        onSuccess={async () => {
          await mutate();
          setSyncTick((t) => t + 1);
        }}
      />
    </div>
  );

  if (!authChecked) return null;

  const isClosedYear = selectedYear < currentYear;

  return (
    <>
    {/* Único chrome en móvil (drawer/búsqueda/logout/notifs) — el Sidebar es
        desktop-only. Para gerente_acs (módulo único, PWA) es su ÚNICA salida. */}
    <AppHeader module="Multifashion" acciones={accionesSync} />
    <PullToRefresh onRefresh={async () => { await mutate(); }}>
    <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
      {/* Bloque 1 de 3: título + período. */}
      <header className="relative z-20 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* El h1 sigue siendo `sr-only` (invariante de la casa: el título
              grande se podó en toda la app y lo dicen la barra sticky y el
              breadcrumb). Lo que se ve al lado es el NOMBRE DEL MÓDULO, que
              hasta el 6-sep-2026 decía «American Classics» — el nombre comercial
              de `app_settings.multifashion_tienda`. Daniel: *«multifashion en
              todos lados»*. El ajuste vive únicamente acá. */}
          <h1 className="sr-only">Multifashion</h1>
          <p className="text-sm font-medium text-gray-700">Multifashion</p>
          {/* Escritorio: la frescura y «Actualizar ahora», a la vista. En el
              teléfono viven en el menú ☰ (ver arriba). */}
          <div className="hidden md:block">{accionesSync}</div>
        </div>
        <PeriodoSelect
          valor={periodoAUrl(periodo)}
          opciones={opciones}
          onChange={onPeriodo}
          disabled={loading}
        />
      </header>

      {/* Bloque 2 de 3: la venta de hoy, en UNA línea. */}
      <VentaHoyCard syncTick={syncTick} habilitado={authChecked} />

      {fetchError && (
        <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo actualizar {etiquetaPeriodo(periodo).toLowerCase()}: {fetchError}
        </div>
      )}

      {/* Bloque 3 de 3: las pestañas y su contenido. */}
      {multi ? (
        <MultifashionView
          data={multi}
          tab={tab}
          onTabChange={onTab}
          periodo={periodo}
          corte={corte}
          isClosedYear={isClosedYear}
          syncTick={syncTick}
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
