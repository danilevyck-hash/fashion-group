"use client";

// La 2ª pestaña de "Gastos": los saldos de banco.
//
// Es la MISMA pantalla que vivió en `/saldos-banco` — se mudó entera, no se
// recortó: la carga manual por empresa, la corrección por fecha y (nuevo) el
// historial de lo cargado. Lo único que perdió es su `AppHeader` y su `<h1>`,
// que ahora los pone la página anfitriona (dos encabezados en una página serían
// uno de más).

import useSWR from "swr";
import SaldosBancarios from "./SaldosBancarios";
import { API_BASE, type RespuestaSaldos } from "./types";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("err");
    return r.json();
  });

export default function SaldosBancoTab() {
  const { data, error, isLoading, mutate } = useSWR<RespuestaSaldos>(API_BASE, fetcher, {
    revalidateOnFocus: true,
  });

  return (
    <div className="max-w-xl">
      {isLoading && !data ? (
        <SkeletonSaldos />
      ) : error && !data ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">No se pudo cargar la información. Revisa tu conexión.</p>
          <button
            onClick={() => mutate()}
            className="mt-3 min-h-[44px] rounded-md bg-black text-white px-4 py-2.5 text-sm font-medium active:scale-[0.97] transition"
          >
            Reintentar
          </button>
        </div>
      ) : data ? (
        <SaldosBancarios
          bancos={data.bancos}
          historial={data.historial}
          onGuardado={() => mutate()}
          titulo={null}
        />
      ) : null}
    </div>
  );
}

function SkeletonSaldos() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden="true">
      <div className="h-4 rounded bg-gray-200/70 w-28" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-gray-200/70" />
      ))}
    </div>
  );
}
