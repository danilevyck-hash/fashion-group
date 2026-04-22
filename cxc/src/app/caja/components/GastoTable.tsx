"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmt, fmtDate } from "@/lib/format";
import { CajaGasto } from "./types";
import AutocompleteInput from "./AutocompleteInput";
import { EmptyState, ScrollableTable } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";

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
  recentlyAddedIds?: Set<string>;
  /** When provided (period is open), renders a "+ Nuevo gasto" button in the header row. */
  nuevoHref?: string;
}

function Chip({
  label,
  amount,
  active,
  onClick,
}: {
  label: string;
  amount: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`snap-start shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full border text-xs font-medium transition ${
        active
          ? "bg-black text-white border-black"
          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
      }`}
    >
      {label}{" "}
      <span className={`tabular-nums ${active ? "opacity-80" : "text-gray-500"}`}>
        ${fmt(amount)}
      </span>
    </button>
  );
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
  recentlyAddedIds = new Set(),
  nuevoHref,
}: Props) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [showFiscal, setShowFiscal] = useState(false);

  const catTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of gastos) {
      const cat = g.categoria || "Sin categoría";
      map[cat] = (map[cat] || 0) + (g.total || 0);
    }
    return map;
  }, [gastos]);
  const catEntries = useMemo(
    () => Object.entries(catTotals).sort((a, b) => b[1] - a[1]),
    [catTotals],
  );
  const grandTotal = useMemo(
    () => gastos.reduce((s, g) => s + (g.total || 0), 0),
    [gastos],
  );

  const filteredGastos = useMemo(
    () => (selectedCat ? gastos.filter((g) => (g.categoria || "Sin categoría") === selectedCat) : gastos),
    [gastos, selectedCat],
  );
  const totalSubtotal = filteredGastos.reduce((s, g) => s + (g.subtotal || 0), 0);
  const totalItbms = filteredGastos.reduce((s, g) => s + (g.itbms || 0), 0);
  const totalGastado = filteredGastos.reduce((s, g) => s + (g.total || 0), 0);

  // Display newest first so a freshly entered gasto lands on top.
  const sortedGastos = [...filteredGastos].reverse();

  function startEdit(g: CajaGasto) {
    setEditingGastoId(g.id);
    setEditGasto({
      fecha: g.fecha,
      descripcion: g.descripcion || g.nombre,
      proveedor: g.proveedor || "",
      nro_factura: g.nro_factura || "",
      responsable: g.responsable || "",
      categoria: g.categoria || "Varios",
      subtotal: g.subtotal,
      itbms: g.itbms,
    });
  }

  function rowMenuItems(g: CajaGasto) {
    return [
      { label: "Editar", onClick: () => startEdit(g) },
      { label: "Eliminar", onClick: () => onDeleteGasto(g.id), destructive: true },
    ];
  }

  // Desktop column count (excluding actions/⋯).
  const dataCols = 6 + (showFiscal ? 2 : 0); // Fecha, Desc, Prov, Resp, Cat, (Sub, ITBMS,) Total
  const totalColSpan = 5 + (showFiscal ? 0 : 0); // first 5 cols before Total break

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400">
          Gastos
        </div>
        {nuevoHref && (
          <Link
            href={nuevoHref}
            className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all flex items-center gap-1.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo gasto
          </Link>
        )}
      </div>

      {/* Category chips */}
      {gastos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
          <Chip
            label="Todas"
            amount={grandTotal}
            active={!selectedCat}
            onClick={() => setSelectedCat(null)}
          />
          {catEntries.map(([cat, total]) => (
            <Chip
              key={cat}
              label={cat}
              amount={total}
              active={selectedCat === cat}
              onClick={() => setSelectedCat(selectedCat === cat ? null : cat)}
            />
          ))}
        </div>
      )}

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {sortedGastos.length === 0 ? (
          <EmptyState
            title={selectedCat ? `Sin gastos de ${selectedCat}` : "Sin gastos registrados"}
            subtitle={selectedCat ? "Cambia o quita el filtro" : "Agrega el primer gasto de este período"}
          />
        ) : (
          <>
            {sortedGastos.map((g) => (
              <div
                key={g.id}
                className={`border border-gray-200 rounded-lg p-4 ${recentlyAddedIds.has(g.id) ? "new-row-highlight" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-sm font-semibold truncate flex-1">
                    {g.descripcion || g.nombre || "—"}
                  </p>
                  <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
                    ${fmt(g.total)}
                  </p>
                  {isOpen && (
                    <div className="-my-2 -mr-2">
                      <OverflowMenu items={rowMenuItems(g)} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-0.5">
                  {g.categoria || "Varios"}
                  {g.responsable && ` · ${g.responsable}`}
                </p>
                <p className="text-[11px] text-gray-400">
                  {fmtDate(g.fecha)}
                  {g.proveedor && ` · ${g.proveedor}`}
                </p>
              </div>
            ))}
            <div className="border-t border-gray-300 pt-3 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.05em] text-gray-400">
                Total
              </span>
              <span className="text-sm font-semibold tabular-nums">${fmt(totalGastado)}</span>
            </div>
          </>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <ScrollableTable minWidth={700}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
                <th className="text-left py-3 px-4 font-normal">Fecha</th>
                <th className="text-left py-3 px-4 font-normal">Descripción</th>
                <th className="text-left py-3 px-4 font-normal">Proveedor</th>
                <th className="text-left py-3 px-4 font-normal">Responsable</th>
                <th className="text-left py-3 px-4 font-normal">Categoría</th>
                {showFiscal && (
                  <>
                    <th className="text-right py-3 px-4 font-normal">Sub-total</th>
                    <th className="text-right py-3 px-4 font-normal">ITBMS</th>
                  </>
                )}
                <th className="text-right py-3 px-4 font-normal">Total</th>
                {isOpen && <th className="w-10 py-3 px-2 font-normal"></th>}
              </tr>
            </thead>
            <tbody>
              {sortedGastos.length === 0 ? (
                <tr>
                  <td colSpan={dataCols + (isOpen ? 1 : 0)}>
                    <EmptyState
                      title={selectedCat ? `Sin gastos de ${selectedCat}` : "Sin gastos registrados"}
                      subtitle={selectedCat ? "Cambia o quita el filtro" : "Agrega el primer gasto de este período"}
                    />
                  </td>
                </tr>
              ) : (
                <>
                  {sortedGastos.map((g) =>
                    editingGastoId === g.id ? (
                      <tr key={g.id} className="border-b border-gray-200 bg-gray-50">
                        <td className="py-2 pr-1">
                          <input
                            type="date"
                            value={editGasto.fecha || ""}
                            onChange={(e) => setEditGasto({ ...editGasto, fecha: e.target.value })}
                            className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                          />
                        </td>
                        <td className="py-2 pr-1">
                          <input
                            type="text"
                            value={editGasto.descripcion || ""}
                            onChange={(e) => setEditGasto({ ...editGasto, descripcion: e.target.value })}
                            className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                          />
                        </td>
                        <td className="py-2 pr-1">
                          <input
                            type="text"
                            value={editGasto.proveedor || ""}
                            onChange={(e) => setEditGasto({ ...editGasto, proveedor: e.target.value })}
                            className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                          />
                        </td>
                        <td className="py-2 pr-1">
                          <AutocompleteInput
                            value={editGasto.responsable || ""}
                            onChange={(v) => setEditGasto({ ...editGasto, responsable: v })}
                            options={responsables}
                            placeholder="Responsable"
                            className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                          />
                        </td>
                        <td className="py-2 pr-1">
                          <AutocompleteInput
                            value={editGasto.categoria || "Varios"}
                            onChange={(v) => setEditGasto({ ...editGasto, categoria: v })}
                            options={categorias}
                            placeholder="Categoría"
                            className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent"
                          />
                        </td>
                        {showFiscal && (
                          <>
                            <td className="py-2 pr-1">
                              <input
                                type="number"
                                step="0.01"
                                value={editGasto.subtotal ?? ""}
                                onChange={(e) => setEditGasto({ ...editGasto, subtotal: parseFloat(e.target.value) || 0 })}
                                className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent text-right"
                              />
                            </td>
                            <td className="py-2 pr-1">
                              <input
                                type="number"
                                step="0.01"
                                value={editGasto.itbms ?? ""}
                                onChange={(e) => setEditGasto({ ...editGasto, itbms: parseFloat(e.target.value) || 0 })}
                                className="w-full border-b border-gray-200 py-1 text-xs outline-none bg-transparent text-right"
                              />
                            </td>
                          </>
                        )}
                        <td className="py-2 text-right tabular-nums text-xs font-medium">
                          $
                          {fmt(
                            (parseFloat(String(editGasto.subtotal)) || 0) +
                              (parseFloat(String(editGasto.itbms)) || 0),
                          )}
                        </td>
                        {isOpen && (
                          <td className="py-2 px-2 text-right text-xs whitespace-nowrap">
                            <button onClick={onSaveEdit} className="text-gray-500 hover:text-black mr-2">
                              Guardar
                            </button>
                            <button onClick={() => setEditingGastoId(null)} className="text-gray-300 hover:text-black">
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    ) : (
                      <tr
                        key={g.id}
                        className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${recentlyAddedIds.has(g.id) ? "new-row-highlight" : ""}`}
                      >
                        <td className="py-3 px-4 text-gray-500">{fmtDate(g.fecha)}</td>
                        <td className="py-3 px-4">{g.descripcion || g.nombre}</td>
                        <td className="py-3 px-4 text-gray-500">
                          {g.proveedor || "—"}
                          {g.nro_factura && (
                            <div className="text-[11px] text-gray-400">#{g.nro_factura}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-500">{g.responsable || "—"}</td>
                        <td className="py-3 px-4 text-gray-500">{g.categoria || "Varios"}</td>
                        {showFiscal && (
                          <>
                            <td className="py-3 px-4 text-right tabular-nums">${fmt(g.subtotal)}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-gray-500">${fmt(g.itbms)}</td>
                          </>
                        )}
                        <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(g.total)}</td>
                        {isOpen && (
                          <td className="py-2 px-2 text-right">
                            <OverflowMenu items={rowMenuItems(g)} />
                          </td>
                        )}
                      </tr>
                    ),
                  )}
                  {/* Totals row */}
                  <tr className="border-t border-gray-300">
                    <td
                      colSpan={totalColSpan}
                      className="py-3 px-4 text-right text-[11px] uppercase tracking-[0.05em] text-gray-400"
                    >
                      Total
                    </td>
                    {showFiscal && (
                      <>
                        <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(totalSubtotal)}</td>
                        <td className="py-3 px-4 text-right tabular-nums font-medium">${fmt(totalItbms)}</td>
                      </>
                    )}
                    <td className="py-3 px-4 text-right tabular-nums font-semibold">${fmt(totalGastado)}</td>
                    {isOpen && <td />}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </ScrollableTable>
        {gastos.length > 0 && (
          <p className="sm:hidden text-[10px] text-gray-400 mt-2 text-center">
            Desliza &rarr; para ver más columnas
          </p>
        )}
      </div>

      {/* Fiscal toggle */}
      {gastos.length > 0 && (
        <div className="mt-4 flex items-center justify-end">
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showFiscal}
              onChange={(e) => setShowFiscal(e.target.checked)}
              className="accent-black"
            />
            Ver desglose fiscal (Sub-total + ITBMS)
          </label>
        </div>
      )}
    </div>
  );
}
