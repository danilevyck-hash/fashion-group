"use client";

// La vista de UNA empresa del módulo Comisiones (B2B / mayoreo).
//
// 🩸 EL SELECTOR DE EMPRESA SE FUE AL SHELL (6-sep-2026). Vivía acá, DEBAJO de
// una pestaña que ya decía «Por empresa»: dos controles para una sola pregunta.
// Hoy hay UNO solo arriba —Fashion Group · las 6 · Multifashion— y esta vista
// recibe la empresa por props. La memoria (`fg_last_comision_empresa`) es la
// misma y la lleva el shell.
//
// 🩸 SE FUE LA LÍNEA «N vendedores sin actividad este mes» (6-sep-2026). Daniel:
// es un renglón para decir que no hay nada que decir. Los inactivos siguen
// saliendo del cálculo igual que antes: lo que se quitó es el aviso.
//
// 🔴 Y LOS QUE NO SE PAGAN (Oficina y Daniel Levy) VAN DETRÁS DE «Ver los que no
// se pagan». Así las filas visibles suman EXACTAMENTE el «Total a pagar» del
// pie, que es lo que antes no pasaba. Ver `lib/comisiones/sin-pago`.
//
// Regla (server, RPC comision_b2b_v8 vía lib/comisiones/rpc): base = facturas
// con utilidad>20% − todas las NC, excluyendo intercompañía/clientes internos;
// comisión = base × tasa del VENDEDOR DE LA FACTURA (v5 jul-2026, retroactivo;
// la NC usa su propio vendedor). El COBRO se paga a QUIEN REGISTRÓ EL RECIBO
// (v6 sep-2026 — Daniel: «el que vende a veces no es el que cobra»); la fila
// DEFAULT es la oficina y se rotula ETIQUETA_DEFAULT. Desde v8 las grafías de
// Switch ya vienen colapsadas en una persona (alias). Muestra a todos los
// vendedores activos aunque base=$0; los sin actividad se colapsan al pie.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui";
import { Coins } from "lucide-react";
import { Ayuda } from "@/components/shared/Ayuda";
import type { ExcelApi } from "./ComisionesView";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import {
  ROTULO_NO_SE_PAGA,
  ROTULO_VER_MENOS,
  rotuloVerNoSePagan,
  sumarPagable,
} from "@/lib/comisiones/sin-pago";
import { sinRetirados } from "@/lib/comisiones/retirados";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { etiquetaPeriodo } from "@/lib/comisiones/periodo";
import { fmtMoney } from "@/lib/ventas/format";
import { exportComisionesResumen } from "@/lib/ventas/comisionExcel";
import { ComisionesDetalleModal } from "./ComisionesDetalleModal";
import { ComisionesTarjetasPorEmpresa } from "./ComisionesTarjetas";
import type { ClienteSinComision } from "@/lib/comisiones/exclusiones";

interface ComisionVendedor {
  vendedor: string;
  base: number;
  tasa: number;
  comision: number;
  base_cobro: number;
  tasa_cobro: number;
  comision_cobro: number;
  /** NETO: el servidor ya le restó los descuentos fijos activos del mes. */
  comision_total: number;
  /** Cuánto se le restó (informativo — ya está descontado del total). */
  descuento?: number;
  /** false = se calcula y se muestra, pero NO entra al total a pagar (DEFAULT y Daniel). */
  se_paga?: boolean;
  /** Clientes por los que este vendedor NO comisiona en esta empresa (ya restados por la RPC). */
  clientes_sin_comision?: ClienteSinComision[];
}
interface ComisionResp {
  empresa_key: string;
  year: number;
  mes: number;
  vendedores: ComisionVendedor[];
}

interface Props {
  /** La empresa que eligió el ÚNICO selector del shell. */
  empresa?: string;
  /** Su nombre CORTO, para el detalle y el Excel (diccionario § 0). */
  empresaNombre?: string;
  year: number;
  mes: number;
  /** El botón Excel vive en la barra del shell (ver ComisionesView): esta vista
   *  sigue siendo la dueña del cálculo y solo registra su función acá. */
  onExcel?: (api: ExcelApi | null) => void;
  /** Cambia cuando "Actualizar ahora" termina: fuerza re-pedir los datos. */
  refreshKey?: number;
}

