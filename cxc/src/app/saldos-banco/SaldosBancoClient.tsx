"use client";

import useSWR from "swr";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import SaldosBancarios from "./components/SaldosBancarios";
import { API_BASE, type RespuestaSaldos } from "./components/types";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("err");
    return r.json();
  });

export default function SaldosBancoClient() {
  const { authChecked } = useAuth({ moduleKey: "saldos-banco", allowedRoles: ["admin", "contabilidad"] });

  const { data, error, isLoading, mutate } = useSWR<RespuestaSaldos>(
    authChecked ? API_BASE : null,
    fetcher,
    { revalidateOnFocus: true },
  );

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Saldos de Banco" />
      <main className="max-w-xl mx-auto px-4 py-6 pb-[env(safe-area-inset-bottom)]">
        <div className="mb-5">
          {/* Sin título grande: "Saldos de Banco" ya lo dicen la barra sticky
              (celular) y el breadcrumb (escritorio). Queda sr-only para no
              dejar la página sin encabezado. La bajada se QUEDA: es la que ata
              este número con la "Disponibilidad" de Vista General. */}
          <h1 className="sr-only">Saldos de Banco</h1>
          <p className="text-sm text-gray-600">
            Lo que hay en el banco de cada empresa. Es lo que la Vista General muestra como
            &ldquo;Disponibilidad&rdquo;.
          </p>
        </div>

        {isLoading && !data ? (
          <SkeletonSaldos />
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
          <SaldosBancarios bancos={data.bancos} onGuardado={() => mutate()} titulo={null} />
        ) : null}
      </main>
    </div>
  );
}

function SkeletonSaldos() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 rounded bg-gray-200/70 w-28" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-gray-200/70" />
      ))}
    </div>
  );
}
