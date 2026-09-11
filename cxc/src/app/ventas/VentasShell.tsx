"use client";

import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import { opcionesDelServidor, useSembrarDelServidor } from "@/lib/swr-servidor";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TrendingUp, Contact, Package } from "lucide-react";
import dynamic from "next/dynamic";
import { PullToRefresh } from "@/components/ui";
import AppHeader from "@/components/AppHeader";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import { PeriodoSelect } from "@/components/multifashion/PeriodoSelect";
import { fetchJsonWithRetry, describeFetchError } from "@/lib/fetch-retry";
import type { VentasResumen, Clientes, Multifashion } from "@/components/ventas/types";
import {
  esModoClientes,
  esTabVentas,
  modoHeredado,
  tabHeredado,
  type ModoClientes,
} from "@/lib/ventas/pestanas";
import {
  MEMORIA_PERIODO_VENTAS,
  PARAM_PERIODO_VENTAS,
  anioDelPeriodo,
  opcionesPeriodo,
  periodoAUrl,
  periodoDesdeUrl,
  resolverPeriodo,
  ventanaParaClientes,
  type CapacidadesPeriodo,
  type PeriodoVentas,
} from "@/lib/ventas/periodo";

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
// 🔴 UTILIDAD NO SE BORRÓ: es un MODO de Clientes. `UtilidadView` se MONTA
// desde adentro de Clientes. `?tab=utilidad` llega a `?tab=clientes&modo=
// utilidad` (ver `tabHeredado`).
//
// 🔴 COMISIONES SE FUE A SU MÓDULO, COMPLETO (`/comisiones`; Daniel, 5-sep-2026:
// *«si quitala»*). `/ventas?tab=comisiones` se redirige en `next.config.js`.

// Bundle del tab Resumen: las 3 lecturas que dependen del PERÍODO elegido.
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

// Fetcher keyed por período. NUNCA rechaza: reintenta cada endpoint por separado
// (fetchJsonWithRetry, 3 intentos con backoff corto — los timeouts de statement
// de Postgres en caché fría se curan solos al segundo intento) y devuelve lo que
// haya logrado traer. Lo que falló definitivamente viaja como mensaje.
async function fetchVentasBundle(periodo: PeriodoVentas, anioEnCurso: number): Promise<VentasBundle> {
  const settle = async <T,>(p: Promise<T>): Promise<[T, null] | [null, string]> => {
    try {
      return [await p, null];
    } catch (err) {
      return [null, describeFetchError(err)];
    }
  };

  const year = anioDelPeriodo(periodo, anioEnCurso);
  const ventana = ventanaParaClientes(periodo);
  const [[resumen, resumenError], [clientes, clientesError], [multi]] = await Promise.all([
    settle(fetchJsonWithRetry<VentasResumen>(`/api/ventas/resumen?year=${year}`)),
    // 🔴 La ventana viaja solo cuando el período es una: el año, sin parámetro.
    settle(fetchJsonWithRetry<Clientes>(
      `/api/ventas/clientes-12m?year=${year}${ventana ? `&ventana=${ventana}` : ""}`,
    )),
    // Multifashion overview: SOLO alimenta el indicador de mayoreo de la fila
    // Multifashion. Su fallo se traga en silencio — nunca debe apagar el Resumen.
    settle(fetchJsonWithRetry<Multifashion>(`/api/multifashion/overview?year=${year}`)),
  ]);

  return { resumen, clientes, multi, resumenError, clientesError };
}

