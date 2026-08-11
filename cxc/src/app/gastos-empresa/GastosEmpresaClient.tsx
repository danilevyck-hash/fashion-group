"use client";

import { Suspense, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import {
  ALL_EMPRESA_KEYS,
  API_BASE,
  GRUPO_KEY,
  empresaNombre,
  mesActual,
  mesValido,
  type Resumen,
  sameId,
} from "./components/types";
import ChecklistView from "./components/ChecklistView";
import EmpresaGastosForm from "./components/EmpresaGastosForm";
// Los saldos de banco se mudaron a su propio módulo (/saldos-banco). Esta
// pantalla los sigue mostrando —el mismo componente, la misma tabla— hasta que
// el módulo viejo se retire: sacárselos antes dejaría a contabilidad sin
// ninguna puerta al dato si el menú nuevo todavía no le llegó.
import SaldosBancarios from "@/app/saldos-banco/components/SaldosBancarios";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("err");
    return r.json();
  });

// useSearchParams (vía useUrlState) exige boundary de Suspense.
export default function GastosEmpresaClient() {
  return (
    <Suspense>
      <GastosEmpresaInner />
    </Suspense>
  );
}

function GastosEmpresaInner() {
  const { authChecked } = useAuth({ moduleKey: "gastos-empresa", allowedRoles: ["admin", "contabilidad"] });
  const router = useRouter();

  const hoyMes = useMemo(() => mesActual(), []);
  // ?mes= es un filtro del MISMO nivel → replace (no ensucia el historial).
  const [mesParam, setMesParam] = useUrlState("mes", hoyMes);
  // Nunca meses futuros ni valores malformados.
  const mes = mesValido(mesParam) && mesParam <= hoyMes ? mesParam : hoyMes;

  // ?empresa= es drill-down (checklist → formulario) → push, para que el
  // Back del navegador regrese al checklist.
  const [empresaParam, setEmpresaParam] = useUrlState("empresa", "", { history: "push" });
  const empresa =
    empresaParam === GRUPO_KEY || (ALL_EMPRESA_KEYS as readonly string[]).includes(empresaParam)
      ? empresaParam
      : "";

  // ¿El formulario se abrió tocando el checklist en esta sesión? Si sí, el
  // "volver" usa router.back() (deshace el push). Si se llegó por deep-link,
  // se limpia el param para no salir de la app.
  const abiertoDesdeChecklist = useRef(false);

  const { data, error, isLoading, mutate } = useSWR<Resumen>(
    authChecked ? `${API_BASE}/resumen?mes=${mes}` : null,
    fetcher,
    { revalidateOnFocus: true },
  );

  if (!authChecked) return null;

  const abrirEmpresa = (key: string) => {
    abiertoDesdeChecklist.current = true;
    setEmpresaParam(key);
  };

  const volverAlChecklist = () => {
    if (abiertoDesdeChecklist.current) {
      abiertoDesdeChecklist.current = false;
      router.back();
    } else {
      setEmpresaParam("");
    }
  };

  const gastosDeEmpresa = empresa && data ? data.gastos.filter((g) => g.empresa_key === empresa) : [];
  const categoriasActivas = data
    ? data.categorias.filter((c) => c.activo).sort((a, b) => a.orden - b.orden || String(a.nombre).localeCompare(String(b.nombre)))
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        module="Gastos de Empresa"
        breadcrumbs={empresa ? [{ label: empresaNombre(empresa) }] : undefined}
      />
      <main className="max-w-xl mx-auto px-4 py-6 pb-[env(safe-area-inset-bottom)]">
        {!empresa && (
          <div className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">Gastos de Empresa</h1>
          </div>
        )}

        {isLoading && !data ? (
          <SkeletonGastos />
        ) : error && !data ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">No se pudo cargar la información. Revisa tu conexión.</p>
            <button
              onClick={() => mutate()}
              className="mt-3 rounded-md bg-black text-white px-4 py-2.5 text-sm font-medium active:scale-[0.97] transition"
            >
              Reintentar
            </button>
          </div>
        ) : data ? (
          empresa ? (
            <EmpresaGastosForm
              key={`${empresa}-${mes}`}
              empresaKey={empresa}
              mes={mes}
              categorias={categoriasActivas}
              gastosIniciales={gastosDeEmpresa.filter((g) =>
                categoriasActivas.some((c) => sameId(c.id, g.categoria_id)),
              )}
              onVolver={volverAlChecklist}
              onGuardado={async () => {
                await mutate();
                volverAlChecklist();
              }}
              onCategoriaCreada={() => mutate()}
            />
          ) : (
            <>
              <ChecklistView
                data={data}
                mes={mes}
                hoyMes={hoyMes}
                onCambiarMes={setMesParam}
                onAbrirEmpresa={abrirEmpresa}
                onRefrescar={() => mutate()}
              />
              <SaldosBancarios bancos={data.bancos} onGuardado={() => mutate()} />
            </>
          )
        ) : null}
      </main>
    </div>
  );
}

function SkeletonGastos() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-11 rounded-lg bg-gray-200/70 w-56 mx-auto" />
      <div className="h-10 rounded-lg bg-gray-200/70" />
      <div className="h-16 rounded-lg bg-gray-200/70" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg bg-gray-200/70" />
      ))}
    </div>
  );
}
