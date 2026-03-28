"use client";

import { fmt, fmtDate } from "@/lib/format";
import { CajaPeriodo } from "./types";

interface Props {
  current: CajaPeriodo;
  onBack: () => void;
}

export default function PrintView({ current, onBack }: Props) {
  const gastos = current.caja_gastos || [];
  const totalGastado = gastos.reduce((s, g) => s + (g.total || 0), 0);
  const totalSubtotal = gastos.reduce((s, g) => s + (g.subtotal || 0), 0);
  const totalItbms = gastos.reduce((s, g) => s + (g.itbms || 0), 0);
  const saldo = current.fondo_inicial - totalGastado;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-wrap gap-4 mb-8 no-print">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-black transition"
        >
          ← Volver
        </button>
        <button
          onClick={() => window.print()}
          className="text-sm bg-black text-white px-6 py-2 rounded-full hover:bg-gray-800 transition"
        >
          Imprimir
        </button>
      </div>

      <div
        id="print-document"
        className="border border-gray-200 rounded-lg p-8"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <h1 className="text-center text-lg font-bold mb-2 uppercase tracking-wide">
          Reporte de Caja Menuda
        </h1>
        <p className="text-center text-sm text-gray-600 mb-1">
          Período N° {current.numero} | Apertura:{" "}
          {fmtDate(current.fecha_apertura)}
          {current.fecha_cierre
            ? ` — Cierre: ${fmtDate(current.fecha_cierre)}`
            : " — Abierto"}
        </p>
        <p className="text-center text-sm mb-6">
          Fondo Inicial: ${fmt(current.fondo_inicial)}
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
                Responsable
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">
                Categoría
              </th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">
                Empresa
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
                  {g.responsable || "—"}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {g.categoria || "Varios"}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {g.empresa || "—"}
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
                colSpan={6}
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
                ${fmt(totalGastado)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="text-sm font-bold mb-8">
          Saldo Final:{" "}
          <span className={saldo < 0 ? "text-red-600" : ""}>
            ${fmt(saldo)}
          </span>
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
