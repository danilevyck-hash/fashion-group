"use client";

// Gastos según la contabilidad (el mayor que trae Switch), POR EMPRESA.
//
// Daniel, textual: "deberiamos de ver los gastos o la info por empresa no total
// del grupo" y "los top key importante de info nada mas". Por eso no hay fila de
// total del grupo y la primera pantalla son cuatro números por empresa.
//
// 🔑 Un mes sin contabilidad NO se ve como $0 — ver `EstadoMesTag`.
//
// DOS PESTAÑAS desde el 13-ago-2026 (Daniel, sobre Gastos y Saldos de Banco:
// *"y debeeria estar en un solo modulo"*): *Gastos* y *Saldos de banco*. La 2ª
// es la pantalla que vivía en `/saldos-banco`, mudada entera; esa dirección
// redirige acá (next.config.js).

import { Suspense, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import AppHeader from "@/components/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Landmark, Receipt } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import {
  API_BASE,
  FUENTE_POR_DEFECTO,
  esFuenteValida,
  mesActual,
  mesValido,
  type FuenteGastos,
  type RespuestaEgresos,
  type RespuestaResumen,
} from "./components/tipos";
import SelectorMes from "./components/SelectorMes";
import SelectorFuente from "./components/SelectorFuente";
import ResumenEmpresas from "./components/ResumenEmpresas";
import DetalleEmpresa from "./components/DetalleEmpresa";
import ResumenEgresos from "./components/ResumenEgresos";
import DetalleEgresos from "./components/DetalleEgresos";
import SaldosBancoTab from "./components/saldos/SaldosBancoTab";

// Las dos pestañas. `?tab=` en la URL (mismo patrón que Usuarios, Ventas y
// Multifashion) para que un marcador, un refresh y el back/forward caigan donde
// estaba la persona — y para que `/saldos-banco` pueda aterrizar en la suya.
const TABS = ["gastos", "saldos-banco"] as const;

// Misma clase que las pestañas de Usuarios, Ventas y Multifashion. No se
// inventa un patrón nuevo: subrayado teal, sin píldora, 44px de alto al tacto.
const TAB_TRIGGER_CLASS =
  "min-h-[44px] gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2.5 py-2 text-gray-500 sm:px-4 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-gray-950 data-[state=active]:shadow-none";

function fetcher<T>(url: string): Promise<T> {
  return fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("err");
    return r.json() as Promise<T>;
  });
}

// useSearchParams (vía useUrlState) exige boundary de Suspense.
export default function GastosContabilidadClient() {
  return (
    <Suspense>
      <GastosContabilidadInner />
    </Suspense>
  );
}

