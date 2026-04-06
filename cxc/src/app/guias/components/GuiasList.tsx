"use client";

import { useState } from "react";
import { fmtDate, fmtGuia } from "@/lib/format";
import type { Guia, GuiaItem } from "./types";
import { clientesSummary } from "./constants";
import { SkeletonTable, EmptyState, StatusBadge, AccordionContent, ScrollableTable, SwipeableRow } from "@/components/ui";
import type { SwipeAction } from "@/components/ui";
import DespachoForm from "./DespachoForm";
import { exportGuiasExcel } from "./excel-guias";
import { groupByTimePeriod } from "@/lib/group-by-time";
import TimeGroupHeader from "@/components/TimeGroupHeader";

interface GuiasListProps {
  guias: Guia[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  showPending: boolean;
  setShowPending: (v: boolean) => void;
  role: string | null;
  onNewGuia: () => void;
  // Accordion
  expandedId: string | null;
  expandedGuia: Guia | null;
  expandedLoading: boolean;
  onToggleExpand: (id: string) => void;
  // Despacho
  tipoDespacho: "externo" | "directo";
  setTipoDespacho: (v: "externo" | "directo") => void;
  bPlaca: string;
  setBPlaca: (v: string) => void;
  bReceptor: string;
  setBReceptor: (v: string) => void;
  bCedula: string;
  setBCedula: (v: string) => void;
  bChofer: string;
  setBChofer: (v: string) => void;
  bSaving: boolean;
  onConfirmarDespacho: (firma1: string, firma2: string) => void;
  showToast: (msg: string) => void;
  pendingFirma1?: string | null;
  pendingFirma2?: string | null;
  onFirma1Change?: (v: string | null) => void;
  onFirma2Change?: (v: string | null) => void;
  // Actions
  onEdit: (id: string) => void;
  onPrint: (id: string) => void;
  onDelete: (id: string) => void;
  onReject: (id: string, motivo: string) => void;
}

const DESPACHO_ROLES = ["admin", "secretaria", "bodega", "director"];
const CREATE_ROLES = ["admin", "secretaria", "bodega"];
const DELETE_ROLES = ["admin", "secretaria"];
const REJECT_ROLES = ["admin", "secretaria"];

export default function GuiasList({
  guias, loading, error, search, setSearch,
  showPending, setShowPending, role,
  onNewGuia,
  expandedId, expandedGuia, expandedLoading, onToggleExpand,
  tipoDespacho, setTipoDespacho,
  bPlaca, setBPlaca, bReceptor, setBReceptor, bCedula, setBCedula,
  bChofer, setBChofer, bSaving, onConfirmarDespacho, showToast,
  pendingFirma1, pendingFirma2, onFirma1Change, onFirma2Change,
  onEdit, onPrint, onDelete, onReject,
}: GuiasListProps) {
  const [visibleCount, setVisibleCount] = useState(15);
  const [groupedView, setGroupedView] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function printSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Open each in a new tab for printing
    ids.forEach(id => window.open(`/guias?id=${id}`, '_blank'));
  }

