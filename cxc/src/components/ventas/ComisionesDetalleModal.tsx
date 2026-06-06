"use client";

// Reporte detallado de comisión de un vendedor (período) — tab Comisiones.
// Replica el Excel manual: sección VENTAS, sección COBROS, cierre.
// Exporta a Excel (xlsx-js-style) y es imprimible.

import { useEffect, useState } from "react";
import { X, Download, Printer } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtDate } from "@/lib/format";
import { exportComisionDetalle, type ComisionDetalle } from "@/lib/ventas/comisionExcel";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface Props {
  empresa: string;
  empresaNombre: string;
  year: number;
  mes: number;
  vendedor: string;
  onClose: () => void;
}

export function ComisionesDetalleModal({ empresa, empresaNombre, year, mes, vendedor, onClose }: Props) {
  const [data, setData] = useState<ComisionDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/ventas/comisiones/detalle?empresa=${empresa}&year=${year}&mes=${mes}&vendedor=${encodeURIComponent(vendedor)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        if (alive) setData((await res.json()) as ComisionDetalle);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "No se pudo cargar.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [empresa, year, mes, vendedor]);

  const pctTasaV = data ? (data.tasa_venta * 100).toFixed(2) : "";
  const pctTasaC = data ? (data.tasa_cobro * 100).toFixed(2) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:static print:block print:bg-white print:p-0">
      <div className="my-6 w-full max-w-3xl rounded-lg border border-gray-200 bg-white shadow-lg print:my-0 print:max-w-full print:border-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Comisión — {vendedor}</h2>
            <p className="text-xs text-gray-500">{empresaNombre} · {MESES[mes - 1]} {year}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => data && exportComisionDetalle(data, empresaNombre)}
              disabled={!data}
              className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-sm text-white transition active:scale-[0.97] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:border-black active:scale-[0.97]"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-rose-600">{error}</div>
          ) : data ? (
            <div className="space-y-6">
              {/* VENTAS */}
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Ventas</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Factura</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                        <th className="px-3 py-2 text-right font-medium">% Util.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ventas.length === 0 ? (
                        <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Sin ventas comisionables.</td></tr>
                      ) : data.ventas.map((v, i) => (
                        <tr key={i} className={`border-b border-gray-100 last:border-0 ${v.subtotal < 0 ? "text-rose-600" : "text-gray-800"}`}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(v.fecha)}</td>
                          <td className="px-3 py-1.5">{v.cliente}</td>
                          <td className="px-3 py-1.5 tabular-nums text-gray-500">{v.secuencial}{v.tipo === "Nota de Crédito" ? " (NC)" : ""}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(v.subtotal)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{v.tipo === "Nota de Crédito" || v.pct_utilidad == null || !Number.isFinite(v.pct_utilidad) ? "—" : `${v.pct_utilidad.toFixed(1)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-3 py-2" colSpan={3}>Total ventas</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.ventas_base)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {/* COBROS */}
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Cobros</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cobros.length === 0 ? (
                        <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">Sin cobros comisionables.</td></tr>
                      ) : data.cobros.map((c, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0 text-gray-800">
                          <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(c.fecha)}</td>
                          <td className="px-3 py-1.5">{c.cliente}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(c.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-3 py-2" colSpan={2}>Total cobros</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.cobros_base)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="mt-1 text-[11px] text-gray-400">El API de Switch no expone el número de recibo.</p>
              </section>

              {/* CIERRE */}
              <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Cierre</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Ventas {fmtMoney(data.ventas_base)} × {pctTasaV}%</dt>
                    <dd className="tabular-nums text-gray-900">{fmtMoney(data.comision_venta)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Cobros {fmtMoney(data.cobros_base)} × {pctTasaC}%</dt>
                    <dd className="tabular-nums text-gray-900">{fmtMoney(data.comision_cobro)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-gray-300 pt-1.5 text-base font-semibold">
                    <dt>Comisión total</dt>
                    <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
