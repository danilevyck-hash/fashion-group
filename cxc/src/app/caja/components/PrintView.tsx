"use client";

import { fmt, fmtDate } from "@/lib/format";
import { FG_LOGO_BASE64 } from "@/lib/pdf-logo";
import { CajaGasto, CajaPeriodo } from "./types";
import { montoEnPantalla, reposicionDelPeriodo, saldoDelPeriodo, saldoEsNegativo, sumaMontos, totalGastado } from "@/lib/caja/dinero";
import { etiquetaResponsable } from "@/lib/caja/responsable";
import {
  COLUMNAS_DE_PLATA,
  ROTULO_COLUMNA,
  columnasDelPapel,
  encabezadoDelPapel,
  type ColumnaPapel,
} from "@/lib/caja/papel-caja";

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

  const columnas = columnasDelPapel(gastos);
  const esPlata = (c: ColumnaPapel) => COLUMNAS_DE_PLATA.includes(c);
  const columnasDePlata = columnas.filter(esPlata);
  const totalDe: Record<string, number> = {
    subtotal: totalSubtotal,
    itbms: totalItbms,
    total: gastado,
  };

  /** Lo que dice cada celda. El «—» es para lo que no se sabe, nunca un cero. */
  function celda(g: CajaGasto, c: ColumnaPapel) {
    switch (c) {
      case "fecha": return fmtDate(g.fecha);
      case "nota": return (g.descripcion || g.nombre || "").trim() || "—";
      case "proveedor": return g.proveedor || "—";
      case "categoria": return g.categoria || "Varios";
      case "factura": return g.nro_factura?.trim() || "—";
      case "subtotal": return `$${fmt(g.subtotal)}`;
      case "itbms": return `$${fmt(g.itbms)}`;
      case "total": return `$${fmt(g.total)}`;
    }
  }

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
        {/* 🔴 EL RANGO REAL DE LOS RECIBOS, NO LA APERTURA (20-sep-2026).
            🩸 Decía «Apertura: 2 sept 2026» y su primera fila es del 23 de
            junio: 36 de los 77 recibos caen fuera de la ventana de su período,
            porque el papel llega tarde y se teclea cuando aparece. */}
        <p className="text-center text-sm text-gray-600 mb-1">
          {encabezadoDelPapel(current, gastos)}
        </p>
        <p className="text-center text-sm mb-1">
          Fondo Inicial: ${fmt(current.fondo_inicial)}
        </p>
        <p className="text-center text-sm mb-6">
          Responsable del período: {responsableLabel}
        </p>

        {/* 🔴 UNA COLUMNA VACÍA NO SE DIBUJA (20-sep-2026). La NOTA sale solo
            si alguna fila trae una, y Sub-total + ITBMS solo si alguna fila
            tiene impuesto — lo tienen 9 de 77 recibos, y en el período Nº3 las
            26 filas van en $0.00 con el Sub-total idéntico al Total. Qué se
            dibuja lo decide `columnasDelPapel`, no este archivo. */}
        <table className="w-full text-xs border-collapse mb-4">
          <thead>
            <tr className="bg-gray-100">
              {columnas.map((c) => (
                <th
                  key={c}
                  className={`border border-gray-300 px-2 py-1.5 font-medium ${esPlata(c) ? "text-right" : "text-left"}`}
                >
                  {ROTULO_COLUMNA[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gastos.map((g) => (
              <tr key={g.id}>
                {columnas.map((c) => (
                  <td
                    key={c}
                    className={`border border-gray-300 px-2 py-1 ${esPlata(c) ? "text-right" : ""}`}
                  >
                    {celda(g, c)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-bold">
              <td
                colSpan={columnas.length - columnasDePlata.length}
                className="border border-gray-300 px-2 py-1.5 text-right uppercase"
              >
                Totales
              </td>
              {columnasDePlata.map((c) => (
                <td key={c} className="border border-gray-300 px-2 py-1.5 text-right">
                  ${fmt(totalDe[c])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* 🩸 La plata negativa se escribía «$-1.50», con el menos DENTRO del
            monto: el papel era la última pantalla de Caja que no pasaba por
            `montoEnPantalla`, la función que ya usan la lista, el encabezado y
            el modal de cierre. Ahora dice «−$1.50», como manda el diccionario
            de la casa. El número no cambia. */}
        <div className="text-sm mb-8 space-y-1">
          <div className="font-bold">
            Saldo Final:{" "}
            <span className={saldoEsNegativo(saldo) ? "text-red-600" : ""}>
              {montoEnPantalla(saldo)}
            </span>
          </div>
          <div className="font-bold">
            A reponer: <span>{montoEnPantalla(aReponer)}</span>
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
