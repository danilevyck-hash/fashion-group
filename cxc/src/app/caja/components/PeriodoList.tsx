"use client";

import { fmt, fmtDate } from "@/lib/format";
import { CajaPeriodo } from "./types";

interface Props {
  periodos: CajaPeriodo[];
  loading: boolean;
  error: string | null;
  hasOpenPeriod: boolean;
  role: string | null;
  onCreatePeriodo: () => void;
  onLoadDetail: (id: string) => void;
  onPrintPeriodo: (id: string) => void;
  onClosePeriodo: (id: string) => void;
  onDeletePeriodo: (id: string) => void;
}

export default function PeriodoList({
  periodos,
  loading,
  error,
  hasOpenPeriod,
  role,
  onCreatePeriodo,
  onLoadDetail,
  onPrintPeriodo,
  onClosePeriodo,
  onDeletePeriodo,
}: Props) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-xl font-light tracking-tight">Caja Menuda</h1>
          <p className="text-sm text-gray-400 mt-1">
            Fondo rotativo para gastos menores
          </p>
        </div>
        {!hasOpenPeriod && (
          <button
            onClick={onCreatePeriodo}
            className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition"
          >
            Nuevo Período
          </button>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {loading ? (
        <div>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex gap-4 py-3 px-4 border-b border-gray-50"
            >
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/6" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/5" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/5" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/6" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/6" />
            </div>
          ))}
        </div>
      ) : periodos.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-20">
          No hay períodos registrados
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                <th className="text-left py-3 px-4 font-normal">N°</th>
                <th className="text-left py-3 px-4 font-normal">Apertura</th>
                <th className="text-left py-3 px-4 font-normal">Cierre</th>
                <th className="text-left py-3 px-4 font-normal">Estado</th>
                <th className="text-right py-3 px-4 font-normal">Fondo</th>
                <th className="text-right py-3 px-4 font-normal">Gastado</th>
                <th className="text-right py-3 px-4 font-normal">Saldo</th>
                <th className="text-right py-3 px-4 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => {
                const saldo = p.fondo_inicial - p.total_gastado;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onLoadDetail(p.id)}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-medium">{p.numero}</td>
                    <td className="py-3 px-4 text-gray-500">
                      {fmtDate(p.fecha_apertura)}
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {p.fecha_cierre ? fmtDate(p.fecha_cierre) : "—"}
                    </td>
                    <td className="py-3 px-4">
                      {p.estado === "abierto" ? (
                        <span className="text-[11px] bg-black text-white px-2.5 py-0.5 rounded-full">
                          Abierto
                        </span>
                      ) : (
                        <span className="text-[11px] bg-gray-200 text-gray-500 px-2.5 py-0.5 rounded-full">
                          Cerrado
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-gray-400">
                      ${fmt(p.fondo_inicial)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      ${fmt(p.total_gastado)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right tabular-nums font-medium ${saldo < 0 ? "text-red-600" : ""}`}
                    >
                      ${fmt(saldo)}
                    </td>
                    <td
                      className="py-3 px-4 text-right flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onPrintPeriodo(p.id)}
                        className="text-sm text-gray-500 hover:text-black transition"
                      >
                        Imprimir
                      </button>
                      {p.estado === "abierto" && (
                        <>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => onClosePeriodo(p.id)}
                            className="text-sm text-gray-500 hover:text-black transition"
                          >
                            Cerrar
                          </button>
                        </>
                      )}
                      {p.estado === "cerrado" && role === "admin" && (
                        <>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => onDeletePeriodo(p.id)}
                            className="text-sm text-gray-300 hover:text-red-500 transition"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => onLoadDetail(p.id)}
                        className="text-gray-300 hover:text-black ml-2 transition"
                      >
                        ›
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