function GastosContabilidadInner() {
  const { authChecked } = useAuth({
    moduleKey: "gastos-contabilidad",
    allowedRoles: ["admin", "contabilidad"],
  });
  const router = useRouter();

  // ?tab= es un filtro del MISMO nivel → replace (no ensucia el historial). Un
  // `?tab=` desconocido cae en "gastos", NUNCA en blanco: Radix no dibuja nada
  // si el `value` no tiene trigger (misma convención que /ventas y /admin).
  const [tabRaw, setTab] = useUrlState("tab", "gastos");
  const tab = (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "gastos";
  const enGastos = tab === "gastos";

  const hoyMes = useMemo(() => mesActual(), []);
  // ?mes= es un filtro del MISMO nivel → replace (no ensucia el historial).
  const [mesParam, setMesParam] = useUrlState("mes", hoyMes);
  const mes = mesValido(mesParam) && mesParam <= hoyMes ? mesParam : hoyMes;

  // ?empresa= es drill-down (lista → desglose) → push, para que el Back del
  // navegador vuelva a la lista y el historial sea espejo del breadcrumb.
  const [empresaParam, setEmpresaParam] = useUrlState("empresa", "", { history: "push" });

  // ?fuente= es un filtro del MISMO nivel → replace. Y va en la URL a propósito:
  // es lo que hace COMPARTIBLE la comparación entre las dos fuentes (el motivo
  // por el que el mayor no se apagó todavía).
  const [fuenteParam, setFuenteParam] = useUrlState<string>("fuente", FUENTE_POR_DEFECTO);
  const fuente: FuenteGastos = esFuenteValida(fuenteParam) ? fuenteParam : FUENTE_POR_DEFECTO;

  // ¿El desglose se abrió tocando una empresa en ESTA sesión? Si sí, "Volver"
  // deshace el push del historial. Si se llegó por deep link no hay nada que
  // deshacer y hacer back sacaría a la persona de la app.
  const abiertoDesdeLista = useRef(false);

  // Se pide SOLO la fuente elegida, y SOLO si la pestaña de gastos está a la
  // vista. Traer las dos fuentes y esconder una haría el doble de consultas
  // contra una base en compute Micro para pintar la mitad — y, peor, dejaría las
  // dos cifras en la misma pantalla listas para que alguien las sume. Lo mismo
  // vale para la pestaña: estando en Saldos, el mayor no se pide.
  const pedirMayor = authChecked && enGastos && fuente === "mayor";
  const pedirEgresos = authChecked && enGastos && fuente === "egresos";

  const mayor = useSWR<RespuestaResumen>(
    pedirMayor ? `${API_BASE}/resumen?mes=${mes}` : null,
    fetcher<RespuestaResumen>,
    { revalidateOnFocus: true },
  );
  const egresos = useSWR<RespuestaEgresos>(
    pedirEgresos ? `${API_BASE}/egresos?mes=${mes}` : null,
    fetcher<RespuestaEgresos>,
    { revalidateOnFocus: true },
  );

  const activo = fuente === "mayor" ? mayor : egresos;
  const { error, isLoading, mutate } = activo;
  const data = activo.data;

  // Hooks ANTES de cualquier return condicional (regla del repo).
  const empresaMayor = useMemo(
    () => mayor.data?.empresas.find((e) => e.empresaKey === empresaParam) ?? null,
    [mayor.data, empresaParam],
  );
  const empresaEgresos = useMemo(
    () => egresos.data?.empresas.find((e) => e.empresaKey === empresaParam) ?? null,
    [egresos.data, empresaParam],
  );
  // El breadcrumb de la empresa abierta solo tiene sentido dentro de Gastos: en
  // Saldos de banco anunciaría un lugar donde no se está.
  const nombreAbierto = !enGastos
    ? null
    : fuente === "mayor"
      ? (empresaMayor?.nombre ?? null)
      : (empresaEgresos?.nombre ?? null);
  const hayEmpresaAbierta = Boolean(nombreAbierto);

  if (!authChecked) return null;

  const abrirEmpresa = (key: string) => {
    abiertoDesdeLista.current = true;
    setEmpresaParam(key);
  };

  const volver = () => {
    if (abiertoDesdeLista.current) {
      abiertoDesdeLista.current = false;
      router.back();
    } else {
      setEmpresaParam("");
    }
  };

  // Deep link a una empresa: mientras no haya datos no se puede saber si existe,
  // así que se espera en vez de mostrar la lista y saltar al desglose.
  const esperandoDeepLink = Boolean(empresaParam) && !data && (isLoading || !error);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        module="Gastos"
        breadcrumbs={nombreAbierto ? [{ label: nombreAbierto }] : undefined}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-[env(safe-area-inset-bottom)]">
        {/* Sin título grande: "Gastos" ya lo dicen la barra sticky (celular) y el
            breadcrumb (escritorio). Queda sr-only para no dejar la página sin
            encabezado, y vive ACÁ —fuera de las pestañas— para que sea UNO solo
            y esté en las dos (dos h1 en una página serían uno de más). */}
        <h1 className="sr-only">Gastos</h1>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="-mx-4 mb-5 flex h-auto w-auto justify-start gap-0 overflow-x-auto rounded-none border-b border-gray-200 bg-transparent p-0 px-4 md:mx-0 md:px-0">
            <TabsTrigger value="gastos" className={TAB_TRIGGER_CLASS}>
              <Receipt className="hidden h-3.5 w-3.5 sm:block" /> Gastos
            </TabsTrigger>
            <TabsTrigger value="saldos-banco" className={TAB_TRIGGER_CLASS}>
              <Landmark className="hidden h-3.5 w-3.5 sm:block" /> Saldos de banco
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gastos" className="mt-0">
        {esperandoDeepLink ? (
          <Esqueleto />
        ) : hayEmpresaAbierta ? (
          fuente === "mayor" && empresaMayor ? (
            <DetalleEmpresa empresa={empresaMayor} onVolver={volver} />
          ) : empresaEgresos ? (
            <DetalleEgresos empresa={empresaEgresos} onVolver={volver} />
          ) : null
        ) : (
          <>
            <div className="mb-4">
              {/* La bajada se QUEDA: dice qué se está viendo y su corte mensual.
                  De DÓNDE sale el número lo dice el selector de fuente, que es lo
                  único que puede decirlo ahora que hay dos. */}
              <p className="text-sm text-gray-600">
                Lo que salió de cada empresa, mes por mes.
              </p>
            </div>

            <div className="mb-4">
              <SelectorFuente fuente={fuente} onCambiar={setFuenteParam} />
            </div>

            <div className="mb-4">
              <SelectorMes mes={mes} mesTope={hoyMes} onCambiar={setMesParam} />
            </div>

            {isLoading && !data ? (
              <Esqueleto />
            ) : error && !data ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">
                  No se pudo cargar la información. Revisa tu conexión.
                </p>
                <button
                  onClick={() => mutate()}
                  className="mt-3 min-h-[44px] rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.97]"
                >
                  Reintentar
                </button>
              </div>
            ) : data && !data.instalado ? (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-sm font-medium text-gray-900">
                  Esta parte todavía no está encendida.
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {fuente === "egresos"
                    ? "Falta el último paso de instalación para ver lo que sale de caja y banco. Mientras tanto podés ver lo que cerró la contadora."
                    : "Falta el último paso de instalación. Cuando esté listo, acá vas a ver lo que gastó cada empresa mes por mes."}
                </p>
              </div>
            ) : fuente === "mayor" && mayor.data ? (
              <ResumenEmpresas empresas={mayor.data.empresas} onAbrir={abrirEmpresa} />
            ) : fuente === "egresos" && egresos.data ? (
              <ResumenEgresos empresas={egresos.data.empresas} onAbrir={abrirEmpresa} />
            ) : null}
          </>
        )}
          </TabsContent>

          <TabsContent value="saldos-banco" className="mt-0">
            <SaldosBancoTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg border border-gray-200 bg-white" />
      ))}
    </div>
  );
}
