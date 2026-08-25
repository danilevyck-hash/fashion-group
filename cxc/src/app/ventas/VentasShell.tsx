"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { opcionesDelServidor, useSembrarDelServidor } from "@/lib/swr-servidor";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, Contact, Package, Percent } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import dynamic from "next/dynamic";
import { exportResumenToExcel } from "@/lib/ventas/excel";
import { PullToRefresh } from "@/components/ui";
import AppHeader from "@/components/AppHeader";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import { fetchJsonWithRetry, describeFetchError } from "@/lib/fetch-retry";
import type { VentasResumen, Clientes, Multifashion } from "@/components/ventas/types";

// Tabs cargados LAZY: cada vista va en su propio chunk y solo se descarga al
// activarse su tab → fuera del bundle inicial de /ventas. Skeleton mientras
// carga. Mismo patrón que multifashion (recharts vía next/dynamic, ssr:false).
function TabSkeleton() {
  return (
    <div className="mt-5 space-y-3" aria-hidden>
      <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-gray-100" />
    </div>
  );
}
const ResumenView = dynamic(
  () => import("@/components/ventas/ResumenView").then((m) => m.ResumenView),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ClientesView = dynamic(
  () => import("@/components/ventas/ClientesView").then((m) => m.ClientesView),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ProductosView = dynamic(
  () => import("@/components/ventas/ProductosView").then((m) => m.ProductosView),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const UtilidadView = dynamic(
  () => import("@/components/ventas/UtilidadView").then((m) => m.UtilidadView),
  { ssr: false, loading: () => <TabSkeleton /> },
);

// Bundle del tab Resumen: las 3 lecturas que dependen del año seleccionado.
//
// CADA LECTURA ES INDEPENDIENTE. Antes las 3 iban en un Promise.all que rechazaba
// si CUALQUIERA fallaba, así que un 500 transitorio en /api/multifashion/overview
// (que aquí solo alimenta el indicador de mayoreo de una fila) tumbaba el tab
// Resumen entero con "No se pudieron cargar los datos de resumen". Ahora cada
// endpoint guarda su propio error y solo apaga lo suyo.
interface VentasBundle {
  resumen: VentasResumen | null;
  clientes: Clientes | null;
  multi: Multifashion | null;
  resumenError: string | null;
  clientesError: string | null;
}

// Fetcher keyed por año. NUNCA rechaza: reintenta cada endpoint por separado
// (fetchJsonWithRetry, 3 intentos con backoff corto — los timeouts de statement
// de Postgres en caché fría se curan solos al segundo intento) y devuelve lo que
// haya logrado traer. Lo que falló definitivamente viaja como mensaje.
async function fetchVentasBundle(year: number): Promise<VentasBundle> {
  const settle = async <T,>(p: Promise<T>): Promise<[T, null] | [null, string]> => {
    try {
      return [await p, null];
    } catch (err) {
      return [null, describeFetchError(err)];
    }
  };

  const [[resumen, resumenError], [clientes, clientesError], [multi]] = await Promise.all([
    settle(fetchJsonWithRetry<VentasResumen>(`/api/ventas/resumen?year=${year}`)),
    settle(fetchJsonWithRetry<Clientes>(`/api/ventas/clientes-12m?year=${year}`)),
    // Multifashion overview: SOLO alimenta el indicador de mayoreo de la fila
    // Multifashion. Su fallo se traga en silencio — nunca debe apagar el Resumen.
    settle(fetchJsonWithRetry<Multifashion>(`/api/multifashion/overview?year=${year}`)),
  ]);

  return { resumen, clientes, multi, resumenError, clientesError };
}

interface VentasShellProps {
  year: number;
  availableYears: number[];
  resumen: VentasResumen | null;
  clientes: Clientes | null;
  multi: Multifashion | null;
  /**
   * Lo que el guard de montos dejó AFUERA de estos números, ya redactado por el
   * servidor. Cubre las 4 familias que alimentan este módulo (facturas,
   * utilidad, costo diario y venta por artículo) y NO depende del año elegido:
   * es "qué está mal en Switch ahora", no "qué pasó en 2024".
   */
  avisoMontos?: string | null;
}

export function VentasShell({
  year: initialYear,
  availableYears,
  resumen: initialResumen,
  clientes: initialClientes,
  multi: initialMulti,
  avisoMontos,
}: VentasShellProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(initialYear);
  // Tab activo en la URL (?tab=resumen|clientes) para que refresh, back/forward
  // y compartir-link mantengan dónde estaba el usuario. Multifashion se separó
  // a su propio módulo (/multifashion); Ventas queda con Resumen + Clientes.
  //
  // Un ?tab= desconocido cae en la pestaña por defecto, NUNCA en blanco (misma
  // convención que /admin, /asistencia y el Depurador): Radix no dibuja nada si
  // el `value` no tiene trigger, así que sin este filtro un enlace viejo dejaba
  // la pantalla vacía. `?tab=referencia` además se redirige a /referencia en
  // next.config.js — esto es la red de abajo, no el camino principal.
  const [tabRaw, setTab] = useUrlState("tab", "resumen");
  const tab = TABS.some((t) => t === tabRaw) ? tabRaw : "resumen";

  // Lo que ya armó el server component, para el año inicial. Memoizado porque
  // su REFERENCIA es la señal de "el servidor mandó datos nuevos" que usa
  // `useSembrarDelServidor`; recrearlo en cada render lo dispararía siempre.
  //
  // La condición `&& initialResumen` se conserva tal cual: si el SSR del resumen
  // falló, la pantalla NO tiene datos del servidor y tiene que pedirlos.
  const delServidor = useMemo<VentasBundle | undefined>(
    () =>
      selectedYear === initialYear && initialResumen
        ? {
            resumen: initialResumen,
            clientes: initialClientes,
            multi: initialMulti,
            resumenError: null,
            clientesError: null,
          }
        : undefined,
    [selectedYear, initialYear, initialResumen, initialClientes, initialMulti],
  );

  // Bundle del Resumen cacheado por SWR, keyed por el año → cada año cachea por
  // separado y volver a un año ya visto pinta al instante (sin re-fetch). El
  // dato del SSR solo aplica al año inicial (no servir el initial de un año
  // distinto). dedupe 5min + sin revalidar al volver a la pestaña (módulo
  // pesado). La caché vive a nivel app (SWRProvider).
  //
  // 🔑 `opcionesDelServidor` es lo que evita pedir de nuevo los 3 endpoints que
  // el servidor ACABA de resolver (2.150 ms de base de datos por visita). Al
  // cambiar de año no hay dato del servidor → SWR pide, como siempre.
  const { data, isLoading, mutate } = useSWR<VentasBundle>(
    ["ventas-bundle", selectedYear],
    () => fetchVentasBundle(selectedYear),
    {
      dedupingInterval: 5 * 60_000,
      revalidateOnFocus: false,
      ...opcionesDelServidor(delServidor),
    },
  );

  // Que un render nuevo del servidor gane sobre lo que quedó en caché (sin red).
  useSembrarDelServidor(mutate, delServidor);

  // Red de seguridad: si el refetch del año inicial falló pero el SSR sí trajo
  // data, se sigue mostrando la del SSR (stale) en vez de una pantalla de error.
  const isInitialYear = selectedYear === initialYear;
  const resumen = data?.resumen ?? (isInitialYear ? initialResumen : null);
  const clientes = data?.clientes ?? (isInitialYear ? initialClientes : null);
  const multi = data?.multi ?? (isInitialYear ? initialMulti : null);
  // "Cargando" solo cuando aún no hay nada que mostrar (deshabilita el selector).
  const loading = isLoading && !data;
  // Banner ámbar de "data vieja": solo cuando hay algo que mostrar Y el último
  // refresh falló. Si no hay nada que mostrar, manda el ErrorState del tab.
  const fetchError = resumen ? (data?.resumenError ?? null) : null;

  const onYearChange = useCallback((year: number) => {
    if (year === selectedYear) return;
    // Cambiar el año cambia la key del useSWR → SWR dispara el fetch del año
    // nuevo (o sirve su caché). No se llama a ningún loader manual.
    setSelectedYear(year);
  }, [selectedYear]);

  // Pull-to-refresh (mobile): revalida el año actual sin cambiarlo.
  const onRefresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const onExportExcel = async () => {
    if (!resumen) return;
    try {
      await exportResumenToExcel(resumen);
    } catch (err) {
      console.error("[ventas] excel export failed", err);
    }
  };

  const isClosedYear = selectedYear < currentYear;
  // resumen.mesActual (1-indexed) = último mes con data en el año en curso.
  // Semánticamente es el "mes en curso" (data parcial cargada). El mes
  // cerrado inmediatamente anterior es mesActual - 1.
  //   mesActual = 5 (May) → "cierre Abr (mes en curso May)"
  //   mesActual = 1 (solo Ene)  → "mes en curso Ene" (no hay cerrado en este año)
  const mesesLabel = isClosedYear
    ? "año cerrado"
    : (resumen && resumen.mesActual > 0
        ? (resumen.mesActual >= 2
            ? `cierre ${MES_SHORT[resumen.mesActual - 2]} (mes en curso ${MES_SHORT[resumen.mesActual - 1]})`
            : `mes en curso ${MES_SHORT[resumen.mesActual - 1]}`)
        : "sin cierres aún");

  return (
    <>
    {/* Único chrome en móvil (drawer/búsqueda/logout/notifs) — el Sidebar es
        desktop-only, sin esto la página queda sin salida en la PWA. */}
    <AppHeader module="Ventas" />
    <PullToRefresh onRefresh={onRefresh}>
    <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
      {/* Page head — `relative z-20` para garantizar stacking context propio
          encima del TabsList (que tiene overflow-x-auto y crea su propio
          stacking en algunos browsers, tapando los buttons del header en
          viewports angostos). Sin esto, el botón Excel no respondía a click
          en producción. */}
      <header className="relative z-20 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Sin título grande: "Ventas" ya lo dicen la barra sticky (celular)
              y el breadcrumb (escritorio). Queda sr-only para no dejar la
              página sin encabezado. El subtítulo se QUEDA: dice qué universo y
              qué meses se están mirando, que no está en ningún otro lado. */}
          <h1 className="sr-only">Ventas</h1>
          <p className="text-xs text-gray-500">
            8 empresas · {mesesLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bug #1 fix: selector año visible desde cualquier tab (antes solo
              en Resumen). State global ya existía — solo cambio de placement. */}
          {/* iPhone: el trigger medía 88×36 — por debajo de los 44 de alto de la
              regla táctil. h-11 = 44px exactos. En desktop solo crece 8px y
              queda alineado con el botón Excel (que también va a 44). */}
          <Select value={String(selectedYear)} onValueChange={v => onYearChange(parseInt(v, 10))}>
            <SelectTrigger className="h-11 w-auto min-w-[88px] gap-1.5 text-xs font-mono tabular-nums" disabled={loading}>
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
          {/* Excel global = export del Resumen. En el tab Productos se oculta
              porque ese tab trae su propio export (por empresa + período). */}
          {tab !== "productos" && tab !== "utilidad" && (
            /* iPhone: medía 79×32. size="sm" fija h-8; el min-h-[44px] gana
               sobre `height` en CSS (min-height siempre manda) sin tocar el
               tamaño de letra ni el padding horizontal. */
            <Button variant="outline" size="sm" onClick={onExportExcel} disabled={!resumen} className="min-h-[44px]">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
            </Button>
          )}
        </div>
      </header>

      {/* Qué se quedó AFUERA de los números de este módulo. Va ARRIBA de las
          pestañas y no adentro de una: el mismo documento corrupto envenena la
          venta, el margen y la comisión, así que se dice UNA vez para las
          cuatro. Sin rechazos no se dibuja nada. */}
      <AvisoRechazosSwitch texto={avisoMontos} className="mb-4" />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        {/* 🩸 LOS 54 px QUE SOBRABAN EN LAS 4 PESTAÑAS. No era ninguna tabla: era
            esta tira. Las 4 pestañas pedían 444 px contra 390 de pantalla, así
            que hasta el Resumen —que ya pasó a tarjetas y su tabla mide 0—
            seguía arrastrando acá. Sin `overflow-x-auto` y con menos relleno
            lateral en celular (px-4 → px-2.5, que devuelve 48 px) entran las
            cuatro sin arrastrar. Ningún texto cambió; desde `sm` vuelve el
            relleno de siempre.
            La 5ª pestaña (Referencia) se fue a su propio módulo (/referencia,
            12-ago-2026) y de su apretujamiento se revirtió LO QUE SE PUDO, que
            no es todo — medido a 390 px con las cuatro, no supuesto:
              · la letra vuelve a text-sm y el relleno a px-2.5 (eran 13 px y
                px-2): las cuatro suman 315 px + 32 de relleno = 347 ≤ 390 → 0
                de arrastre, con 43 px de aire.
              · 🔴 el ICONO SIGUE ESCONDIDO bajo `sm`, y no es un olvido: con
                icono las cuatro miden 395 px y la tira arrastra 6. El icono
                cuesta 20 px por pestaña (80 en total) y ningún relleno los
                devuelve — ni px-1.5, que solo recupera 32 y encima aprieta. Es
                decorativo (el texto dice lo mismo), así que a 390 se va él.
            Desde `sm` no cambió nada: icono, px-4 y todo como siempre. */}
        <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0 rounded-none border-b border-gray-200 bg-transparent px-4 p-0 md:mx-0 md:px-0">
          <TabsTrigger value="resumen" className={TAB_TRIGGER_CLASS}>
            <TrendingUp className="hidden h-3.5 w-3.5 sm:block" /> Resumen
          </TabsTrigger>
          <TabsTrigger value="clientes" className={TAB_TRIGGER_CLASS}>
            <Contact className="hidden h-3.5 w-3.5 sm:block" /> Clientes
          </TabsTrigger>
          <TabsTrigger value="productos" className={TAB_TRIGGER_CLASS}>
            <Package className="hidden h-3.5 w-3.5 sm:block" /> Productos
          </TabsTrigger>
          <TabsTrigger value="utilidad" className={TAB_TRIGGER_CLASS}>
            <Percent className="hidden h-3.5 w-3.5 sm:block" /> Utilidad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-5">
          {resumen ? (
            <ResumenView
              data={resumen}
              multi={multi}
              availableYears={availableYears}
              selectedYear={selectedYear}
              isClosedYear={isClosedYear}
              loading={loading}
              error={fetchError}
              onYearChange={onYearChange}
              onReloadData={() => mutate()}
            />
          ) : <ErrorState scope="resumen" detail={data?.resumenError ?? null} onRetry={() => mutate()} />}
        </TabsContent>
        <TabsContent value="clientes" className="mt-5">
          {clientes ? (
            // key={selectedYear} fuerza remount al cambiar año — resetea state
            // interno (search, pill, sort) que asume el universo del año cargado.
            <ClientesView
              key={selectedYear}
              data={clientes}
              selectedYear={selectedYear}
              isClosedYear={isClosedYear}
            />
          ) : <ErrorState scope="clientes" detail={data?.clientesError ?? null} onRetry={() => mutate()} />}
        </TabsContent>
        <TabsContent value="productos" className="mt-5">
          {/* 🔴 SIN `key={selectedYear}`. Ese remonte tiraba TODO el estado
              interno al cambiar el año de arriba: el período volvía solo a "Año
              en curso" y el buscador se vaciaba, sin avisar, estando la persona
              mirando "Últimos 12 meses" — un período que ni siquiera depende
              del año. Lo único que el remonte protegía era el MES elegido
              cuando el año nuevo no lo tiene, y eso lo resuelve ProductosView
              con el dato en la mano (ver su guard de `data.meses`) en vez de
              borrar tres cosas por las dudas. */}
          <ProductosView selectedYear={selectedYear} />
        </TabsContent>
        <TabsContent value="utilidad" className="mt-5">
          {/* Utilidad real por cliente (5 B2B). Self-fetch por año; key remonta
              al cambiar año para resetear search/sort. */}
          <UtilidadView key={selectedYear} selectedYear={selectedYear} />
        </TabsContent>
      </Tabs>
    </main>
    </PullToRefresh>
    </>
  );
}

// Solo se ve cuando el reintento automático (3 intentos) YA se agotó: el fallo
// es definitivo, no un timeout de caché fría. Por eso ofrece un botón explícito.
function ErrorState({
  scope, detail, onRetry,
}: {
  scope: string;
  detail?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <p className="text-sm text-gray-700">
        No se pudieron cargar los datos de <strong>{scope}</strong>.
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Ya lo intentamos varias veces. Vuelve a probar en unos segundos.
      </p>
      {onRetry && (
        /* min-h-[44px]: mismo motivo que el botón Excel — size="sm" da 32px. */
        <Button variant="outline" size="sm" className="mt-3 min-h-[44px]" onClick={onRetry}>
          Reintentar
        </Button>
      )}
      {detail && <p className="mt-2 font-mono text-xs text-gray-400">{detail}</p>}
    </div>
  );
}

const MES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Las pestañas de Ventas, en el orden en que se ven. Es la lista contra la que
// se valida el ?tab= de la URL: lo que no esté acá cae en "resumen".
const TABS = ["resumen", "clientes", "productos", "utilidad"] as const;

// Clase compartida de las 4 pestañas. En celular el relleno lateral baja a
// px-2.5 (devuelve 48 px y las cuatro entran en 390 sin arrastrar); desde `sm`
// vuelve el de siempre. El icono se ve en todos los anchos.
const TAB_TRIGGER_CLASS =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2.5 py-3 text-gray-500 sm:px-4 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-gray-950 data-[state=active]:shadow-none";