  function exportSelectedExcel() {
    if (selectedIds.size === 0) return;
    const selected = guias.filter(g => selectedIds.has(g.id));
    exportGuiasExcel(selected, `${selected.length} guías seleccionadas`);
  }
  const canCreate = role && CREATE_ROLES.includes(role);
  const canDespacho = role && DESPACHO_ROLES.includes(role);
  const canDelete = role && DELETE_ROLES.includes(role);
  const canEdit = role && ["admin", "secretaria", "bodega"].includes(role);
  const canReject = role && REJECT_ROLES.includes(role);

  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="text-xl font-light tracking-tight">Guias de Transporte</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {selectionMode ? (
              <>
                <span className="text-sm text-gray-400">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? "s" : ""}</span>
                {selectedIds.size > 0 && (
                  <>
                    <button onClick={printSelected} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 py-2 rounded-md active:bg-gray-100 transition-all">Imprimir todas</button>
                    <button onClick={exportSelectedExcel} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 py-2 rounded-md active:bg-gray-100 transition-all">&darr; Excel</button>
                  </>
                )}
                <button onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
              </>
            ) : (
              <>
                {guias.length > 0 && (
                  <>
                    <button onClick={() => { setSelectionMode(true); setSelectedIds(new Set()); }} className="text-sm text-gray-400 hover:text-black border border-gray-200 px-4 py-2 rounded-md transition">Seleccionar</button>
                    <button
                      onClick={() => {
                        const filtered = guias
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
                          .filter((g) => !showPending || g.estado === "Pendiente Bodega");
                        const subtitle = search
                          ? `Filtrado: "${search}"`
                          : showPending
                            ? "Pendientes de bodega"
                            : "Todas las gu\u00edas";
                        exportGuiasExcel(filtered, subtitle);
                      }}
                      className="text-sm border border-gray-200 text-gray-600 px-4 py-3 rounded-md font-medium hover:border-gray-400 hover:text-black transition"
                    >
                      &darr; Excel
                    </button>
                  </>
                )}
                {canCreate && (
                  <button
                    onClick={onNewGuia}
                    className="text-sm bg-black text-white px-6 py-3 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all"
                  >
                    Nueva Guia
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Bodega pending banner */}
        {role === "bodega" && (() => {
          const pendingCount = guias.filter((g) => g.estado === "Pendiente Bodega").length;
          if (pendingCount === 0) return null;
          return (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600 mb-6 flex items-center justify-between">
              <span>
                {pendingCount} guia{pendingCount !== 1 ? "s" : ""} pendiente{pendingCount !== 1 ? "s" : ""} de despachar
              </span>
              <button
                onClick={() => setShowPending(!showPending)}
                className="text-xs font-medium text-gray-500 hover:text-black underline transition"
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
            title="No hay guias registradas"
            subtitle="Crea tu primera guia para registrar un despacho"
            actionLabel={canCreate ? "+ Nueva Guia" : undefined}
            onAction={canCreate ? onNewGuia : undefined}
          />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-4">
              {selectionMode && (
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer shrink-0">
                  <input type="checkbox" checked={(() => { const ids = guias.filter(g => { if (!search) return true; const q = search.toLowerCase(); return g.transportista.toLowerCase().includes(q) || (g.guia_items || []).some((item: GuiaItem) => (item.facturas || "").toLowerCase().includes(q) || (item.cliente || "").toLowerCase().includes(q)); }).filter(g => !showPending || g.estado === "Pendiente Bodega").map(g => g.id); return ids.length > 0 && ids.every(id => selectedIds.has(id)); })()} onChange={() => { const ids = guias.filter(g => { if (!search) return true; const q = search.toLowerCase(); return g.transportista.toLowerCase().includes(q) || (g.guia_items || []).some((item: GuiaItem) => (item.facturas || "").toLowerCase().includes(q) || (item.cliente || "").toLowerCase().includes(q)); }).filter(g => !showPending || g.estado === "Pendiente Bodega").map(g => g.id); const allSel = ids.length > 0 && ids.every(id => selectedIds.has(id)); if (allSel) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(ids)); } }} className="accent-black" />
                  Todas
                </label>
              )}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por transportista, cliente o factura..."
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-black w-full max-w-sm transition"
              />
              <button onClick={() => setGroupedView(!groupedView)} className={`text-xs transition whitespace-nowrap ${groupedView ? "text-black font-medium" : "text-gray-400 hover:text-black"}`}>
                {groupedView ? "Lista plana" : "Agrupar por fecha"}
              </button>
            </div>

            <div className="space-y-1">
              {(() => {
                const filtered = guias
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
                  .filter((g) => !showPending || g.estado === "Pendiente Bodega");

                if (filtered.length === 0) {
                  return <p className="text-sm text-gray-400 py-8 text-center">No hay guias</p>;
                }

                const visible = filtered.slice(0, visibleCount);
                const hasMore = filtered.length > visibleCount;

                const totalBultos = filtered.reduce((s, g) => s + (g.total_bultos || 0), 0);

                const allFilteredIds = filtered.map(g => g.id);
                const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));

                const _gg = groupedView ? groupByTimePeriod(visible, "fecha" as keyof Guia, "guias") : null;
                const _rc = (g: Guia) => {
                      const isExpanded = expandedId === g.id;
                      const isDispatched = g.estado === "Completada" || g.estado === "Rechazada";
                      const isPendingDespacho = g.estado === "Pendiente Bodega" && canDespacho;

                      const despachoSwipeAction: SwipeAction | undefined = isPendingDespacho ? {
                        label: "Despachar",
                        color: "bg-blue-500",
                        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
                        onAction: () => onToggleExpand(g.id),
                      } : undefined;

                      const cardContent = (
                        <div className={`border rounded-lg transition-all ${isExpanded ? "border-gray-300" : "border-gray-200 hover:border-gray-200"}`}>
                          {/* Row header */}
                          <button
                            onClick={() => selectionMode ? toggleSelect(g.id) : onToggleExpand(g.id)}
                            className="w-full flex items-center gap-4 px-4 py-3 text-left text-sm"
                          >
                            {selectionMode && (
                              <span onClick={(e) => { e.stopPropagation(); toggleSelect(g.id); }} className="shrink-0">
                                <input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleSelect(g.id)} className="accent-black" />
                              </span>
                            )}
                            <span className="font-medium w-16 shrink-0 font-mono text-xs">{fmtGuia(g.numero)}</span>
                            <span className="text-gray-500 w-36 shrink-0 text-xs">{fmtDate(g.fecha)}</span>
                            <span className="flex-1 truncate">{g.transportista}</span>
                            <span className="text-gray-400 text-xs hidden sm:block w-40 truncate">
                              {clientesSummary(g.guia_items || [])}
                            </span>
                            <span className="tabular-nums w-14 text-right shrink-0">{g.total_bultos}</span>
                            {!isDispatched && g.estado === "Pendiente Bodega" && (
                              <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">
                                ⚠ Pendiente despacho
                              </span>
                            )}
                            <span className="w-24 shrink-0">
                              <StatusBadge estado={g.estado === "Rechazada" ? "rechazada" : isDispatched ? "despachada" : "pendiente"} />
                            </span>
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Expanded content */}
                          <AccordionContent open={isExpanded}>
                            <div className="px-4 pb-5 border-t border-gray-200">
                              {expandedLoading ? (
                                <div className="py-6 flex justify-center"><svg className="animate-spin h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
                              ) : expandedGuia ? (
                                <>
                                  {/* Items table */}
                                  <ScrollableTable minWidth={600} className="mt-4">
                                    <table className="w-full text-xs">
                                      <thead className="sticky top-0 bg-white z-10">
                                        <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                                          <th className="text-left py-2 px-2 font-normal">#</th>
                                          <th className="text-left py-2 px-2 font-normal">Cliente</th>
                                          <th className="text-left py-2 px-2 font-normal">Direccion</th>
                                          <th className="text-left py-2 px-2 font-normal">Empresa</th>
                                          <th className="text-left py-2 px-2 font-normal">Facturas</th>
                                          <th className="text-center py-2 px-2 font-normal">Bultos</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(expandedGuia.guia_items || []).map((item, idx) => (
                                          <tr key={idx} className="border-b border-gray-50">
                                            <td className="py-1.5 px-2 text-gray-300">{idx + 1}</td>
                                            <td className="py-1.5 px-2">{item.cliente}</td>
                                            <td className="py-1.5 px-2 text-gray-500">{item.direccion}</td>
                                            <td className="py-1.5 px-2 text-gray-500">{item.empresa}</td>
                                            <td className="py-1.5 px-2 text-gray-500">{item.facturas}</td>
                                            <td className="py-1.5 px-2 text-center tabular-nums">{item.bultos}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </ScrollableTable>

                                  {/* Observaciones */}
                                  {expandedGuia.observaciones && (
                                    <p className="text-xs text-gray-500 mt-3 italic">{expandedGuia.observaciones}</p>
                                  )}

                                  {/* Dispatched: read-only despacho data */}
                                  {isDispatched && (
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        <div>
                                          <span className="text-gray-400 block">Tipo</span>
                                          <span className="font-medium">{expandedGuia.tipo_despacho === "directo" ? "Entrega directa" : "Transportista externo"}</span>
                                        </div>
                                        {expandedGuia.placa && (
                                          <div>
                                            <span className="text-gray-400 block">Placa</span>
                                            <span className="font-medium">{expandedGuia.placa}</span>
                                          </div>
                                        )}
                                        {expandedGuia.nombre_chofer && (
                                          <div>
                                            <span className="text-gray-400 block">Chofer</span>
                                            <span className="font-medium">{expandedGuia.nombre_chofer}</span>
                                          </div>
                                        )}
                                        <div>
                                          <span className="text-gray-400 block">Receptor</span>
                                          <span className="font-medium">{expandedGuia.receptor_nombre || "—"}</span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400 block">Cedula</span>
                                          <span className="font-medium">{expandedGuia.cedula || "—"}</span>
                                        </div>
                                      </div>
                                      {/* Signatures */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                        {expandedGuia.firma_base64 && (
                                          <div>
                                            <span className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                                              {expandedGuia.tipo_despacho === "directo" ? "Firma del chofer" : "Firma del transportista"}
                                            </span>
                                            <img src={expandedGuia.firma_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                                          </div>
                                        )}
                                        {expandedGuia.firma_entregador_base64 && (
                                          <div>
                                            <span className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                                              {expandedGuia.tipo_despacho === "directo" ? "Firma del cliente" : "Firma del entregador"}
                                            </span>
                                            <img src={expandedGuia.firma_entregador_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Pending: despacho form */}
                                  {!isDispatched && canDespacho && (
                                    <DespachoForm
                                      tipoDespacho={tipoDespacho}
                                      setTipoDespacho={setTipoDespacho}
                                      bPlaca={bPlaca}
                                      setBPlaca={setBPlaca}
                                      bReceptor={bReceptor}
                                      setBReceptor={setBReceptor}
                                      bCedula={bCedula}
                                      setBCedula={setBCedula}
                                      bChofer={bChofer}
                                      setBChofer={setBChofer}
                                      bSaving={bSaving}
                                      onConfirmar={onConfirmarDespacho}
                                      showToast={showToast}
                                      pendingFirma1={pendingFirma1}
                                      pendingFirma2={pendingFirma2}
                                      onFirma1Change={onFirma1Change}
                                      onFirma2Change={onFirma2Change}
                                    />
                                  )}

                                  {/* Action buttons */}
                                  <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-200">
                                    {canEdit && !isDispatched && (
                                      <button
                                        onClick={() => onEdit(expandedGuia.id)}
                                        className="text-xs text-gray-500 hover:text-black transition min-h-[44px] inline-flex items-center"
                                      >
                                        Editar
                                      </button>
                                    )}
                                    <button
                                      onClick={() => window.open(`/guias?id=${expandedGuia.id}`, '_blank')}
                                      className="text-xs text-gray-500 hover:text-black transition min-h-[44px] inline-flex items-center"
                                    >
                                      Imprimir
                                    </button>
                                    {canReject && isDispatched && expandedGuia.estado !== "Rechazada" && (
                                      rejectingId === expandedGuia.id ? (
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                          <input type="text" value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} placeholder="Motivo de rechazo..." className="border-b border-gray-200 py-1 text-xs outline-none w-full max-w-[200px]" autoFocus />
                                          <button onClick={() => { if (rejectMotivo.trim()) { onReject(expandedGuia.id, rejectMotivo.trim()); setRejectingId(null); setRejectMotivo(""); } }} disabled={!rejectMotivo.trim()} className="text-xs text-red-600 hover:text-red-800 transition disabled:opacity-40">Confirmar</button>
                                          <button onClick={() => { setRejectingId(null); setRejectMotivo(""); }} className="text-xs text-gray-400 hover:text-black transition">Cancelar</button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setRejectingId(expandedGuia.id)} className="text-xs text-amber-600 hover:text-red-600 transition">Rechazar/Devolver</button>
                                      )
                                    )}
                                    {canDelete && (
                                      <button
                                        onClick={() => onDelete(expandedGuia.id)}
                                        className="text-xs text-gray-400 hover:text-red-500 transition ml-auto"
                                      >
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </AccordionContent>
                        </div>
                      );

                      if (despachoSwipeAction) {
                        return (
                          <SwipeableRow key={g.id} rightAction={despachoSwipeAction} className="rounded-lg">
                            {cardContent}
                          </SwipeableRow>
                        );
                      }

                      return <div key={g.id}>{cardContent}</div>;
                };

                return (
                  <>
                    {_gg ? (
                      <div className="space-y-0">
                        {_gg.map((group) => (
                          <TimeGroupHeader key={group.key} label={group.label} count={group.items.length} color={group.color} bgColor={group.bgColor}>
                            <div className="space-y-1 p-1">{group.items.map(_rc)}</div>
                          </TimeGroupHeader>
                        ))}
                      </div>
                    ) : (
                      visible.map(_rc)
                    )}

                    {/* Ver más */}
                    {hasMore && (
                      <button onClick={() => setVisibleCount(c => c + 15)}
                        className="w-full py-4 text-base font-medium text-gray-700 hover:text-black hover:bg-gray-50 transition border-2 border-gray-300 rounded-lg mt-3 flex items-center justify-center gap-2">
                        <span>Ver más ({filtered.length - visibleCount} restantes)</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}

                    {/* Totals */}
                    <div className="flex items-center justify-between px-4 py-3 text-sm border-t border-gray-200 mt-2">
                      <span className="text-gray-400 text-xs uppercase tracking-wider">
                        {filtered.length} guia{filtered.length !== 1 ? "s" : ""}
                      </span>
                      <span className="tabular-nums font-medium">{totalBultos} bultos</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
