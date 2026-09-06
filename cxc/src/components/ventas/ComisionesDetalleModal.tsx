"use client";

// Reporte detallado de comisión de un vendedor (período) — módulo Comisiones.
// Replica el Excel manual: sección VENTAS, sección COBROS, cierre. Se descarga
// a Excel (xlsx-js-style) y se imprime.
//
// ─── 6-sep-2026: cinco cambios de forma, cero de cálculo ─────────────────────
//
// 🔴 **SE ABRE ABAJO, NO ENCIMA** (`inline`). La matriz son 3 filas y ocupa un
// tercio de la pantalla; el resto estaba en blanco y el modal tapaba justo lo
// que estabas mirando. Desde la matriz el reporte se dibuja DEBAJO de la tabla,
// con la celda tocada resaltada. **El modal se queda** —la vista de una empresa
// lo sigue usando— y las dos formas son el MISMO componente: dibujar una segunda
// pantalla de detalle es cómo se llega a que las dos digan cosas distintas.
//
// 🔴 **EL TOTAL VA ARRIBA.** Abría con 30+ filas y había que bajar hasta el
// final para ver el número. Ahora está pegado al título, con «Ventas $345,27 ·
// Cobros $307,15» debajo en gris (los dos componentes que lo forman). El cierre
// de abajo NO se toca: es donde se ve la cuenta completa.
//
// 🔴 **LA FACTURA, CORTA EN PANTALLA.** `11-000003022` no cabía y partía cada
// fila en dos líneas: se muestran los últimos 4 dígitos (`3022`), con la MISMA
// regla que Guías (`lib/comisiones/factura-en-pantalla`). ⚠️ En el Excel y en el
// papel se queda LARGA — Daniel: «no».
//
// 🔴 **SE FUE LA COLUMNA «TIPO» (FA / NC)** de la pantalla: la nota de crédito
// ya va en rojo y con el monto en negativo. En el Excel y en el papel se queda,
// que es donde se concilia contra Switch.
//
// 🔴 **EL PDF YA NO SE LLAMA «Fashion Group.pdf».** Se imprime con
// `window.print()` y Chrome nombra el archivo con el `document.title`, que en
// toda la app es «Fashion Group» — o sea que los doce reportes de un cierre de
// mes bajaban con el mismo nombre. Ahora el título se cambia justo antes de
// imprimir y se devuelve como estaba después, **también si se cancela el
// diálogo** (ver `nombre-archivo.ts`).
//
// La hoja impresa vive en `comisiones-detalle/ImpresionComision.tsx` y va
// SIEMPRE en un portal a <body>: es lo que permite imprimir igual desde el modal
// y desde el detalle inline. El porqué del portal está en ese archivo.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Printer } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtDate } from "@/lib/format";
import { exportComisionDetalle, comisionLinea, type ComisionDetalle, type ComisionDescuento } from "@/lib/ventas/comisionExcel";
import { ModalOverlay } from "@/components/ui";
import { Ayuda } from "@/components/shared/Ayuda";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { sePagaComision } from "@/lib/comisiones/sin-pago";
import { facturaParaMostrar } from "@/lib/comisiones/factura-en-pantalla";
import { nombreArchivoComision } from "@/lib/comisiones/nombre-archivo";
import { etiquetaPeriodo } from "@/lib/comisiones/periodo";
import { ImpresionComision } from "./comisiones-detalle/ImpresionComision";

const round2 = (n: number) => Math.round(n * 100) / 100;

// La columna "Comisión" de cada tabla es informativa: muestra cuánto aporta ese
// renglón. El total que se paga NO es la suma de esos renglones — el RPC redondea
// la BASE del mes (ROUND(base × tasa)), no documento por documento, así que la
// suma de líneas redondeadas puede diferir 1-2 centavos. Los pies de tabla
// muestran SIEMPRE el número del RPC (el mismo del cierre), y esta nota explica
// por qué "de a poquito" puede no dar exacto.
const NOTA_COMISION_LINEA =
  "La comisión de cada línea es referencial. El total se calcula sobre el total del mes, " +
  "por eso puede diferir unos centavos de la suma de las líneas.";

/** Quién puede APAGAR/PRENDER un descuento del mes. Espejo exacto del
 *  `requireRole` de `POST /api/ventas/comisiones/descuentos`. Si esa lista se
 *  mueve, esta se mueve con ella — un botón que el server rechaza es peor que
 *  ningún botón. */
export const ROLES_EDITAR_DESCUENTOS = ["admin", "secretaria"];

/**
 * 🔴 IMPRIME CON EL NOMBRE CORRECTO Y DEVUELVE EL TÍTULO COMO ESTABA.
 *
 * `afterprint` cubre el caso normal Y el de cancelar el diálogo; el `setTimeout`
 * es la red por si algún navegador no lo dispara — dejar el `document.title`
 * cambiado renombraría la pestaña de toda la app.
 */
