"use client";

// Vendedores de una fecha a otra: ventas, comisión bruta y la variación contra
// el período anterior equivalente. Solo CONSULTA: sin descargas ni descuentos
// (lo que se paga es el mes cerrado). Reglas en `lib/comisiones/vendedores-rango.ts`.

import { useEffect, useState } from "react";
import { fmtMoney, fmtPorcentaje } from "@/lib/ventas/format";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { ROTULO_VER_MENOS, rotuloVerNoSePagan, sePagaComision } from "@/lib/comisiones/sin-pago";
import { etiquetaRango } from "@/components/ui/RangoFechas";
import { CALENDARIO_SIMPLE_2026_10, etiquetaRangoCorta } from "@/lib/ui/calendario-simple";
import { diasDelRango, porVendedor, type FilaRango, type FilaVendedor, type RangoConsulta } from "@/lib/comisiones/vendedores-rango";
import { esVistaDeEmpresa, esVistaMultifashion } from "@/lib/comisiones/vistas";
import { variacionPct } from "@/lib/variacion";

interface Respuesta {
  anterior: { desde: string; hasta: string };
  actual: FilaRango[];
  previo: FilaRango[];
}

function Variacion({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400">Nuevo</span>;
  const color = v > 0.05 ? "text-emerald-700" : v < -0.05 ? "text-red-600" : "text-gray-500";
  return <span className={color}>{v > 0 ? "+" : ""}{fmtPorcentaje(v)}</span>;
}

export function ComisionesVendedoresRango({ vista, rango }: { vista: string; rango: RangoConsulta }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verNoPagables, setVerNoPagables] = useState(false);
  const multifashion = esVistaMultifashion(vista);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    const q = new URLSearchParams({
      desde: rango.desde, hasta: rango.hasta,
      ambito: multifashion ? "american_classic" : "grupo",
      ...(rango.atajo ? { atajo: rango.atajo } : {}),
    });
    fetch(`/api/ventas/comisiones/rango?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "No se pudo calcular el rango. Intenta de nuevo.");
        if (vivo) setDatos(j as Respuesta);
      })
      .catch((e: Error) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [rango.desde, rango.hasta, rango.atajo, multifashion]);

  if (error) return <p className="mt-4 rounded-lg border border-gray-200 p-4 text-sm text-gray-700">{error}</p>;
  if (!datos) return <div className="mt-4 h-72 w-full animate-pulse rounded-lg bg-gray-100" aria-hidden />;

  const filas = porVendedor(datos.actual, datos.previo, esVistaDeEmpresa(vista) ? vista : null);
  const pagables = filas.filter((f) => sePagaComision(f.vendedor));
  const noPagables = filas.filter((f) => !sePagaComision(f.vendedor));
  const visibles = verNoPagables ? [...pagables, ...noPagables] : pagables;
  const total = (k: "ventas" | "comision" | "ventasAnterior") => visibles.reduce((a, f) => a + f[k], 0);
  const totalAnt = total("ventasAnterior");

  const fila = (f: FilaVendedor) => (
    <tr key={f.vendedor} className={`border-t border-gray-100 ${sePagaComision(f.vendedor) ? "" : "text-gray-400"}`}>
      <td className="px-3 py-2.5 text-gray-900">{nombreVendedorEnPantalla(f.vendedor)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {fmtMoney(f.ventas)}
        <div className="text-xs sm:hidden"><Variacion v={f.variacion} /></div>
      </td>
      <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell"><Variacion v={f.variacion} /></td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(f.comision)}</td>
    </tr>
  );

  return (
    <div className="mt-3" data-vendedores-rango>
      {/* CALENDARIO_SIMPLE_2026_10: la línea se va al pie, corta. */}
      {!CALENDARIO_SIMPLE_2026_10 && (
      <p className="mb-2 px-1 text-sm text-gray-500">
        {etiquetaRango(rango.desde, rango.hasta)} · contra {etiquetaRango(datos.anterior.desde, datos.anterior.hasta).split(" · ")[0]}
      </p>
      )}
      {filas.length === 0 ? (
        <p className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600">Sin ventas en el período</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{multifashion ? "Vendedora" : "Vendedor"}</th>
                <th className="px-3 py-2 text-right font-medium">Ventas</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Variación</th>
                <th className="px-3 py-2 text-right font-medium">Comisión bruta</th>
              </tr>
            </thead>
            <tbody>
              {pagables.map(fila)}
              {noPagables.length > 0 && (
                <tr className="border-t border-gray-100">
                  <td colSpan={4} className="px-3">
                    <button
                      type="button"
                      onClick={() => setVerNoPagables((v) => !v)}
                      className="inline-flex min-h-[44px] items-center text-xs text-gray-400 transition hover:text-gray-600"
                    >
                      {verNoPagables ? ROTULO_VER_MENOS : rotuloVerNoSePagan(noPagables.length)}
                    </button>
                  </td>
                </tr>
              )}
              {verNoPagables && noPagables.map(fila)}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtMoney(total("ventas"))}
                  <div className="text-xs font-normal sm:hidden">
                    <Variacion v={variacionPct(total("ventas"), totalAnt)} />
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                  <Variacion v={variacionPct(total("ventas"), totalAnt)} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(total("comision"))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {CALENDARIO_SIMPLE_2026_10 && (
        <p className="mt-2 px-1 text-xs text-gray-500" data-pie-rango>
          {pieDelRango(rango.desde, rango.hasta, datos.anterior)}
        </p>
      )}
    </div>
  );
}

/** «16 días · vs 15–30 sep 2025». */
export function pieDelRango(desde: string, hasta: string, anterior: { desde: string; hasta: string }): string {
  const n = diasDelRango(desde, hasta);
  const a = etiquetaRangoCorta(anterior.desde, anterior.hasta);
  const anio = anterior.desde.slice(0, 4) === anterior.hasta.slice(0, 4) ? ` ${anterior.desde.slice(0, 4)}` : "";
  return `${n} ${n === 1 ? "día" : "días"} · vs ${a}${anio}`;
}
