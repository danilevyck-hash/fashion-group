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
  /** Link de fallback (deep-link) para "+ Nuevo gasto". Si viene onNuevoGasto, ese tiene prioridad. */
  nuevoHref?: string;
  /** Callback para abrir el Drawer inline de nuevo gasto (camino normal). */
  onNuevoGasto?: () => void;
  /** Cambio rápido de categoría desde el chip inline de la fila. */
  onQuickCategoria?: (gastoId: string, categoria: string) => void;
}

/* Curated dot colors per common category — fall back to stone-400 for the rest. */
const CAT_COLORS: Record<string, string> = {
  "Alimentación": "#0E7490", // cyan-700
  "Alimentacion": "#0E7490",
  "Transporte": "#0F766E", // teal-700
  "Otros": "#78716C", // stone-500
  "Sin categoría": "#A8A29E", // stone-400
  "Varios": "#78716C",
};
function catColor(cat: string | undefined | null) {
  if (!cat) return "#A8A29E";
  return CAT_COLORS[cat] ?? "#78716C";
}

function CategoryDot({ categoria }: { categoria: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-[12.5px]"
      style={{ color: "var(--caja-fg-default)" }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: catColor(categoria) }}
      />
      {categoria}
    </span>
  );
}

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
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
      className="shrink-0 inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap px-3 rounded-full text-[12px] font-medium transition-all"
      style={{
        background: active ? "var(--caja-stone-950)" : "#fff",
        color: active ? "#fff" : "var(--caja-fg-default)",
        border: `1px solid ${active ? "var(--caja-stone-950)" : "var(--caja-border-default)"}`,
        fontFamily: "var(--caja-font-sans)",
      }}
    >
      <span>{label}</span>
      <span
        className="caja-mono"
        style={{
          fontSize: 11,
          color: active ? "rgba(255,255,255,0.7)" : "var(--caja-fg-muted)",
          fontWeight: 400,
        }}
      >
        ${fmt(amount)}
      </span>
    </button>
  );
}