export function ComisionesPorEmpresaView({
  empresa = EMPRESAS_COMISIONAN[0],
  empresaNombre,
  year,
  mes,
  onExcel,
  refreshKey = 0,
}: Props) {
  const nombreEmpresa = empresaNombre ?? nombreCortoEmpresa(empresa);
  const [data, setData] = useState<ComisionResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalleVendedor, setDetalleVendedor] = useState<string | null>(null);
  // 🔴 Los que no se pagan, escondidos hasta que se los pida.
  const [verNoSePagan, setVerNoSePagan] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ventas/comisiones?empresa=${empresa}&year=${year}&mes=${mes}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as ComisionResp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar. Intenta de nuevo.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresa, year, mes, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Los retirados (Aguas — Daniel: «te dije que eliminaras Rey Stoute Aguas»)
  // salen ANTES de sumar: fuera de la tabla, de las tarjetas, del Excel y de
  // los totales. Lista en `lib/comisiones/retirados`.
  const vendedores = sinRetirados(data?.vendedores ?? []);
  // El pie suma SOLO lo pagable: DEFAULT y Daniel se ven con su número, pero
  // no entran («no me autopago»). La marca la pone el servidor.
  const totalBase = sumarPagable(vendedores, (v) => v.base ?? 0);
  const totalComision = sumarPagable(vendedores, (v) => v.comision ?? 0);
  const totalCobroBase = sumarPagable(vendedores, (v) => v.base_cobro ?? 0);
  const totalComisionCobro = sumarPagable(vendedores, (v) => v.comision_cobro ?? 0);
  const totalGeneral = sumarPagable(vendedores, (v) => v.comision_total ?? 0);
  const haySinPago = vendedores.some((v) => v.se_paga === false);

  const isInactivo = (v: ComisionVendedor) =>
    (v.base ?? 0) === 0 && (v.base_cobro ?? 0) === 0 && (v.comision_total ?? 0) === 0;
  // Sin actividad = no se dibuja. La línea «N vendedores sin actividad este mes»
  // se retiró: era un renglón para decir que no hay nada que decir.
  const conActividad = vendedores.filter((v) => !isInactivo(v));
  const activos = conActividad.filter((v) => v.se_paga !== false);
  const noSePagan = conActividad.filter((v) => v.se_paga === false);
  const visibles = verNoSePagan ? [...activos, ...noSePagan] : activos;

  const handleExport = () => {
    if (vendedores.length === 0) return;
    void exportComisionesResumen({
      empresaKey: empresa,
      empresaNombre: nombreEmpresa,
      year,
      mes,
      vendedores,
    });
  };

  // El shell dispara el Excel de la vista activa (ver ComisionesView).
  const exportRef = useRef(handleExport);
  exportRef.current = handleExport;
  useEffect(() => {
    onExcel?.({ run: () => exportRef.current(), disabled: vendedores.length === 0 });
    return () => onExcel?.(null);
  }, [onExcel, vendedores.length]);

  return (
    <div className="space-y-2">
      {loading ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-3"><SkeletonTable rows={6} cols={5} /></div>
        </Card>
      ) : error ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-8 text-center text-sm">
            <p className="text-rose-600">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
            >
              Reintentar
            </button>
          </div>
        </Card>
      ) : vendedores.length === 0 ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-8 text-center text-sm text-gray-500">
            Sin vendedores para {etiquetaPeriodo(year, mes)}.
          </div>
        </Card>
      ) : (
        <>
          {/* Celular: TARJETAS. Esta tabla es la que fallaba PEOR — 636px de
              contenido dentro de un `Card` con overflow-hidden, así que a 390px
              quedaban 279px RECORTADOS y "Com. cobro" y "Com. total" no se
              podían ver ni arrastrando. */}
          <ComisionesTarjetasPorEmpresa
            activos={visibles}
            noSePagan={noSePagan.length}
            verNoSePagan={verNoSePagan}
            onVerNoSePagan={() => setVerNoSePagan((v) => !v)}
            total={totalGeneral}
            onDetalle={setDetalleVendedor}
          />

          {/* iPad y escritorio: la tabla. El `overflow-x-auto` es nuevo — sin
              él, a 834px se perdían 83px sin aviso ni forma de alcanzarlos. */}
          <Card className="hidden overflow-hidden rounded-lg border border-gray-200 lg:block">
            <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium xl:px-4">Vendedor</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Ventas</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Com. venta</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Cobros</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Com. cobro</th>
                <th className="px-3 py-2 text-right font-medium xl:px-4">Com. total</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((v) => (
                <tr
                  key={v.vendedor}
                  data-se-paga={v.se_paga === false ? "no" : "si"}
                  onClick={() => setDetalleVendedor(v.vendedor)}
                  className={`cursor-pointer border-b border-gray-100 last:border-0 transition hover:bg-gray-50 ${v.se_paga === false ? "text-gray-400" : ""}`}
                  title="Ver reporte detallado"
                >
                  <td className={`px-3 py-2.5 font-medium xl:px-4 ${v.se_paga === false ? "text-gray-400" : "text-gray-900"}`}>
                    {/* Capitalizado solo para MOSTRAR («Reynaldo Espinosa»);
                        la clave y el detalle van con el nombre tal cual llega. */}
                    <span className="underline-offset-2 hover:underline">{nombreVendedorEnPantalla(v.vendedor)}</span>
                    {v.se_paga === false && (
                      <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 align-middle text-[11px] font-normal text-gray-500">
                        {ROTULO_NO_SE_PAGA}
                      </span>
                    )}
                    {/* Crece HACIA ABAJO: una columna más habría ensanchado la
                        tabla justo en el iPad acostado, que es el ancho que
                        nadie mira. */}
                    {(v.descuento ?? 0) > 0 && (
                      <span className="block text-xs font-normal text-gray-500">
                        − {fmtMoney(v.descuento ?? 0)} en descuentos
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums xl:px-4 ${v.se_paga === false ? "text-gray-400" : "text-gray-700"}`}>{fmtMoney(v.base)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums xl:px-4 ${v.se_paga === false ? "text-gray-400" : "text-gray-600"}`}>{fmtMoney(v.comision)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums xl:px-4 ${v.se_paga === false ? "text-gray-400" : "text-gray-700"}`}>{fmtMoney(v.base_cobro)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums xl:px-4 ${v.se_paga === false ? "text-gray-400" : "text-gray-600"}`}>{fmtMoney(v.comision_cobro)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums xl:px-4 ${v.se_paga === false ? "text-gray-400" : "text-gray-900"}`}>{fmtMoney(v.comision_total)}</td>
                </tr>
              ))}
              {noSePagan.length > 0 && (
                <tr className="border-b border-gray-100 last:border-0">
                  <td colSpan={6} className="px-3 py-1.5 xl:px-4">
                    <button
                      type="button"
                      onClick={() => setVerNoSePagan((v) => !v)}
                      aria-expanded={verNoSePagan}
                      className="inline-flex min-h-[44px] -my-1 items-center text-xs text-gray-400 transition hover:text-gray-600"
                    >
                      {verNoSePagan ? ROTULO_VER_MENOS : rotuloVerNoSePagan(noSePagan.length)}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                <td className="px-3 py-2.5 xl:px-4">{haySinPago ? "Total a pagar" : "Total"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalBase)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalComision)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalCobroBase)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalComisionCobro)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums xl:px-4">{fmtMoney(totalGeneral)}</td>
              </tr>
            </tfoot>
          </table>
            </div>
          </Card>
        </>
      )}

      {/* Mismo pie que la matriz de "Todas las empresas": las dos pestañas
          muestran el MISMO neto, así que tienen que explicarlo igual. */}
      <p className="flex items-center gap-1.5 text-xs text-gray-400">
        <Coins className="h-3.5 w-3.5" />
        Toca para ver el detalle
        <Ayuda titulo="Cómo se calcula">
          <p>Ya están descontados lo devuelto y los descuentos.</p>
        </Ayuda>
      </p>

      {detalleVendedor && (
        <ComisionesDetalleModal
          empresa={empresa}
          empresaNombre={nombreEmpresa}
          year={year}
          mes={mes}
          vendedor={detalleVendedor}
          onClose={() => setDetalleVendedor(null)}
        />
      )}
    </div>
  );
}
