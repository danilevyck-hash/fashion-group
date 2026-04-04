"use client";

import { fmt, fmtDate } from "@/lib/format";
import { CajaGasto } from "./types";
import { CAJA_EMPRESAS, AutocompleteInput } from "./GastoForm";
import { EmptyState } from "@/components/ui";

interface Props {
  gastos: CajaGasto[];
  isOpen: boolean;
  categorias: string[];
  responsables: string[];
  editingGastoId: string | null;
  editGasto: Partial<CajaGasto>;
  setEditingGastoId: (id: string | null) => void;
  setEditGasto: (g: Partial<CajaGasto>) => void;
  onSaveEdit: () => void;
  onDeleteGasto: (id: string) => void;
}

export default function GastoTable({
  gastos,
  isOpen,
  categorias,
  responsables,
  editingGastoId,
  editGasto,
  setEditingGastoId,
  setEditGasto,
  onSaveEdit,
  onDeleteGasto,
}: Props) {
  const totalGastado = gastos.reduce((s, g) => s + (g.total || 0), 0);
  const totalSubtotal = gastos.reduce((s, g) => s + (g.subtotal || 0), 0);
  const totalItbms = gastos.reduce((s, g) => s + (g.itbms || 0), 0);

  return (
    <div className="mb-10">
      <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">
        Gastos
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="min-w-[700px] px-4 sm:px-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
              {isOpen && <th className="w-20 py-3 px-4 font-normal"></th>}
              <th className="text-left py-3 px-4 font-normal">Fecha</th>
              <th className="text-left py-3 px-4 font-normal">Descripción</th>
              <th className="text-left py-3 px-4 font-normal hidden sm:table-cell">Proveedor</th>
              <th className="text-left py-3 px-4 font-normal hidden sm:table-cell">Responsable</th>
              <th className="text-left py-3 px-4 font-normal">Categoría</th>
              <th className="text-left py-3 px-4 font-normal">Empresa</th>
              <th className="text-left py-3 px-4 font-normal hidden sm:table-cell">N° Factura</th>
              <th className="text-right py-3 px-4 font-normal">Sub-total</th>
              <th className="text-right py-3 px-4 font-normal">ITBMS</th>
              <th className="text-right py-3 px-4 font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {gastos.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <EmptyState
                    title="Sin gastos registrados"
                    subtitle="Agrega el primer gasto de este período"
                  />
                </td>
              </tr>
            ) : (
              <>
                {gastos.map((g) =>
                  editingGastoId === g.id ? (
                    <tr key={g.id} className="border-b border-gray-200 bg-gray-50">
                      {isOpen && <td className="py-2 px-4 text-xs">
                        <button onClick={onSaveEdit} className="text-gray-500 hover:text-black mr-1">Guardar</button>
                        <button onClick={() => setEditingGastoId(null)} className="text-gray-300 hover:text-black">x</button>
                      </td>}
                      <td className="py-2 pr-1">
                        <input
                          type="date"
                          value={editGasto.fecha || ""}
                          onChange={(e) =>
                            setEditGasto({ ...editGasto, fecha: e.target.value })
                          }
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="text"
                          value={editGasto.descripcion || ""}
                          onChange={(e) =>
                            setEditGasto({
                              ...editGasto,
                              descripcion: e.target.value,
                            })
                          }
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                        />
                      </td>
                      <td className="py-2 pr-1 hidden sm:table-cell">
                        <input
                          type="text"
                          value={editGasto.proveedor || ""}
                          onChange={(e) =>
                            setEditGasto({
                              ...editGasto,
                              proveedor: e.target.value,
                            })
                          }
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                        />
                      </td>
                      <td className="py-2 pr-1 hidden sm:table-cell">
                        <AutocompleteInput
                          value={editGasto.responsable || ""}
                          onChange={(v) =>
                            setEditGasto({ ...editGasto, responsable: v })
                          }
                          options={responsables}
                          placeholder="Responsable"
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <AutocompleteInput
                          value={editGasto.categoria || "Varios"}
                          onChange={(v) =>
                            setEditGasto({ ...editGasto, categoria: v })
                          }
                          options={categorias}
                          placeholder="Categoría"
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <select
                          value={editGasto.empresa || ""}
                          onChange={(e) =>
                            setEditGasto({
                              ...editGasto,
                              empresa: e.target.value,
                            })
                          }
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                        >
                          <option value="">—</option>
                          {CAJA_EMPRESAS.map((emp) => (
                            <option key={emp} value={emp}>
                              {emp}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-1 hidden sm:table-cell">
                        <input
                          type="text"
                          value={editGasto.nro_factura || ""}
                          onChange={(e) =>
                            setEditGasto({
                              ...editGasto,
                              nro_factura: e.target.value,
                            })
                          }
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="number"
                          step="0.01"
                          value={editGasto.subtotal ?? ""}
                          onChange={(e) =>
                            setEditGasto({
                              ...editGasto,
                              subtotal: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent text-right"
                        />
                      </td>
                      <td className="py-2 pr-1">
                        <input
                          type="number"
                          step="0.01"
                          value={editGasto.itbms ?? ""}
                          onChange={(e) =>
                            setEditGasto({
                              ...editGasto,
                              itbms: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent text-right"
                        />
                      </td>
                      <td className="py-2 text-right tabular-nums text-xs font-medium">
                        $
                        {fmt(
                          (parseFloat(String(editGasto.subtotal)) || 0) +
                            (parseFloat(String(editGasto.itbms)) || 0)
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={g.id}
                      className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      {isOpen && (
                        <td className="py-3 px-4 text-xs">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingGastoId(g.id);
                                setEditGasto({
                                  fecha: g.fecha,
                                  descripcion: g.descripcion || g.nombre,
                                  proveedor: g.proveedor || "",
                                  nro_factura: g.nro_factura || "",
                                  responsable: g.responsable || "",
                                  categoria: g.categoria || "Varios",
                                  empresa: g.empresa || "",
                                  subtotal: g.subtotal,
                                  itbms: g.itbms,
                                });
                              }}
                              className="text-xs text-gray-400 hover:text-black transition min-h-[44px] sm:min-h-0 min-w-[44px] sm:min-w-0 py-2.5 sm:py-1.5 px-1.5 flex items-center justify-center gap-1"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                              <span className="hidden sm:inline">Editar</span>
                            </button>
                            <button
                              onClick={() => onDeleteGasto(g.id)}
                              className="text-xs text-gray-300 hover:text-red-500 transition min-h-[44px] sm:min-h-0 min-w-[44px] sm:min-w-0 py-2.5 sm:py-1.5 px-1.5 flex items-center justify-center gap-1"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              <span className="hidden sm:inline">Eliminar</span>
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="py-3 px-4 text-gray-500">
                        {fmtDate(g.fecha)}
                      </td>
                      <td className="py-3 px-4">
                        {g.descripcion || g.nombre}
                      </td>
                      <td className="py-3 px-4 text-gray-500 hidden sm:table-cell">
                        {g.proveedor || "—"}
                      </td>
                      <td className="py-3 px-4 text-gray-500 hidden sm:table-cell">
                        {g.responsable || "—"}
                      </td>
                      <td className="py-3 px-4 text-gray-500">
                        {g.categoria || "Varios"}
                      </td>
                      <td className="py-3 px-4 text-gray-500">
                        {g.empresa || "—"}
                      </td>
                      <td className="py-3 px-4 text-gray-500 hidden sm:table-cell">
                        {g.nro_factura || "—"}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        ${fmt(g.subtotal)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-500">
                        ${fmt(g.itbms)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium">
                        ${fmt(g.total)}
                      </td>
                    </tr>
                  )
                )}
                <tr className="border-t border-gray-300">
                  <td
                    colSpan={isOpen ? 8 : 7}
                    className="py-3 px-4 text-right text-[11px] uppercase tracking-[0.05em] text-gray-400"
                  >
                    Totales
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">
                    ${fmt(totalSubtotal)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">
                    ${fmt(totalItbms)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold">
                    ${fmt(totalGastado)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
