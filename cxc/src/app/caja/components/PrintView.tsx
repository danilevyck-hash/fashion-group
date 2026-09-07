"use client";

import { fmt, fmtDate } from "@/lib/format";
import { FG_LOGO_BASE64 } from "@/lib/pdf-logo";
import { CajaPeriodo } from "./types";
import { reposicionDelPeriodo, saldoDelPeriodo, sumaMontos, totalGastado } from "@/lib/caja/dinero";
import { etiquetaResponsable } from "@/lib/caja/responsable";

interface Props {
  current: CajaPeriodo;
  onBack: () => void;
}

export default function PrintView({ current, onBack }: Props) {
  const gastos = current.caja_gastos || [];
  // Todo redondeado a centavos: la suma en coma flotante ponía el papel del
  // período Nº2 en «−$0.00», en rojo, con la caja cuadrada al centavo.
  const gastado = totalGastado(gastos);
  const totalSubtotal = sumaMontos(gastos.map((g) => g.subtotal));
  const totalItbms = sumaMontos(gastos.map((g) => g.itbms));
  const saldo = saldoDelPeriodo(current.fondo_inicial, gastos);
  // 🔴 Cuánto hay que reponer para que la caja vuelva a su fondo. El modal de
  // cierre ya lo decía; el papel —el que lleva «Preparado por / Aprobado por»,
  // el que se firma— no. Misma función que el modal: una sola cuenta.
  const aReponer = reposicionDelPeriodo(current.fondo_inicial, gastos);
  // 🔴 La responsable es del PERÍODO y sale de Asistencia por su código. Antes
  // se derivaba de los gastos y este papel listaba TRES personas donde hay una
  // («Angela Garcia» · «Angela garcia» · «Angela garciia»).
  const responsableLabel = etiquetaResponsable(
    current.responsable_empleado_codigo
      ? { codigo: String(current.responsable_empleado_codigo), nombre: current.responsable_nombre || "" }
      : null,
  ) || "—";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-wrap gap-4 mb-8 no-print">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-black transition"
        >
          ← Período N°{current.numero}
        </button>
        <button
          onClick={() => window.print()}
          className="text-sm bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 active:scale-[0.97] transition-all"
        >
          Imprimir
        </button>
      </div>

      <div
        id="print-document"
        className="border border-gray-200 rounded-lg p-8"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FG_LOGO_BASE64} alt="FG" className="w-9 h-9 rounded" />
          <h1 className="text-lg font-bold uppercase tracking-wide">
            Reporte de Caja Menuda
          </h1>
        </div>
        <p className="text-center text-sm text-gray-600 mb-1">
          Período N° {current.numero} | Apertura:{" "}
          {fmtDate(current.fecha_apertura)}
          {current.fecha_cierre
            ? ` — Cierre: ${fmtDate(current.fecha_cierre)}`
            : " — Abierto"}
        </p>
        <p className="text-center text-sm mb-1">
          Fondo Inicial: ${fmt(current.fondo_inicial)}
        </p>
        <p className="text-center text-sm mb-6">
          Responsable del período: {responsableLabel}
        </p>

        <table className="w-full text-xs border-collapse mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">
                Fecha
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">
                Descripción
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">
                Proveedor
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">
                Categoría
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">
                N° Factura
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-right">
                Sub-total
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-right">
                ITBMS
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((g) => (
              <tr key={g.id}>
                <td className="border border-gray-300 px-2 py-1">
                  {fmtDate(g.fecha)}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {g.descripcion || g.nombre}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {g.proveedor || "—"}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {g.categoria || "Varios"}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {g.nro_factura?.trim() || "—"}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  ${fmt(g.subtotal)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  ${fmt(g.itbms)}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">
                  ${fmt(g.total)}
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td
                colSpan={5}
                className="border border-gray-300 px-2 py-1.5 text-right uppercase"
              >
                Totales
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">
                ${fmt(totalSubtotal)}
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">
                ${fmt(totalItbms)}
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">
                ${fmt(gastado)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="text-sm mb-8 space-y-1">
          <div className="font-bold">
            Saldo Final:{" "}
            <span className={saldo < 0 ? "text-red-600" : ""}>
              ${fmt(saldo)}
            </span>
          </div>
          <div className="font-bold">
            A reponer: <span>${fmt(aReponer)}</span>
          </div>
        </div>

        <div className="mt-16 text-sm flex justify-between">
          <div>
            Preparado por:{" "}
            <span className="border-b border-gray-400 inline-block w-56 ml-1">
              &nbsp;
            </span>
          </div>
          <div>
            Aprobado por:{" "}
            <span className="border-b border-gray-400 inline-block w-56 ml-1">
              &nbsp;
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
