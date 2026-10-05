"use client";

// Multifashion › Resumen con «Rango de fechas» (RESUMEN_RANGO_2026_10): la venta
// retail del rango en grande, ▲/▼ contra los mismos días del año pasado, y el
// día por día. Celular y computadora. Reglas: `lib/multifashion/resumen-rango.ts`.

import useSWR from "swr";
import { fmtMoney } from "@/lib/ventas/format";
import { variacionPct, fmtVariacionPct } from "@/lib/variacion";
import { colorDelSigno } from "@/components/celular/Piezas";
import { etiquetaRangoCorta } from "@/lib/ui/calendario-simple";
import type { ResumenRango } from "@/lib/multifashion/resumen-rango";

export function ResumenRangoMf({ desde, hasta }: { desde: string; hasta: string }) {
  const { data, error, isLoading, mutate } = useSWR<ResumenRango>(
    `/api/multifashion/resumen-rango?desde=${desde}&hasta=${hasta}`,
    async (u: string) => {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-700">
        No se pudo cargar el rango. <button onClick={() => void mutate()} className="text-blue-600 hover:text-blue-800">Reintentar</button>
      </div>
    );
  }
  if (!data) return <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-busy={isLoading} />;

  const { actual, previo } = data;
  const delta = variacionPct(actual.ventas, previo.ventas);
  const anioPasado = previo.desde.slice(0, 4);
  const max = Math.max(1, ...actual.dias.map((d) => d.ventas));
  const promedio = actual.tickets > 0 ? actual.ventas / actual.tickets : null;

  return (
    <div data-resumen-rango className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[40px] font-normal leading-none tracking-tight tabular-nums text-gray-800">{fmtMoney(actual.ventas)}</span>
          {delta != null && (
            <span className={`text-[15px] ${colorDelSigno(delta)}`}>{delta >= 0 ? "▲" : "▼"} {fmtVariacionPct(delta)}</span>
          )}
        </div>
        <p className="mt-1.5 text-sm text-gray-500">
          vs {etiquetaRangoCorta(previo.desde, previo.hasta)}{previo.desde.slice(0, 4) === previo.hasta.slice(0, 4) ? ` ${anioPasado}` : ""} · {fmtMoney(previo.ventas)}
          {" · "}{actual.tickets.toLocaleString("en-US")} tickets
          {promedio != null && <> · ticket promedio {fmtMoney(promedio)}</>}
        </p>
      </div>
      {actual.dias.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex h-40 items-end gap-px" aria-label="Ventas día por día">
            {actual.dias.map((d) => (
              <div
                key={d.fecha}
                title={`${etiquetaRangoCorta(d.fecha, d.fecha)} · ${fmtMoney(d.ventas)}`}
                className="min-w-[2px] flex-1 rounded-t-sm bg-gray-900"
                style={{ height: `${Math.max(0, (d.ventas / max) * 100)}%` }}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {etiquetaRangoCorta(actual.desde, actual.hasta)} · {actual.dias.length} días con venta · retail
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-500">Sin ventas en el rango.</p>
      )}
    </div>
  );
}
