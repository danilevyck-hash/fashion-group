"use client";

// Ventas › Resumen con «Rango de fechas» (Daniel, 5-oct-2026): el número grande
// del rango y una fila por empresa, contra los MISMOS días del año pasado.
// Mismas fuentes y misma regla del margen que el Resumen (`rango-ventas.ts`).

import useSWR from "swr";
import { NumeroDelResumen } from "./NumeroDelResumen";
import { FrescuraVentasCel } from "./celular/MenuVentasCelular";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { fmtMoney, fmtPorcentaje } from "@/lib/ventas/format";
import { variacionPct } from "@/lib/variacion";
import { cambioDeLaTira } from "@/lib/ventas/celular";
import { colorDelSigno } from "@/components/celular/Piezas";
import { etiquetaRangoCorta } from "@/lib/ui/calendario-simple";
import { numerosDelRango, type FilaResumenRango, type ResumenRango as Datos } from "@/lib/ventas/rango-ventas";

export function ResumenRango({ desde, hasta, celular }: { desde: string; hasta: string; celular: boolean }) {
  const { data, error, isLoading, mutate } = useSWR<Datos>(
    `/api/ventas/resumen-rango?desde=${desde}&hasta=${hasta}`,
    async (u: string) => {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 5 * 60_000 },
  );

  if (error && !data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-700">
        No se pudo calcular el rango. <button onClick={() => void mutate()} className="text-blue-600 hover:text-blue-800">Reintentar</button>
      </div>
    );
  }
  if (!data) return <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-busy={isLoading} />;

  const anioPrevio = data.anterior.hasta.slice(0, 4);
  const pie = [
    `vs ${etiquetaRangoCorta(data.anterior.desde, data.anterior.hasta)} ${anioPrevio}, mismos días`,
    data.corteCosto && data.corteCosto < data.hasta ? `utilidad y margen hasta el ${etiquetaRangoCorta(data.corteCosto, data.corteCosto)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div data-resumen-rango className="space-y-3">
      <NumeroDelResumen
        forma={celular ? "celular" : "computadora"}
        numeros={numerosDelRango(data.total)}
        derecha={<FrescuraVentasCel forma="computadora" onActualizado={() => void mutate()} />}
      />
      <div className={celular ? "px-4" : ""}>
        <table className="w-full border-collapse rounded-lg border border-gray-200 bg-white text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2.5 font-normal">Empresa</th>
              <th className="px-3 py-2.5 text-right font-normal">Venta</th>
              <th className="px-3 py-2.5 text-right font-normal">vs {anioPrevio}</th>
              <th className="hidden px-3 py-2.5 text-right font-normal sm:table-cell">Utilidad</th>
              <th className="px-3 py-2.5 text-right font-normal">Margen</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map(f => <Fila key={f.empresa_key} f={f} nombre={nombreCortoEmpresa(f.empresa_key)} />)}
            <Fila f={data.total} nombre="Total" total />
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">{pie}</p>
      </div>
    </div>
  );
}

function Fila({ f, nombre, total = false }: { f: FilaResumenRango; nombre: string; total?: boolean }) {
  const d = variacionPct(f.venta, f.ventaPrevio);
  return (
    <tr className={total ? "font-medium text-gray-900" : "border-b border-gray-100 text-gray-900"}>
      <td className="px-3 py-2.5">{nombre}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(f.venta)}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${colorDelSigno(d)}`}>{cambioDeLaTira(d) ?? "Nuevo"}</td>
      <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{f.utilidad == null ? "—" : fmtMoney(f.utilidad)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtPorcentaje(f.margen)}</td>
    </tr>
  );
}
