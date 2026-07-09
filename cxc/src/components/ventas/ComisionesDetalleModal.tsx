"use client";

// Reporte detallado de comisión de un vendedor (período) — tab Comisiones.
// Replica el Excel manual: sección VENTAS, sección COBROS, cierre.
// Exporta a Excel (xlsx-js-style) y es imprimible.
//
// Print: diseñado para caer en EXACTAMENTE 2 páginas fijas (letter landscape,
// definido en globals.css). Página 1 = VENTAS, página 2 = COBROS + CIERRE.
// La escala de fuente por sección se auto-reduce según cantidad de filas para
// que cada sección quepa en su página. Estilos print scopeados aquí (no en
// globals.css, que es compartido con Guías/Caja).

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

// Escala print por rangos de filas — cada sección se reduce de forma
// INDEPENDIENTE para caber en SU página. Tiers cds-s0..cds-s6 (fuente + padding,
// definidos en el <style> scopeado). Calibrado empíricamente para letter
// landscape con margen 1.5cm (alto útil ~7.3in) imprimiendo a PDF y contando
// páginas; los umbrales quedan ~2-3 filas por debajo del máximo medido (margen
// para nombres de cliente largos que ocupen 2 líneas).
//
// La página de VENTAS solo carga su tabla → más capacidad por tier.
function ventasTierClass(rows: number): string {
  if (rows <= 21) return "cds-s0"; // medido: 23
  if (rows <= 26) return "cds-s1"; // 28
  if (rows <= 33) return "cds-s2"; // 36
  if (rows <= 41) return "cds-s3"; // 44
  if (rows <= 52) return "cds-s4"; // 55
  if (rows <= 64) return "cds-s5"; // 67
  if (rows <= 76) return "cds-s6"; // 79
  if (rows <= 94) return "cds-s7"; // 97
  return "cds-s8"; // hasta ~112 (extremo; texto muy pequeño pero cabe)
}
// La página de COBROS además lleva la caja CIERRE + el total Ventas+Cobros →
// ~10 filas menos de capacidad por tier (calibrado con cierre de 3 descuentos).
function cobrosTierClass(rows: number): string {
  if (rows <= 11) return "cds-s0"; // medido: 13
  if (rows <= 15) return "cds-s1"; // 16
  if (rows <= 19) return "cds-s2"; // 20
  if (rows <= 24) return "cds-s3"; // 25
  if (rows <= 30) return "cds-s4"; // 31
  if (rows <= 37) return "cds-s5"; // 39
  if (rows <= 44) return "cds-s6"; // 46
  if (rows <= 54) return "cds-s7"; // 56
  return "cds-s8"; // hasta ~65
}

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

  // Escala independiente por sección. Para cobros, si hay más de 3 descuentos la
  // caja de cierre crece: se suman esas filas extra al conteo para bajar el tier.
  const ventasTier = data ? ventasTierClass(data.ventas.length) : "cds-s0";
  const cobrosTier = data
    ? cobrosTierClass(data.cobros.length + Math.max(0, descuentos.length - 3))
    : "cds-s0";

  // Header compacto (una línea), repetido arriba de cada página en print.
  const headerLinea = `Comisión — ${vendedor.toUpperCase()} · ${empresaNombre} · ${MESES[mes - 1]} ${year}`;
  const compactHeader = (
    <div className="cds-print-header mb-2 hidden items-baseline justify-between border-b border-gray-300 pb-1 text-[11px] print:flex">
      <span className="font-semibold text-gray-900">{headerLinea}</span>
      <span className="font-semibold text-gray-900">Fashion Group</span>
    </div>
  );

  return (
    <ModalOverlay
      align="start"
      backdropClassName="bg-black/40"
      className="overflow-y-auto p-4 print:static print:block print:bg-white print:p-0"
    >
      {/* Estilos print scopeados a este reporte (globals.css es compartido). */}
      <style>{`
        @media print {
          /* Cobros arranca en su propia página → reporte fijo de 2 páginas. */
          #print-document .cds-cobros { break-before: page; page-break-before: always; }
          /* Nunca partir una fila ni la caja de cierre entre páginas. */
          #print-document tr,
          #print-document .cds-cierre { page-break-inside: avoid; break-inside: avoid; }
          /* Auto-reducción de fuente + padding por rango de filas (por sección). */
          #print-document .cds-s0 table { font-size: 11px; }
          #print-document .cds-s0 table th,
          #print-document .cds-s0 table td { padding: 4px 8px !important; }
          #print-document .cds-s1 table { font-size: 9.5px; }
          #print-document .cds-s1 table th,
          #print-document .cds-s1 table td { padding: 3px 6px !important; }
          #print-document .cds-s2 table { font-size: 8px; }
          #print-document .cds-s2 table th,
          #print-document .cds-s2 table td { padding: 2px 5px !important; }
          #print-document .cds-s3 table { font-size: 7px; }
          #print-document .cds-s3 table th,
          #print-document .cds-s3 table td { padding: 1.2px 4px !important; }
          #print-document .cds-s4 table { font-size: 6px; }
          #print-document .cds-s4 table th,
          #print-document .cds-s4 table td { padding: 0.7px 3px !important; }
          #print-document .cds-s5 table { font-size: 5px; }
          #print-document .cds-s5 table th,
          #print-document .cds-s5 table td { padding: 0.4px 3px !important; }
          #print-document .cds-s6 table { font-size: 4.2px; }
          #print-document .cds-s6 table th,
          #print-document .cds-s6 table td { padding: 0.3px 2px !important; }
          #print-document .cds-s7 table { font-size: 3.4px; }
          #print-document .cds-s7 table th,
          #print-document .cds-s7 table td { padding: 0.2px 2px !important; }
          #print-document .cds-s8 table { font-size: 2.9px; }
          #print-document .cds-s8 table th,
          #print-document .cds-s8 table td { padding: 0.15px 1px !important; }
        }
      `}</style>
      {/* id="print-document": globals.css oculta todo en @media print salvo este
          nodo; sin él, window.print() imprime una hoja en blanco. */}
      <div id="print-document" className="my-6 w-full max-w-3xl rounded-lg border border-gray-200 bg-white shadow-lg print:my-0 print:max-w-full print:border-0 print:shadow-none">
        {/* Header de pantalla (título + botones). Todo print:hidden — en print
            manda el header compacto de una línea. */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 print:hidden">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Comisión — {vendedor}</h2>
            <p className="text-xs text-gray-500">{empresaNombre} · {MESES[mes - 1]} {year}</p>
          </div>
          <div className="flex items-center gap-2">
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

        <div className="p-4 print:p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-rose-600">{error}</div>
          ) : data ? (
            <div className="space-y-6 print:space-y-0">
              {/* ══════════ PÁGINA 1 — VENTAS ══════════ */}
              <section className={`cds-ventas ${ventasTier}`}>
                {compactHeader}
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Ventas</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200 print:overflow-visible print:rounded-none print:border-0">
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
                        <td className="px-3 py-2" colSpan={4}>TOTAL VENTAS</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.ventas_base)}</td>
                        <td className="print:hidden"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {/* ══════════ PÁGINA 2 — COBROS + CIERRE ══════════ */}
              <section className="cds-cobros">
                {compactHeader}
                <div className={cobrosTier}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Cobros</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 print:overflow-visible print:rounded-none print:border-0">
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
                          <td className="px-3 py-2" colSpan={2}>TOTAL COBROS</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.cobros_base)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 print:hidden">El API de Switch no expone el número de recibo.</p>
                </div>

                {/* Suma de las BASES sobre las que se comisiona (no de las comisiones). */}
                <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 print:mt-2">
                  <span>TOTAL VENTAS + COBROS</span>
                  <span className="tabular-nums">{fmtMoney(round2(data.ventas_base + data.cobros_base))}</span>
                </div>

                {/* CIERRE */}
                <section className="cds-cierre mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 print:mt-2 print:p-3">
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
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </ModalOverlay>
  );
}