function imprimirComo(nombre: string) {
  const anterior = document.title;
  const restaurar = () => {
    document.title = anterior;
    window.removeEventListener("afterprint", restaurar);
  };
  document.title = nombre;
  window.addEventListener("afterprint", restaurar);
  window.setTimeout(restaurar, 60_000);
  window.print();
}

interface Props {
  empresa: string;
  /** Nombre CORTO de la empresa (diccionario § 0). */
  empresaNombre: string;
  year: number;
  mes: number;
  vendedor: string;
  onClose: () => void;
  /**
   * Se dibuja DEBAJO de la tabla en vez de encima. La hoja de impresión va al
   * portal igual, así que imprimir sale idéntico en las dos formas.
   */
  inline?: boolean;
}

export function ComisionesDetalleModal({ empresa, empresaNombre, year, mes, vendedor, onClose, inline = false }: Props) {
  const [data, setData] = useState<ComisionDetalle | null>(null);
  const [descuentos, setDescuentos] = useState<ComisionDescuento[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // 🔴 ESPEJO DE `POST /api/ventas/comisiones/descuentos`, que es
  // `["admin","secretaria"]` (25-ago-2026). Contabilidad entró al módulo para
  // VER: MEDIDO, ese POST le contesta **403**, y el toggle es optimista —
  // pintaba el cambio y lo revertía sin decir una palabra, así que el descuento
  // se veía apagado un segundo y volvía solo. Sin toggle ve el MISMO número
  // (el neto ya viene restado del servidor), sin un control que le miente.
  const [puedeEditarDescuentos, setPuedeEditarDescuentos] = useState(false);
  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    setPuedeEditarDescuentos(ROLES_EDITAR_DESCUENTOS.includes(r));
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // El portal necesita `document`; en SSR no existe. Montamos en el cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted) return null;

  const nombreArchivo = nombreArchivoComision(vendedor, empresa, year, mes);

  // ── Encabezado (título + total arriba + botones) ────────────────────────────
  const encabezado = (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900">Comisión — {nombreVendedorEnPantalla(vendedor)}</h2>
        <p className="text-xs text-gray-500">{empresaNombre} · {etiquetaPeriodo(year, mes)}</p>
        {/* DEFAULT y Daniel: el detalle se calcula igual (para cuadrar qué
            se vendió y qué se cobró), pero esta plata no se paga. Daniel:
            «si yo cobro no le pago a nadie porque no me autopago». */}
        {!sePagaComision(vendedor) && (
          <p className="mt-1 text-xs text-amber-700">
            Se calcula para cuadrar, pero esta comisión no se paga.
          </p>
        )}
      </div>

      {/* 🔴 EL TOTAL, ARRIBA. Abría con 30+ filas y el número estaba al final. */}
      {data && (
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            {descActivos.length > 0 ? "Total a pagar" : "Comisión total"}
          </p>
          <p className={`text-2xl font-semibold tabular-nums ${totalAPagar < 0 ? "text-rose-600" : "text-gray-900"}`}>
            {fmtMoney(totalAPagar)}
          </p>
          <p className="text-xs text-gray-500">
            Ventas {fmtMoney(data.comision_venta)} · Cobros {fmtMoney(data.comision_cobro)}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => data && exportComisionDetalle(data, empresaNombre, descActivos)}
          disabled={!data}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-black px-3 text-sm text-white transition active:scale-[0.97] disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Descargar el detalle
        </button>
        <button
          onClick={() => imprimirComo(nombreArchivo)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 px-3 text-sm text-gray-700 transition hover:border-black active:scale-[0.97]"
        >
          <Printer className="h-3.5 w-3.5" /> Imprimir
        </button>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // ── Cuerpo de PANTALLA ─────────────────────────────────────────────────────
  const cuerpo = (
    <div className="p-4">
      {loading ? (
        <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-rose-600">{error}</div>
      ) : data ? (
        <div className="space-y-6">
          {/* ══════════ VENTAS ══════════ */}
          <section>
            {/* La fórmula de la línea y por qué el total no es la suma exacta
                son metodología: se aprenden una vez. 🩸 El texto no desaparece
                — sin él, "de a poquito" no da y parece un error de cálculo. */}
            <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Ventas
              <Ayuda titulo="Cómo se calcula">
                <p>Comisión de cada línea = subtotal × {pctTasaV}%.</p>
                <p className="mt-2">{NOTA_COMISION_LINEA}</p>
              </Ayuda>
            </h3>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Factura</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                    <th className="px-3 py-2 text-right font-medium">% Util.</th>
                    <th className="px-3 py-2 text-right font-medium">Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ventas.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Sin ventas comisionables.</td></tr>
                  ) : data.ventas.map((v, i) => (
                    // Facturas con utilidad ≤20% no comisionan: se listan con
                    // $0.00 (atribuidas al vendedor de la factura) pero en gris.
                    // La NOTA DE CRÉDITO se reconoce por el rojo y el negativo:
                    // la columna «Tipo» (FA/NC) era decir dos veces lo mismo.
                    <tr key={i} className={`border-b border-gray-100 last:border-0 ${v.subtotal < 0 ? "text-rose-600" : v.subtotal === 0 && v.tipo === "Factura" ? "text-gray-400" : "text-gray-800"}`}>
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(v.fecha)}</td>
                      <td className="px-3 py-1.5">{v.cliente}</td>
                      {/* Los últimos 4 dígitos: el largo de Switch partía la
                          fila en dos líneas. En el Excel va completo. */}
                      <td className="px-3 py-1.5 tabular-nums text-gray-500">{facturaParaMostrar(v.secuencial)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(v.subtotal)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{v.tipo === "Nota de Crédito" || v.pct_utilidad == null || !Number.isFinite(v.pct_utilidad) ? "—" : `${v.pct_utilidad.toFixed(1)}%`}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(comisionLinea(v.subtotal, data.tasa_venta))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* El pie de "Comisión" muestra el número del RPC (el mismo
                      del cierre), NO la suma de las líneas: un solo total. */}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-2" colSpan={3}>TOTAL VENTAS</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.ventas_base)}</td>
                    <td></td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.comision_venta)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ══════════ COBROS + CIERRE ══════════ */}
          <section>
            <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Cobros
              <Ayuda titulo="Cómo se calcula">
                <p>Comisión de cada línea = monto × {pctTasaC}%.</p>
                <p className="mt-2">{NOTA_COMISION_LINEA}</p>
              </Ayuda>
            </h3>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 text-right font-medium">Monto</th>
                    <th className="px-3 py-2 text-right font-medium">Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cobros.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Sin cobros comisionables.</td></tr>
                  ) : data.cobros.map((c, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0 text-gray-800">
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(c.fecha)}</td>
                      <td className="px-3 py-1.5">{c.cliente}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(c.monto)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(comisionLinea(c.monto, data.tasa_cobro))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* Igual que en VENTAS: el pie es el número del RPC. */}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-2" colSpan={2}>TOTAL COBROS</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.cobros_base)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.comision_cobro)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* SE QUEDA: explica por qué la columna del número de recibo
                viene vacía. Sin eso parece un dato perdido. */}
            <p className="mt-1 text-xs text-gray-400">El API de Switch no expone el número de recibo.</p>

            {/* Suma de las BASES sobre las que se comisiona (no de las comisiones). */}
            <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
              <span>TOTAL VENTAS + COBROS</span>
              <span className="tabular-nums">{fmtMoney(round2(data.ventas_base + data.cobros_base))}</span>
            </div>

            {/* CIERRE */}
            <section className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
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
                    {descuentos.map((d) => (
                      <div key={d.id} className="flex items-center justify-between">
                        <dt className="flex items-center gap-2 text-gray-600">
                          {/* Toggle: solo quien puede escribirlo (admin/secretaria).
                              Contabilidad ve el descuento y el neto, sin el control:
                              el POST le contesta 403 y el toggle optimista revertía
                              sin decir una palabra. */}
                          {puedeEditarDescuentos && (
                            <label className="inline-flex cursor-pointer items-center" title={d.activo ? "Activo este mes — clic para desactivar" : "Desactivado este mes — clic para activar"}>
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={d.activo}
                                disabled={togglingId === d.id}
                                onChange={(e) => toggleDescuento(d.id, e.target.checked)}
                              />
                              <span className="relative h-4 w-7 rounded-full bg-gray-300 transition peer-checked:bg-gray-900 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-3" />
                            </label>
                          )}
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
  );

  // La hoja impresa: SIEMPRE en un portal a <body>, en las dos formas. Es lo que
  // permite que imprimir desde el detalle inline salga igual que desde el modal.
  const impresion = data
    ? createPortal(
        <ImpresionComision
          data={data}
          descuentos={descuentos}
          empresaNombre={empresaNombre}
          vendedor={vendedor}
          year={year}
          mes={mes}
        />,
        document.body,
      )
    : null;

  if (inline) {
    return (
      <>
        <section
          data-comision-detalle="inline"
          aria-label={`Detalle de comisión de ${nombreVendedorEnPantalla(vendedor)} en ${empresaNombre}`}
          className="rounded-lg border border-gray-200 bg-white print:hidden"
        >
          {encabezado}
          {cuerpo}
        </section>
        {impresion}
      </>
    );
  }

  return (
    <>
      <ModalOverlay align="start" backdropClassName="bg-black/40" className="overflow-y-auto p-4 print:hidden">
        <div
          data-comision-detalle="modal"
          className="my-6 w-full max-w-3xl rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {encabezado}
          {cuerpo}
        </div>
      </ModalOverlay>
      {impresion}
    </>
  );
}
