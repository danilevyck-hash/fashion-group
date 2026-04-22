"use client";

import { fmt, fmtDate } from "@/lib/format";
import { CajaPeriodo } from "./types";
import { SkeletonTable, EmptyState, StatusBadge, ScrollableTable } from "@/components/ui";
import OverflowMenu, { OverflowMenuItem } from "@/components/ui/OverflowMenu";

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
            Cada periodo representa un ciclo de caja menuda. Crea uno nuevo cuando se reponga el fondo.
          </p>
        </div>
        {!hasOpenPeriod && (
          <button
            onClick={onCreatePeriodo}
            className="text-sm bg-black text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all"
          >
            Nuevo Período
          </button>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : periodos.length === 0 ? (
        <EmptyState
          title="No hay períodos registrados"
          subtitle="Crea un nuevo período de caja menuda"
          actionLabel="+ Nuevo Período"
          onAction={onCreatePeriodo}
        />
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="md:hidden space-y-3">
            {periodos.map((p) => {
              const saldo = p.fondo_inicial - p.total_gastado;
              const items: OverflowMenuItem[] = [
                { label: "Imprimir", onClick: () => onPrintPeriodo(p.id) },
              ];
              if (p.estado === "abierto") {
                items.push({ label: "Cerrar período", onClick: () => onClosePeriodo(p.id) });
              }
              if (p.estado === "cerrado" && role === "admin") {
                items.push({ label: "Eliminar", onClick: () => onDeletePeriodo(p.id), destructive: true });
              }
              return (
                <div
                  key={p.id}
                  onClick={() => onLoadDetail(p.id)}
                  className="border border-gray-200 rounded-lg p-4 active:bg-gray-50 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold">Período {p.numero}</span>
                      <StatusBadge estado={p.estado} />
                    </div>
                    <div className="-my-2 -mr-2" onClick={(e) => e.stopPropagation()}>
                      <OverflowMenu items={items} />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">
                    {fmtDate(p.fecha_apertura)}
                    {p.fecha_cierre ? ` — ${fmtDate(p.fecha_cierre)}` : " — en curso"}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Fondo <span className="tabular-nums text-gray-700">${fmt(p.fondo_inicial)}</span></span>
                    <span className="text-gray-500">Gastado <span className="tabular-nums text-gray-700">${fmt(p.total_gastado)}</span></span>
                    <span className={`font-semibold tabular-nums ${saldo < 0 ? "text-red-600" : "text-gray-900"}`}>
                      ${fmt(saldo)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <ScrollableTable minWidth={600}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
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
                        className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-medium">{p.numero}</td>
                        <td className="py-3 px-4 text-gray-500">
                          {fmtDate(p.fecha_apertura)}
                        </td>
                        <td className="py-3 px-4 text-gray-500">
                          {p.fecha_cierre ? fmtDate(p.fecha_cierre) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge estado={p.estado} />
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
            </ScrollableTable>
          </div>
        </>
      )}
    </div>
  );
}
