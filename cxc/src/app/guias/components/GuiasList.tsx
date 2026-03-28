"use client";

import { fmtDate } from "@/lib/format";
import type { Guia, GuiaItem } from "./types";
import { clientesSummary, getMonthOptions } from "./constants";
import { SkeletonTable, EmptyState, StatusBadge } from "@/components/ui";

interface GuiasListProps {
  guias: Guia[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  monthFilter: string;
  setMonthFilter: (v: string) => void;
  showPending: boolean;
  setShowPending: (v: boolean) => void;
  role: string | null;
  onNewGuia: () => void;
  onViewGuia: (id: string) => void;
}

export default function GuiasList({
  guias,
  loading,
  error,
  search,
  setSearch,
  monthFilter,
  setMonthFilter,
  showPending,
  setShowPending,
  role,
  onNewGuia,
  onViewGuia,
}: GuiasListProps) {
  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-xl font-light tracking-tight">Guías de Transporte</h1>
            <p className="text-sm text-gray-400 mt-1">Registro de envíos con transportistas</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onNewGuia}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition"
            >
              Nueva Guía
            </button>
          </div>
        </div>

        {role === "bodega" &&
          (() => {
            const pendingCount = guias.filter((g) => !g.placa).length;
            if (pendingCount === 0) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-6 flex items-center justify-between">
                <span>
                  📦 Tenés {pendingCount} guía{pendingCount !== 1 ? "s" : ""} pendiente
                  {pendingCount !== 1 ? "s" : ""} de despachar
                </span>
                <button
                  onClick={() => setShowPending(!showPending)}
                  className="text-xs font-medium text-amber-600 hover:text-amber-800 underline"
                >
                  {showPending ? "Ver todas" : "Ver pendientes"}
                </button>
              </div>
            );
          })()}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : guias.length === 0 ? (
          <EmptyState
            title="No hay guías registradas"
            subtitle="Crea tu primera guía para registrar un despacho"
            actionLabel="+ Nueva Guía"
            onAction={onNewGuia}
          />
        ) : (
          <>
            <div className="flex items-end gap-6 mb-6">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por transportista, cliente o factura..."
                className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black w-full max-w-sm"
              />
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Mes</label>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none"
                >
                  {getMonthOptions().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mb-3">
              📦 Pendiente = en espera de bodega · ✅ Despachada = lista para imprimir
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                    <th className="text-left py-3 px-4 font-normal">N°</th>
                    <th className="text-left py-3 px-4 font-normal">Fecha</th>
                    <th className="text-left py-3 px-4 font-normal">Transportista</th>
                    <th className="text-left py-3 px-4 font-normal">Clientes</th>
                    <th className="text-right py-3 px-4 font-normal">Bultos</th>
                    <th className="text-left py-3 px-4 font-normal">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = guias
                      .filter((g) => g.fecha && g.fecha.slice(0, 7) === monthFilter)
                      .filter((g) => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return (
                          g.transportista.toLowerCase().includes(q) ||
                          (g.guia_items || []).some(
                            (item: GuiaItem) =>
                              (item.facturas || "").toLowerCase().includes(q) ||
                              (item.cliente || "").toLowerCase().includes(q),
                          )
                        );
                      })
                      .filter((g) => !showPending || !g.placa);
                    return (
                      <>
                        {filtered.map((g) => (
                          <tr
                            key={g.id}
                            onClick={() => onViewGuia(g.id)}
                            className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-4 font-medium">{g.numero}</td>
                            <td className="py-3 px-4 text-gray-500">{fmtDate(g.fecha)}</td>
                            <td className="py-3 px-4">{g.transportista}</td>
                            <td className="py-3 px-4 text-gray-500 text-sm">
                              {clientesSummary(g.guia_items || [])}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums">{g.total_bultos}</td>
                            <td className="py-3 px-4">
                              <StatusBadge estado={!g.placa ? "pendiente" : "despachada"} />
                            </td>
                          </tr>
                        ))}
                        {filtered.length > 0 && (
                          <tr className="border-t border-gray-300 bg-gray-50/60 font-medium">
                            <td className="py-3 px-4" colSpan={4}>
                              <span className="text-[11px] uppercase tracking-[0.05em] text-gray-400">
                                Totales del mes
                              </span>
                              <span className="ml-3 text-sm">
                                {filtered.length} guía{filtered.length !== 1 ? "s" : ""}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums">
                              {filtered.reduce((s, g) => s + (g.total_bultos || 0), 0)}
                            </td>
                            <td></td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
