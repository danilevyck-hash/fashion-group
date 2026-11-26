"use client";

// Despachos › Pedidos › «Facturados» (26-nov-2026, `PEDIDOS_PIPELINE_2026_11`):
// facturas del grupo que todavía no entraron a ninguna guía. Misma tabla que
// Pedidos: agrupada por empresa, del más viejo al más nuevo. Al entrar en una
// guía, desaparece sola (la lista se relee de la base).

import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { facturaParaMostrar } from "@/lib/guias/numero-factura";
import { diasDesde, haceDias, haceDiasCorto } from "@/lib/guias/pedidos-bodega";

export interface Facturado {
  empresa_key: string;
  secuencial: string;
  /** ISO de Switch. */
  fecha: string;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
  /** Bultos de su etiqueta; null = sin etiquetar. */
  bultos: number | null;
  /** Solo viaja para quien ve montos (`montoDelPedido`). */
  monto?: number | null;
}

interface Props {
  filas: readonly Facturado[];
  hoy: string;
  /** Celular: tarjetas de dos líneas en vez de tabla. */
  celular?: boolean;
}

/** Más de dos semanas sin guía se pinta en ámbar (aviso). */
const DIAS_AVISO = 14;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function Accion({ f, alta }: { f: Facturado; alta?: boolean }) {
  const h = alta ? "h-11 px-3.5 text-[14px]" : "h-7 px-2.5 text-xs";
  return f.bultos ? (
    <a href="/despachos/nueva" className={`inline-flex shrink-0 items-center rounded-full border border-gray-900 bg-gray-900 font-medium text-white transition active:scale-[0.97] ${h}`}>Crear guía</a>
  ) : (
    <a href="/despachos?vista=etiquetas" className={`inline-flex shrink-0 items-center rounded-full border border-gray-300 bg-white font-medium text-gray-900 transition active:scale-[0.97] ${h}`}>Etiquetar</a>
  );
}

export default function FacturadosLista({ filas, hoy, celular }: Props) {
  const conMonto = filas.some((f) => typeof f.monto === "number");
  const grupos = B2B_EMPRESA_KEYS.map((k) => ({
    k,
    filas: filas.filter((f) => f.empresa_key === k).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.secuencial.localeCompare(b.secuencial)),
  })).filter((g) => g.filas.length > 0);
  const columnas = conMonto ? 5 : 4;

  if (celular) {
    // Tarjeta de dos líneas: cliente + monto arriba; factura · antigüedad · bultos abajo; la acción a la derecha.
    return (
      <div className="-mx-4 border-y border-gray-200 bg-white">
        {grupos.map((g) => (
          <section key={g.k}>
            <h3 className="bg-gray-50 px-4 py-2 text-[13px] font-semibold text-gray-900">{nombreCortoEmpresa(g.k)} · {g.filas.length}</h3>
            <ul className="divide-y divide-gray-100">
              {g.filas.map((f) => {
                const viejo = diasDesde(f.fecha, hoy) > DIAS_AVISO;
                return (
                  <li key={f.empresa_key + f.secuencial} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-gray-900">{f.cliente_nombre}</span>
                        {typeof f.monto === "number" && <span className="shrink-0 text-[14px] tabular-nums text-gray-700">{usd(f.monto)}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-gray-500">
                        Factura {facturaParaMostrar(f.secuencial)} · <span className={viejo ? "font-medium text-amber-700" : ""}>{haceDiasCorto(f.fecha, hoy)}</span>
                        {f.bultos ? ` · ${f.bultos} ${f.bultos === 1 ? "bulto" : "bultos"}` : ""}
                      </p>
                    </div>
                    <Accion f={f} alta />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead className="border-b border-gray-200 text-xs font-medium text-gray-400 sm:uppercase sm:tracking-wide">
          <tr>
            <th className="py-2 pl-3 pr-1 sm:px-3"><span className="sm:hidden">Antig.</span><span className="hidden sm:inline">Antigüedad</span></th>
            <th className="px-1 py-2 sm:px-3">Cliente</th>
            {conMonto && <th className="hidden px-3 py-2 text-right sm:table-cell">Monto</th>}
            <th className="hidden px-3 py-2 text-right sm:table-cell">Bultos</th>
            <th className="py-2 pl-0.5 pr-3 text-right sm:px-3"><span className="sr-only">Acción</span></th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.k} className="divide-y divide-gray-100 align-top">
            <tr className="bg-gray-50">
              <th colSpan={columnas} scope="colgroup" className="px-3 py-2 text-left text-sm font-semibold text-gray-900">
                {nombreCortoEmpresa(g.k)} · {g.filas.length}
              </th>
            </tr>
            {g.filas.map((f) => {
              const viejo = diasDesde(f.fecha, hoy) > DIAS_AVISO;
              return (
                <tr key={f.empresa_key + f.secuencial}>
                  <td className={`whitespace-nowrap py-2 pl-3 pr-1 sm:px-3 ${viejo ? "font-medium text-amber-700" : "text-gray-700"}`}>
                    <span className="sm:hidden">{haceDiasCorto(f.fecha, hoy)}</span>
                    <span className="hidden sm:inline">{haceDias(f.fecha, hoy)}</span>
                  </td>
                  <td className="break-words px-1 py-2 sm:px-3">
                    <span className="font-medium text-gray-900">{f.cliente_nombre}</span>
                    <span className="block text-xs text-gray-500">
                      Factura {facturaParaMostrar(f.secuencial)}{f.cliente_codigo ? ` · ${f.cliente_codigo}` : ""}
                      {typeof f.monto === "number" && <span className="sm:hidden"> · {usd(f.monto)}</span>}
                      {f.bultos ? <span className="sm:hidden"> · {f.bultos} bultos</span> : null}
                    </span>
                  </td>
                  {conMonto && (
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 sm:table-cell">
                      {typeof f.monto === "number" ? usd(f.monto) : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 sm:table-cell">
                    {f.bultos ? f.bultos : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-0.5 pr-3 text-right sm:px-3">
                    <Accion f={f} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
