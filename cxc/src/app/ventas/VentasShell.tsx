"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import { opcionesDelServidor, useSembrarDelServidor } from "@/lib/swr-servidor";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TrendingUp, Contact, Package } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import dynamic from "next/dynamic";
import { PullToRefresh } from "@/components/ui";
import AppHeader from "@/components/AppHeader";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import { fetchJsonWithRetry, describeFetchError } from "@/lib/fetch-retry";
import type { VentasResumen, Clientes, Multifashion } from "@/components/ventas/types";
import {
  alcanceDeLaPestana,
  esModoClientes,
  esTabVentas,
  tabHeredado,
  type ModoClientes,
} from "@/lib/ventas/pestanas";

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
// ⛔ ACÁ VIVÍAN `UtilidadView` y `ComisionesView`, LAS PESTAÑAS 4 Y 5 (retiradas
// el 5-sep-2026). Cinco pestañas pasaron a TRES: Resumen · Clientes · Productos.
//
// 🔴 UTILIDAD NO SE BORRÓ: es un MODO de Clientes. La pestaña respondía la
// misma pregunta que Clientes —quién compra— con otras columnas, y tenerlas
// separadas obligaba a buscar al mismo cliente dos veces. Ahora Clientes trae
// el mismo control segmentado que el Resumen (Ventas · Utilidad · Margen %) y
// `UtilidadView` se MONTA desde adentro: se reusa, no se reescribió.
// `?tab=utilidad` llega a `?tab=clientes&modo=utilidad` (ver `tabHeredado`).
//
// 🔴 COMISIONES SE FUE A SU MÓDULO, COMPLETO. Daniel, 5-sep-2026: *«si
// quitala»*. La pestaña montaba `ComisionesView` SIN `conConfiguracion`, o sea
// una versión recortada de la pantalla que `/comisiones` ya sirve entera — y
// que la secretaria y contabilidad solo pueden ver ahí, porque /ventas es
// admin-only. `/ventas?tab=comisiones` se redirige en `next.config.js`.

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
  // El MODO de la pestaña Clientes (Ventas · Utilidad · Margen %). Vive en la
  // URL igual que el tab para que un enlace guardado abra la misma vista.
  const [modoRaw, setModo] = useUrlState("modo", "ventas");
  // `?tab=utilidad` es la pestaña que se retiró: hoy es un MODO de Clientes.
  // Se traduce acá y no con un redirect de `next.config.js` porque el destino
  // es la MISMA ruta con la MISMA clave `tab`: Next arrastra la query original
  // al destino, el redirect volvería a matchear su propia salida y el navegador
  // giraría en redondo. Traducir es lo único que no puede hacer un bucle.
  const heredado = tabHeredado(tabRaw);
  const tab = heredado?.tab ?? (esTabVentas(tabRaw) ? tabRaw : "resumen");
  const modo: ModoClientes = heredado?.modo ?? (esModoClientes(modoRaw) ? modoRaw : "ventas");

  // La URL se normaliza UNA vez, sin entrada de historial: el enlace viejo
  // queda convertido en el nuevo y el Back no cicla entre los dos.
  useEffect(() => {
    if (!heredado) return;
    setTab(heredado.tab);
    setModo(heredado.modo);
  }, [heredado, setTab, setModo]);

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
          {/* 🔴 CADA PESTAÑA DICE LAS SUYAS, y hasta hoy las tres decían «8».
              Es la misma clase de error que el subtítulo de Comisiones: un
              encabezado que promete ocho arriba de una tabla de seis hace
              buscar las dos que faltan.

              · Resumen son las OCHO: la matriz las lista una por una.
              · Clientes son las SEIS de Fashion Group (`B2B_EMPRESA_KEYS`) —
                Boston y Multifashion tienen sus clientes en su propio módulo—
                y en Utilidad/Margen son esas seis menos las que no llevan
                utilidad, que la propia vista declara con su número real.
              · Productos se mira de a UNA empresa, elegida adentro. */}
          <p data-alcance-pestana className="text-xs text-gray-500">
            {alcanceDeLaPestana(tab, mesesLabel)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bug #1 fix: selector año visible desde cualquier tab (antes solo
              en Resumen). State global ya existía — solo cambio de placement. */}
          {/* iPhone: el trigger medía 88×36 — por debajo de los 44 de alto de la
              regla táctil. h-11 = 44px exactos. En desktop solo crece 8px. */}
          {/* 🔴 EN PRODUCTOS NO SE DIBUJA: esa pantalla trae su propio selector
              de período, y tres de sus cuatro opciones («Últimos 6 meses»,
              «Últimos 12 meses», «Año pasado») se cuentan desde HOY y NO miran
              este año. Dos controles de tiempo, uno inerte, es cómo se lee un
              número de un año creyendo que es de otro. */}
          {tab !== "productos" && (
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
          )}
          {/* ⛔ ACÁ VIVÍA EL BOTÓN «Excel» DE LA BARRA, Y NO ERA EL DEL MÓDULO:
              era el del RESUMEN (`exportResumenToExcel`), puesto al lado del
              año. Desde Clientes o desde Productos bajaba la matriz de empresas
              × meses — un archivo que no tenía nada que ver con lo que se
              estaba mirando.

              🔴 Ahora cada pestaña trae el suyo ADENTRO, como ya lo hacían
              Productos y Utilidad, y cada uno baja LO QUE ESTÁS VIENDO con los
              filtros puestos. Clientes ganó el que le faltaba
              (`clientes-excel.ts`). Candado: `ventas-tres-pestanas.test.tsx`. */}
        </div>
      </header>

      {/* Qué se quedó AFUERA de los números de este módulo. Va ARRIBA de las
          pestañas y no adentro de una: el mismo documento corrupto envenena la
          venta y el margen, así que se dice UNA vez para las TRES. Sin
          rechazos no se dibuja nada.
          ⚠️ Es la familia factura/utilidad/costo/artículo. Los COBROS son otra
          familia (`recibo`) y su aviso se fue con la pestaña Comisiones, a
          `/comisiones`, que ya lo pedía por su cuenta. Nunca se fusionan: la
          comisión sobre cobro lee `switch_recibos`. */}
      <AvisoRechazosSwitch texto={avisoMontos} className="mb-4" />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        {/* 🩸 LOS px QUE SOBRABAN EN LA TIRA. No era ninguna tabla: era esta
            tira. Con CINCO pestañas pedía más ancho del que tiene un iPhone, y
            por eso el icono está escondido bajo `sm` (cuesta 20 px por pestaña
            y es decorativo: el texto dice lo mismo) y la letra baja a 13 px.

            🔴 CON TRES SOBRA ANCHO, y aun así NO se revirtió nada (5-sep-2026).
            Medido a 390 px: «Resumen · Clientes · Productos» son 8+8+9 letras
            contra las 8+8+9+8+10 de antes, así que la tira entra de sobra con
            los valores que ya estaban — y devolverle el icono o el relleno
            grande sería volver a acercarse al borde por gusto, en la pantalla
            donde Daniel de verdad la usa. Desde `sm` no cambia nada. */}
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
            //
            // ⚠️ El MODO no entra en la `key`: cambiar de Ventas a Utilidad es
            // mirar las MISMAS filas con otras columnas, y remontar ahí borraría
            // la búsqueda y la empresa que la persona acaba de elegir — que es
            // justo lo que Daniel pidió que se conservara entre los tres modos.
            <ClientesView
              key={selectedYear}
              data={clientes}
              selectedYear={selectedYear}
              isClosedYear={isClosedYear}
              modo={modo}
              onModo={setModo}
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

// Clase compartida de las tres pestañas.
//
// 🩸 EL APRIETE DE LA TIRA ES HISTORIA MEDIDA, no gusto. Con CINCO pestañas no
// entraba en 390 px, y por eso la letra bajó a 13 px, el relleno a `px-2` y el
// icono se escondió bajo `sm` (cuesta 20 px por pestaña y es decorativo: el
// texto dice lo mismo). Con TRES sobra ancho y aun así NO se revirtió nada:
// devolverle el icono sería volver a acercarse al borde en la pantalla donde
// Daniel de verdad la usa, sin ganar un dato. Desde `sm` no cambia un píxel.
const TAB_TRIGGER_CLASS =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2 py-3 text-[13px] text-gray-500 sm:px-4 sm:text-sm data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-gray-950 data-[state=active]:shadow-none";
