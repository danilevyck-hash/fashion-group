"use client";

// Reporte detallado de comisión de un vendedor (período) — tab Comisiones.
// Replica el Excel manual: sección VENTAS, sección COBROS, cierre.
// Exporta a Excel (xlsx-js-style) y es imprimible.

import { useEffect, useState } from "react";
import { X, Download, Printer } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtDate } from "@/lib/format";
import { exportComisionDetalle, tipoDocCorto, type ComisionDetalle, type ComisionDescuento } from "@/lib/ventas/comisionExcel";
import { ModalOverlay } from "@/components/ui";

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const [descuentos, setDescuentos] = useState<ComisionDescuento[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = `empresa=${empresa}&year=${year}&mes=${mes}&vendedor=${encodeURIComponent(vendedor)}`;
        const [resDet, resDesc] = await Promise.all([
          fetch(`/api/ventas/comisiones/detalle?${qs}`, { cache: "no-store" }),
          fetch(`/api/ventas/comisiones/descuentos?${qs}`, { cache: "no-store" }),
        ]);
        if (!resDet.ok) {
          const b = await resDet.json().catch(() => ({}));
          throw new Error(b.error ?? `HTTP ${resDet.status}`);
        }
        if (alive) setData((await resDet.json()) as ComisionDetalle);
        // Los descuentos son opcionales (solo algunos vendedores los tienen).
        if (resDesc.ok) {
          const dj = (await resDesc.json()) as { descuentos?: ComisionDescuento[] };
          if (alive) setDescuentos(Array.isArray(dj.descuentos) ? dj.descuentos : []);
        } else if (alive) {
          setDescuentos([]);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "No se pudo cargar.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [empresa, year, mes, vendedor]);

  async function toggleDescuento(id: string, activo: boolean) {
    if (togglingId) return;
    setTogglingId(id);
    // Optimista: refleja el cambio y revierte si falla.
    setDescuentos((prev) => prev.map((d) => (d.id === id ? { ...d, activo } : d)));
    try {
      const res = await fetch(`/api/ventas/comisiones/descuentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descuento_id: id, year, mes, activo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDescuentos((prev) => prev.map((d) => (d.id === id ? { ...d, activo: !activo } : d)));
    } finally {
      setTogglingId(null);
    }
  }

  const descActivos = descuentos.filter((d) => d.activo);
  const totalAPagar = data
    ? round2(data.comision_total - descActivos.reduce((s, d) => s + d.monto, 0))
    : 0;

  const pctTasaV = data ? (data.tasa_venta * 100).toFixed(2) : "";
  const pctTasaC = data ? (data.tasa_cobro * 100).toFixed(2) : "";

  return (
    <ModalOverlay
      align="start"
      backdropClassName="bg-black/40"
      className="overflow-y-auto p-4 print:static print:block print:bg-white print:p-0"
    >
      {/* id="print-document": globals.css oculta todo en @media print salvo este
          nodo; sin él, window.print() imprime una hoja en blanco. Los botones de
          acción del header ya van en un contenedor print:hidden. */}
      <div id="print-document" className="my-6 w-full max-w-3xl rounded-lg border border-gray-200 bg-white shadow-lg print:my-0 print:max-w-full print:border-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Comisión — {vendedor}</h2>
            <p className="text-xs text-gray-500">{empresaNombre} · {MESES[mes - 1]} {year}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => data && exportComisionDetalle(data, empresaNombre, descActivos)}
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
                        <th className="px-3 py-2 text-center font-medium">Tipo</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                        {/* % Utilidad: solo pantalla. print:hidden → fuera del reporte físico. */}
                        <th className="px-3 py-2 text-right font-medium print:hidden">% Util.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ventas.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Sin ventas comisionables.</td></tr>
                      ) : data.ventas.map((v, i) => (
                        <tr key={i} className={`border-b border-gray-100 last:border-0 ${v.subtotal < 0 ? "text-rose-600" : "text-gray-800"}`}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(v.fecha)}</td>
                          <td className="px-3 py-1.5">{v.cliente}</td>
                          <td className="px-3 py-1.5 tabular-nums text-gray-500">{v.secuencial}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-gray-500">{tipoDocCorto(v.tipo)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(v.subtotal)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 print:hidden">{v.tipo === "Nota de Crédito" || v.pct_utilidad == null || !Number.isFinite(v.pct_utilidad) ? "—" : `${v.pct_utilidad.toFixed(1)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-3 py-2" colSpan={4}>Total ventas</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.ventas_base)}</td>
                        <td className="print:hidden"></td>
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
                <p className="mt-1 text-xs text-gray-400">El API de Switch no expone el número de recibo.</p>
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
                  {descuentos.length === 0 ? (
                    <div className="flex justify-between border-t border-gray-300 pt-1.5 text-base font-semibold">
                      <dt>Comisión total</dt>
                      <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between border-t border-gray-300 pt-1.5 font-semibold text-gray-900">
                        <dt>Subtotal comisión</dt>
                        <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                      </div>
                      {/* Descuento inactivo: fila oculta en print (no es deducción del mes). */}
                      {descuentos.map((d) => (
                        <div key={d.id} className={`flex items-center justify-between ${d.activo ? "" : "print:hidden"}`}>
                          <dt className="flex items-center gap-2 text-gray-600">
                            {/* Toggle: solo pantalla (secretaria/admin). No sale en print. */}
                            <label className="print:hidden inline-flex cursor-pointer items-center" title={d.activo ? "Activo este mes — clic para desactivar" : "Desactivado este mes — clic para activar"}>
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={d.activo}
                                disabled={togglingId === d.id}
                                onChange={(e) => toggleDescuento(d.id, e.target.checked)}
                              />
                              <span className="relative h-4 w-7 rounded-full bg-gray-300 transition peer-checked:bg-gray-900 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-3" />
                            </label>
                            <span className={d.activo ? "" : "text-gray-400 line-through"}>{d.concepto}</span>
                          </dt>
                          <dd className={`tabular-nums ${d.activo ? "text-rose-600" : "text-gray-300"}`}>−{fmtMoney(d.monto)}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-gray-300 pt-1.5 text-base font-semibold">
                        <dt>Total a pagar</dt>
                        <dd className="tabular-nums">{fmtMoney(totalAPagar)}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </ModalOverlay>
  );
}
