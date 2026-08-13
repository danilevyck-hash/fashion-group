"use client";

// Gastos según la contabilidad (el mayor que trae Switch), POR EMPRESA.
//
// Daniel, textual: "deberiamos de ver los gastos o la info por empresa no total
// del grupo" y "los top key importante de info nada mas". Por eso no hay fila de
// total del grupo y la primera pantalla son cuatro números por empresa.
//
// 🔑 Un mes sin contabilidad NO se ve como $0 — ver `EstadoMesTag`.

import { Suspense, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import AppHeader from "@/components/AppHeader";
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

  // Se pide SOLO la fuente elegida. Traer las dos y esconder una haría el doble
  // de consultas contra una base en compute Micro para pintar la mitad — y, peor,
  // dejaría las dos cifras en la misma pantalla listas para que alguien las sume.
  const pedirMayor = authChecked && fuente === "mayor";
  const pedirEgresos = authChecked && fuente === "egresos";

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
  const nombreAbierto =
    fuente === "mayor" ? (empresaMayor?.nombre ?? null) : (empresaEgresos?.nombre ?? null);
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
              {/* Sin título grande: "Gastos" ya lo dicen la barra sticky
                  (celular) y el breadcrumb (escritorio). Queda sr-only para no
                  dejar la página sin encabezado. La bajada se QUEDA: dice qué se
                  está viendo y su corte mensual. De DÓNDE sale el número lo dice
                  el selector de fuente, que es lo único que puede decirlo ahora
                  que hay dos. */}
              <h1 className="sr-only">Gastos</h1>
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
