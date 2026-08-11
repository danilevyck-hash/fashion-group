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
import { API_BASE, mesActual, mesValido, type RespuestaResumen } from "./components/tipos";
import SelectorMes from "./components/SelectorMes";
import ResumenEmpresas from "./components/ResumenEmpresas";
import DetalleEmpresa from "./components/DetalleEmpresa";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("err");
    return r.json() as Promise<RespuestaResumen>;
  });

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

  // ¿El desglose se abrió tocando una empresa en ESTA sesión? Si sí, "Volver"
  // deshace el push del historial. Si se llegó por deep link no hay nada que
  // deshacer y hacer back sacaría a la persona de la app.
  const abiertoDesdeLista = useRef(false);

  const { data, error, isLoading, mutate } = useSWR<RespuestaResumen>(
    authChecked ? `${API_BASE}/resumen?mes=${mes}` : null,
    fetcher,
    { revalidateOnFocus: true },
  );

  // Hooks ANTES de cualquier return condicional (regla del repo).
  const empresaAbierta = useMemo(
    () => data?.empresas.find((e) => e.empresaKey === empresaParam) ?? null,
    [data, empresaParam],
  );

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
        breadcrumbs={empresaAbierta ? [{ label: empresaAbierta.nombre }] : undefined}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-[env(safe-area-inset-bottom)]">
        {esperandoDeepLink ? (
          <Esqueleto />
        ) : empresaAbierta ? (
          <DetalleEmpresa empresa={empresaAbierta} onVolver={volver} />
        ) : (
          <>
            <div className="mb-4">
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">
                Gastos
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Lo que gastó cada empresa según la contabilidad, mes por mes.
              </p>
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
                  Esta pantalla todavía no está encendida.
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Falta el último paso de instalación. Cuando esté listo, acá vas a ver lo que
                  gastó cada empresa mes por mes.
                </p>
              </div>
            ) : data ? (
              <ResumenEmpresas empresas={data.empresas} onAbrir={abrirEmpresa} />
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