interface VentasShellProps {
  /** El año en curso de PANAMÁ (lo calcula la página con `hoyPanama`). */
  year: number;
  /** El período que el servidor ya armó (`periodoAUrl`): con ese no se pide de nuevo. */
  periodoServidor: string;
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
  year: anioEnCurso,
  periodoServidor,
  availableYears,
  resumen: initialResumen,
  clientes: initialClientes,
  multi: initialMulti,
  avisoMontos,
}: VentasShellProps) {
  // Tab activo en la URL (?tab=resumen|clientes|productos) para que refresh,
  // back/forward y compartir-link mantengan dónde estaba el usuario.
  //
  // Un ?tab= desconocido cae en la pestaña por defecto, NUNCA en blanco (misma
  // convención que /cxc, /asistencia y el Depurador): Radix no dibuja nada si
  // el `value` no tiene trigger. `?tab=referencia` y `?tab=comisiones` se
  // redirigen en next.config.js — esto es la red de abajo, no el camino.
  const [tabRaw, setTab] = useUrlState("tab", "resumen");
  // El MODO de la pestaña Clientes (Ventas · Utilidad). Vive en la URL igual
  // que el tab para que un enlace guardado abra la misma vista.
  const [modoRaw, setModo] = useUrlState("modo", "ventas");
  // `?tab=utilidad` es la pestaña que se retiró: hoy es un MODO de Clientes.
  // Se traduce acá y no con un redirect de `next.config.js` porque el destino
  // es la MISMA ruta con la MISMA clave `tab`: un redirect volvería a matchear
  // su propia salida y el navegador giraría en redondo. `?modo=margen` (el modo
  // que se fue el 11-sep-2026) llega a `utilidad` por el mismo camino.
  const heredado = tabHeredado(tabRaw);
  const tab = heredado?.tab ?? (esTabVentas(tabRaw) ? tabRaw : "resumen");
  const modoViejo = modoHeredado(modoRaw);
  const modo: ModoClientes = heredado?.modo ?? modoViejo ?? (esModoClientes(modoRaw) ? modoRaw : "ventas");

  // La URL se normaliza UNA vez, sin entrada de historial: el enlace viejo
  // queda convertido en el nuevo y el Back no cicla entre los dos.
  useEffect(() => {
    if (heredado) {
      setTab(heredado.tab);
      setModo(heredado.modo);
    } else if (modoViejo) {
      setModo(modoViejo);
    }
  }, [heredado, modoViejo, setTab, setModo]);

  // ── 🔴 EL ÚNICO SELECTOR DE PERÍODO (11-sep-2026) ─────────────────────────
  // Vive en la URL (`?periodo=`, mismo nivel → replace) y se recuerda por
  // usuario. La URL manda; sin URL, lo último elegido; sin nada, el año en
  // curso. Lo que la pestaña no sepa servir cae al año en curso — ver
  // `src/lib/ventas/periodo.ts`, donde está el porqué de cada regla.
  const [periodoUrl, setPeriodoUrl] = useUrlState(PARAM_PERIODO_VENTAS, "");
  const [periodoMemoria, setPeriodoMemoria] = useLastUsed(MEMORIA_PERIODO_VENTAS, "");

  // Lo que se pidió (URL o memoria), ANTES de ajustarlo a la pestaña: la
  // llave de la caché. Así «Últimos 12 meses» no se pierde por pasar un
  // momento por el Resumen, que no lo sirve.
  const pedido = useMemo<PeriodoVentas>(
    () => periodoDesdeUrl(periodoUrl) ?? periodoDesdeUrl(periodoMemoria) ?? { tipo: "anio", anio: anioEnCurso },
    [periodoUrl, periodoMemoria, anioEnCurso],
  );

  // Las ventanas que la vista de Clientes sabe servir las dice el SERVIDOR con
  // la primera respuesta (`ventanasDisponibles`); mientras no se sepa, ninguna.
  const capSemilla = initialClientes?.ventanasDisponibles ?? [];

  const onPeriodoChange = useCallback((valor: string) => {
    const p = periodoDesdeUrl(valor);
    if (!p) return;
    setPeriodoUrl(periodoAUrl(p));
    setPeriodoMemoria(periodoAUrl(p));
  }, [setPeriodoUrl, setPeriodoMemoria]);

  // El bundle se pide por lo PEDIDO; cada pestaña toma de ahí lo que sabe
  // servir (el Resumen mira el año del período; Clientes, la ventana si la
  // vista la trae). Al pedir «Últimos 12 meses», el Resumen ve el año en curso
  // —que es lo que `anioDelPeriodo` devuelve para una ventana— sin otra lectura.
  const keyPeriodo = periodoAUrl(pedido);
  const esPeriodoInicial = keyPeriodo === periodoServidor;

  // Lo que ya armó el server component, para el período inicial. Memoizado
  // porque su REFERENCIA es la señal de "el servidor mandó datos nuevos" que
  // usa `useSembrarDelServidor`; recrearlo en cada render lo dispararía siempre.
  //
  // La condición `&& initialResumen` se conserva tal cual: si el SSR del resumen
  // falló, la pantalla NO tiene datos del servidor y tiene que pedirlos.
  const delServidor = useMemo<VentasBundle | undefined>(
    () =>
      esPeriodoInicial && initialResumen
        ? {
            resumen: initialResumen,
            clientes: initialClientes,
            multi: initialMulti,
            resumenError: null,
            clientesError: null,
          }
        : undefined,
    [esPeriodoInicial, initialResumen, initialClientes, initialMulti],
  );

  // Bundle cacheado por SWR, keyed por el período → cada período cachea por
  // separado y volver a uno ya visto pinta al instante (sin re-fetch). El dato
  // del SSR solo aplica al período inicial. dedupe 5min + sin revalidar al
  // volver a la pestaña (módulo pesado). La caché vive a nivel app (SWRProvider).
  //
  // 🔑 `opcionesDelServidor` es lo que evita pedir de nuevo los 3 endpoints que
  // el servidor ACABA de resolver (2.150 ms de base de datos por visita).
  const { data, isLoading, mutate } = useSWR<VentasBundle>(
    ["ventas-bundle", keyPeriodo],
    () => fetchVentasBundle(pedido, anioEnCurso),
    {
      dedupingInterval: 5 * 60_000,
      revalidateOnFocus: false,
      ...opcionesDelServidor(delServidor),
    },
  );

  // Que un render nuevo del servidor gane sobre lo que quedó en caché (sin red).
  useSembrarDelServidor(mutate, delServidor);

  // Red de seguridad: si el refetch del período inicial falló pero el SSR sí
  // trajo data, se sigue mostrando la del SSR (stale) en vez de un error.
  const resumen = data?.resumen ?? (esPeriodoInicial ? initialResumen : null);
  const clientes = data?.clientes ?? (esPeriodoInicial ? initialClientes : null);
  const multi = data?.multi ?? (esPeriodoInicial ? initialMulti : null);
  // "Cargando" solo cuando aún no hay nada que mostrar (deshabilita el selector).
  const loading = isLoading && !data;
  // Banner ámbar de "data vieja": solo cuando hay algo que mostrar Y el último
  // refresh falló. Si no hay nada que mostrar, manda el ErrorState del tab.
  const fetchError = resumen ? (data?.resumenError ?? null) : null;

  // Las ventanas que Clientes sabe servir HOY: lo dijo la última respuesta.
  const cap = useMemo<CapacidadesPeriodo>(
    () => ({ clientesVentanas: clientes?.ventanasDisponibles ?? capSemilla }),
    [clientes, capSemilla],
  );

  // Lo que se MUESTRA en esta pestaña: lo pedido, ajustado a lo que sabe servir.
  const periodo = resolverPeriodo({ url: periodoUrl, memoria: periodoMemoria, tab, anioEnCurso, cap });
  const selectedYear = anioDelPeriodo(periodo, anioEnCurso);
  const isClosedYear = selectedYear < anioEnCurso;

  const opciones = useMemo(
    () => opcionesPeriodo({ tab, anios: availableYears, anioEnCurso, cap }),
    [tab, availableYears, anioEnCurso, cap],
  );

  // Pull-to-refresh (mobile): revalida el período actual sin cambiarlo.
  const onRefresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return (
    <>
    {/* Único chrome en móvil (drawer/búsqueda/logout/notifs) — el Sidebar es
        desktop-only, sin esto la página queda sin salida en la PWA. */}
    <AppHeader module="Ventas" />
    <PullToRefresh onRefresh={onRefresh}>
    <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
      {/* Page head — `relative z-20` para garantizar stacking context propio
          encima del TabsList (que tiene overflow-x-auto y crea su propio
          stacking en algunos browsers, tapando los controles del header en
          viewports angostos). */}
      <header className="relative z-20 mb-5 flex flex-wrap items-center justify-between gap-3">
        {/* Sin título grande: "Ventas" ya lo dicen la barra sticky (celular)
            y el breadcrumb (escritorio). Queda sr-only para no dejar la
            página sin encabezado. */}
        <h1 className="sr-only">Ventas</h1>
        {/* ⛔ ACÁ IBA «8 empresas · cierre Ago (mes en curso Sep)» (y «6
            empresas · …», «una empresa a la vez»). Se retiró el 11-sep-2026: la
            matriz lista las ocho empresas una por una y abajo dice hasta qué
            día llegan los datos; un contador encima de una tabla que ya cuenta
            era una línea de más. */}
        {/* 🔴 EL ÚNICO SELECTOR DE PERÍODO, arriba, que manda en las tres
            pestañas (11-sep-2026). Reemplaza al año suelto de acá, al
            desplegable «Clientes: últimos 12 meses» y al «Período» propio de
            Productos. Cada pestaña ofrece solo lo que sabe servir. */}
        <div data-selector-periodo-ventas className="flex flex-wrap items-center gap-2">
          <PeriodoSelect
            valor={periodoAUrl(periodo)}
            opciones={opciones}
            onChange={onPeriodoChange}
            disabled={loading}
          />
        </div>
      </header>

      {/* Qué se quedó AFUERA de los números de este módulo. Va ARRIBA de las
          pestañas y no adentro de una: el mismo documento corrupto envenena la
          venta y el margen, así que se dice UNA vez para las TRES. Sin
          rechazos no se dibuja nada.
          ⚠️ Es la familia factura/utilidad/costo/artículo. Los COBROS son otra
          familia (`recibo`) y su aviso vive en `/comisiones`. */}
      <AvisoRechazosSwitch texto={avisoMontos} className="mb-4" />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        {/* 🩸 LOS px QUE SOBRABAN EN LA TIRA. Con CINCO pestañas pedía más
            ancho del que tiene un iPhone; por eso el icono está bajo `sm` y la
            letra baja a 13 px. Con TRES sobra ancho y aun así NO se revirtió
            nada (5-sep-2026). Desde `sm` no cambia nada. */}
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
              selectedYear={selectedYear}
              isClosedYear={isClosedYear}
              loading={loading}
              error={fetchError}
              onReloadData={() => mutate()}
            />
          ) : <ErrorState scope="resumen" detail={data?.resumenError ?? null} onRetry={() => mutate()} />}
        </TabsContent>
        <TabsContent value="clientes" className="mt-5">
          {clientes ? (
            // key={período} fuerza remount al cambiar el período — resetea
            // state interno (search, empresa, sort) que asume el universo cargado.
            //
            // ⚠️ El MODO no entra en la `key`: cambiar de Ventas a Utilidad es
            // mirar las MISMAS filas con otras columnas, y remontar ahí borraría
            // la búsqueda y la empresa que la persona acaba de elegir.
            <ClientesView
              key={keyPeriodo}
              data={clientes}
              selectedYear={selectedYear}
              isClosedYear={isClosedYear}
              periodo={periodo}
              modo={modo}
              onModo={setModo}
            />
          ) : <ErrorState scope="clientes" detail={data?.clientesError ?? null} onRetry={() => mutate()} />}
        </TabsContent>
        <TabsContent value="productos" className="mt-5">
          {/* 🔴 SIN `key`: remontar tiraría el buscador y el filtro de cliente
              al cambiar el período. El período le llega por prop y la vista
              vuelve a pedir sola lo suyo (ver su `load`). */}
          <ProductosView periodo={periodo} anioEnCurso={anioEnCurso} />
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
        /* min-h-[44px]: mismo motivo que el botón de descarga — size="sm" da 32px. */
        <Button variant="outline" size="sm" className="mt-3 min-h-[44px]" onClick={onRetry}>
          Reintentar
        </Button>
      )}
      {detail && <p className="mt-2 font-mono text-xs text-gray-400">{detail}</p>}
    </div>
  );
}

// Clase compartida de las tres pestañas. Ver la nota de la tira, arriba.
const TAB_TRIGGER_CLASS =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2 py-3 text-[13px] text-gray-500 sm:px-4 sm:text-sm data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-gray-950 data-[state=active]:shadow-none";