export default function GastoTable({
  gastos,
  isOpen,
  categorias,
  editingGastoId,
  editGasto,
  setEditingGastoId,
  setEditGasto,
  onSaveEdit,
  onDeleteGasto,
  recentlyAddedIds = new Set(),
  nuevoHref,
  onNuevoGasto,
  onQuickCategoria,
}: Props) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [showFiscal, setShowFiscal] = useState(false);
  const [quickCatId, setQuickCatId] = useState<string | null>(null);

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

  // Desktop column count (excluding actions/⋯). Responsable salió de la tabla
  // (ahora es a nivel período); el dato por gasto se sigue guardando en DB.
  const dataCols = 5 + (showFiscal ? 2 : 0); // Fecha, Desc, Prov, Cat, (Sub, ITBMS,) Total
  const totalColSpan = 4; // first 4 cols before Sub/ITBMS/Total break

  return (
    <div className="mb-10 mt-8">
      <div className="flex items-end justify-between mb-3.5 gap-4">
        <div>
          <h2
            className="caja-display-sm"
            style={{ fontSize: 22, color: "var(--caja-fg-strong)", margin: 0 }}
          >
            Gastos
          </h2>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--caja-fg-muted)" }}
          >
            {gastos.length} {gastos.length === 1 ? "registro" : "registros"} ·
            {" "}
            <span className="caja-mono">${fmt(grandTotal)}</span> total
          </p>
        </div>
        {onNuevoGasto ? (
          <button
            onClick={onNuevoGasto}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 min-h-[44px] rounded-md transition-transform active:scale-[0.97]"
            style={{ background: "var(--caja-accent)", color: "#fff" }}
          >
            <PlusIcon /> Nuevo gasto
          </button>
        ) : nuevoHref ? (
          <Link
            href={nuevoHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 min-h-[44px] rounded-md transition-transform active:scale-[0.97]"
            style={{ background: "var(--caja-accent)", color: "#fff" }}
          >
            <PlusIcon /> Nuevo gasto
          </Link>
        ) : null}
      </div>

      {/* Category chips — ENVUELTOS, no carrusel.
          🩸 Con 5 categorías la tira medía 327 px de más a 390 px y 139 a 834:
          para llegar a "Materiales $10.27" había que arrastrar. `flex-wrap`
          los acomoda solos y en escritorio siguen entrando en una fila, así
          que ahí no cambia nada. (Mismo cambio que #371 en los filtros del
          catálogo: correr el breakpoint no arreglaba nada, envolver sí.) */}
      {gastos.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2 mb-3.5">
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

      {/* ── Tarjetas (celular y iPad) ──────────────────────────────────────
          A 834 px la tabla pedía 702 px contra 538 útiles (la barra lateral se
          lleva 224 px desde los 768, justo donde se encendía con `md`) y las
          columnas que se iban fuera de la pantalla eran CATEGORÍA y TOTAL.
          El corte pasa a `lg` (1024), donde quedan 728 px útiles y la tabla
          entra con 26 px de aire — medido, no supuesto. */}
      <div className="lg:hidden space-y-3">
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
                data-gasto-fila={g.id}
                className={`rounded-lg p-4 ${recentlyAddedIds.has(g.id) ? "new-row-highlight" : ""}`}
                style={{
                  background: "var(--caja-bg-surface)",
                  border: "1px solid var(--caja-border-subtle)",
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p
                    className="text-sm font-medium truncate flex-1"
                    style={{ color: "var(--caja-fg-strong)" }}
                    data-gasto-campo="descripcion"
                  >
                    {g.descripcion || g.nombre || "—"}
                  </p>
                  <p className="caja-money caja-money-strong text-sm whitespace-nowrap" data-gasto-campo="total">
                    ${fmt(g.total)}
                  </p>
                  {isOpen && (
                    <div className="-my-2 -mr-2">
                      <OverflowMenu items={rowMenuItems(g)} />
                    </div>
                  )}
                </div>
                <div className="mb-1" data-gasto-campo="categoria">
                  <CategoryDot categoria={g.categoria || "Varios"} />
                </div>
                <p
                  className="text-xs caja-mono"
                  style={{ color: "var(--caja-fg-subtle)" }}
                >
                  {fmtDate(g.fecha)}
                  {g.proveedor && ` · ${g.proveedor}`}
                </p>
              </div>
            ))}
            <div
              className="pt-3 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--caja-border-default)" }}
            >
              <span className="caja-eyebrow">Total</span>
              <span className="caja-money caja-money-strong text-sm">
                ${fmt(totalGastado)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Desktop table */}
      <div
        className="hidden lg:block overflow-hidden"
        style={{
          background: "var(--caja-bg-surface)",
          border: "1px solid var(--caja-border-subtle)",
          borderRadius: 8,
        }}
      >
        <ScrollableTable minWidth={700}>
          <table className="w-full text-sm">
            <thead>
              <tr
                className="caja-eyebrow"
                style={{
                  background: "var(--caja-stone-100)",
                  borderBottom: "1px solid var(--caja-border-subtle)",
                }}
              >
                <th className="text-left py-2.5 px-4 font-medium">Fecha</th>
                <th className="text-left py-2.5 px-4 font-medium">Descripción</th>
                <th className="text-left py-2.5 px-4 font-medium">Proveedor</th>
                <th className="text-left py-2.5 px-4 font-medium">Categoría</th>
                {showFiscal && (
                  <>
                    <th className="text-right py-2.5 px-4 font-medium">Sub-total</th>
                    <th className="text-right py-2.5 px-4 font-medium">ITBMS</th>
                  </>
                )}
                <th className="text-right py-2.5 px-4 font-medium">Total</th>
                {isOpen && <th className="w-10 py-2.5 px-2 font-medium" />}
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
                  {sortedGastos.map((g, idx) =>
                    editingGastoId === g.id ? (
                      <tr
                        key={g.id}
                        style={{
                          borderBottom: idx < sortedGastos.length - 1 ? "1px solid var(--caja-stone-100)" : 0,
                          background: "var(--caja-bg-page)",
                        }}
                      >
                        <td className="py-2 pr-1 px-4">
                          <input
                            type="date"
                            value={editGasto.fecha || ""}
                            onChange={(e) => setEditGasto({ ...editGasto, fecha: e.target.value })}
                            className="w-full caja-mono py-1 text-xs outline-none bg-transparent"
                            style={{ borderBottom: "1px solid var(--caja-border-default)" }}
                          />
                        </td>
                        <td className="py-2 pr-1 px-4">
                          <input
                            type="text"
                            value={editGasto.descripcion || ""}
                            onChange={(e) => setEditGasto({ ...editGasto, descripcion: e.target.value })}
                            className="w-full py-1 text-xs outline-none bg-transparent"
                            style={{ borderBottom: "1px solid var(--caja-border-default)" }}
                          />
                        </td>
                        <td className="py-2 pr-1 px-4">
                          <input
                            type="text"
                            value={editGasto.proveedor || ""}
                            onChange={(e) => setEditGasto({ ...editGasto, proveedor: e.target.value })}
                            className="w-full py-1 text-xs outline-none bg-transparent"
                            style={{ borderBottom: "1px solid var(--caja-border-default)" }}
                          />
                        </td>
                        <td className="py-2 pr-1 px-4">
                          <AutocompleteInput
                            value={editGasto.categoria || "Varios"}
                            onChange={(v) => setEditGasto({ ...editGasto, categoria: v })}
                            options={categorias}
                            placeholder="Categoría"
                            className="w-full py-1 text-xs outline-none bg-transparent"
                          />
                        </td>
                        {showFiscal && (
                          <>
                            <td className="py-2 pr-1 px-4">
                              <input
                                type="number"
                                step="0.01"
                                value={editGasto.subtotal ?? ""}
                                onChange={(e) => setEditGasto({ ...editGasto, subtotal: parseFloat(e.target.value) || 0 })}
                                className="w-full caja-mono py-1 text-xs outline-none bg-transparent text-right"
                                style={{ borderBottom: "1px solid var(--caja-border-default)" }}
                              />
                            </td>
                            <td className="py-2 pr-1 px-4">
                              <input
                                type="number"
                                step="0.01"
                                value={editGasto.itbms ?? ""}
                                onChange={(e) => setEditGasto({ ...editGasto, itbms: parseFloat(e.target.value) || 0 })}
                                className="w-full caja-mono py-1 text-xs outline-none bg-transparent text-right"
                                style={{ borderBottom: "1px solid var(--caja-border-default)" }}
                              />
                            </td>
                          </>
                        )}
                        <td className="py-2 px-4 text-right caja-money caja-money-strong text-xs">
                          $
                          {fmt(
                            (parseFloat(String(editGasto.subtotal)) || 0) +
                              (parseFloat(String(editGasto.itbms)) || 0),
                          )}
                        </td>
                        {isOpen && (
                          <td className="py-2 px-2 text-right text-xs whitespace-nowrap">
                            <button
                              onClick={onSaveEdit}
                              className="mr-2 transition-colors"
                              style={{ color: "var(--caja-accent)" }}
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditingGastoId(null)}
                              className="transition-colors"
                              style={{ color: "var(--caja-fg-subtle)" }}
                            >
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    ) : (
                      <tr
                        key={g.id}
                        data-gasto-fila={g.id}
                        className={`transition-colors ${recentlyAddedIds.has(g.id) ? "new-row-highlight" : ""}`}
                        style={{
                          borderBottom: idx < sortedGastos.length - 1 ? "1px solid var(--caja-stone-100)" : 0,
                          minHeight: 52,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--caja-bg-page)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td
                          className="py-3 px-4 caja-mono"
                          style={{ color: "var(--caja-fg-default)" }}
                        >
                          {fmtDate(g.fecha)}
                        </td>
                        <td
                          className="py-3 px-4"
                          style={{ color: "var(--caja-fg-strong)" }}
                          data-gasto-campo="descripcion"
                        >
                          {g.descripcion || g.nombre}
                        </td>
                        <td className="py-3 px-4" style={{ color: "var(--caja-fg-default)" }}>
                          {g.proveedor || "—"}
                          {g.nro_factura && (
                            <div
                              className="caja-mono text-xs mt-0.5"
                              style={{ color: "var(--caja-fg-subtle)" }}
                            >
                              #{g.nro_factura}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4" data-gasto-campo="categoria">
                          {isOpen && onQuickCategoria && quickCatId === g.id ? (
                            <select
                              autoFocus
                              value={g.categoria || "Varios"}
                              onChange={(e) => { onQuickCategoria(g.id, e.target.value); setQuickCatId(null); }}
                              onBlur={() => setQuickCatId(null)}
                              className="text-xs py-1 px-1.5 rounded-md outline-none bg-white"
                              style={{ border: "1px solid var(--caja-border-default)" }}
                            >
                              {(categorias.includes(g.categoria || "Varios") ? categorias : [g.categoria || "Varios", ...categorias]).map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          ) : isOpen && onQuickCategoria ? (
                            <button
                              type="button"
                              onClick={() => setQuickCatId(g.id)}
                              title="Cambiar categoría"
                              className="cursor-pointer rounded-md hover:bg-[var(--caja-bg-page)] -mx-1 px-1 py-0.5 transition-colors"
                              style={{ background: "transparent", border: 0 }}
                            >
                              <CategoryDot categoria={g.categoria || "Varios"} />
                            </button>
                          ) : (
                            <CategoryDot categoria={g.categoria || "Varios"} />
                          )}
                        </td>
                        {showFiscal && (
                          <>
                            <td className="py-3 px-4 text-right caja-money">
                              ${fmt(g.subtotal)}
                            </td>
                            <td
                              className="py-3 px-4 text-right caja-money"
                              style={{ color: "var(--caja-fg-muted)" }}
                            >
                              ${fmt(g.itbms)}
                            </td>
                          </>
                        )}
                        <td className="py-3 px-4 text-right caja-money caja-money-strong" data-gasto-campo="total">
                          ${fmt(g.total)}
                        </td>
                        {isOpen && (
                          <td className="py-2 px-2 text-right">
                            <OverflowMenu items={rowMenuItems(g)} />
                          </td>
                        )}
                      </tr>
                    ),
                  )}
                  {/* Totals row */}
                  <tr style={{ borderTop: "1px solid var(--caja-border-default)" }}>
                    <td
                      colSpan={totalColSpan}
                      className="py-3 px-4 text-right caja-eyebrow"
                    >
                      Total
                    </td>
                    {showFiscal && (
                      <>
                        <td className="py-3 px-4 text-right caja-money caja-money-strong">
                          ${fmt(totalSubtotal)}
                        </td>
                        <td className="py-3 px-4 text-right caja-money caja-money-strong">
                          ${fmt(totalItbms)}
                        </td>
                      </>
                    )}
                    <td className="py-3 px-4 text-right caja-money caja-money-strong">
                      ${fmt(totalGastado)}
                    </td>
                    {isOpen && <td />}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </ScrollableTable>
      </div>

      {/* Fiscal toggle */}
      {gastos.length > 0 && (
        <div className="mt-4 flex items-center justify-end">
          {/* El <input type=checkbox> nativo mide 13×13 y no se puede agrandar
              sin que se vea deforme; lo que se toca de verdad es la etiqueta,
              así que la etiqueta es la que llega a 44 px de alto. */}
          <label
            className="flex min-h-[44px] items-center gap-2 text-xs cursor-pointer select-none"
            style={{ color: "var(--caja-fg-muted)" }}
          >
            <input
              type="checkbox"
              checked={showFiscal}
              onChange={(e) => setShowFiscal(e.target.checked)}
              style={{ accentColor: "var(--caja-accent)" }}
            />
            Ver desglose fiscal (Sub-total + ITBMS)
          </label>
        </div>
      )}
    </div>
  );
}
