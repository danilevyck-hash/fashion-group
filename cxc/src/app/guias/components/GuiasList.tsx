"use client";

import { fmtDate } from "@/lib/format";
import type { Guia, GuiaItem } from "./types";
import { clientesSummary, getMonthOptions } from "./constants";
import { SkeletonTable, EmptyState, StatusBadge } from "@/components/ui";
import DespachoForm from "./DespachoForm";

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
}

const DESPACHO_ROLES = ["admin", "secretaria", "bodega", "director"];
const CREATE_ROLES = ["admin", "secretaria", "bodega"];
const DELETE_ROLES = ["admin", "secretaria"];

export default function GuiasList({
  guias, loading, error, search, setSearch, monthFilter, setMonthFilter,
  showPending, setShowPending, role,
  onNewGuia,
  expandedId, expandedGuia, expandedLoading, onToggleExpand,
  tipoDespacho, setTipoDespacho,
  bPlaca, setBPlaca, bReceptor, setBReceptor, bCedula, setBCedula,
  bChofer, setBChofer, bSaving, onConfirmarDespacho, showToast,
  pendingFirma1, pendingFirma2, onFirma1Change, onFirma2Change,
  onEdit, onPrint, onDelete,
}: GuiasListProps) {
  const canCreate = role && CREATE_ROLES.includes(role);
  const canDespacho = role && DESPACHO_ROLES.includes(role);
  const canDelete = role && DELETE_ROLES.includes(role);
  const canEdit = role && ["admin", "secretaria", "bodega"].includes(role);

  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-light tracking-tight">Guias de Transporte</h1>
          {canCreate && (
            <button
              onClick={onNewGuia}
              className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition"
            >
              Nueva Guia
            </button>
          )}
        </div>

        {/* Bodega pending banner */}
        {role === "bodega" && (() => {
          const pendingCount = guias.filter((g) => g.estado === "Pendiente Bodega").length;
          if (pendingCount === 0) return null;
          return (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 mb-6 flex items-center justify-between">
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
            <div className="flex items-end gap-4 mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por transportista, cliente o factura..."
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-black w-full max-w-sm transition"
              />
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Mes</label>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none"
                >
                  {getMonthOptions().map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
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
                  .filter((g) => !showPending || g.estado === "Pendiente Bodega");

                if (filtered.length === 0) {
                  return <p className="text-sm text-gray-400 py-8 text-center">No hay guias en este periodo</p>;
                }

                const totalBultos = filtered.reduce((s, g) => s + (g.total_bultos || 0), 0);

                return (
                  <>
                    {filtered.map((g) => {
                      const isExpanded = expandedId === g.id;
                      const isDispatched = g.estado === "Completada" || g.estado === "Listo para Imprimir";

                      return (
                        <div key={g.id} className={`border rounded-xl transition-all ${isExpanded ? "border-gray-300 shadow-sm" : "border-gray-100 hover:border-gray-200"}`}>
                          {/* Row header */}
                          <button
                            onClick={() => onToggleExpand(g.id)}
                            className="w-full flex items-center gap-4 px-4 py-3 text-left text-sm"
                          >
                            <span className="font-medium w-10 shrink-0">{g.numero}</span>
                            <span className="text-gray-500 w-24 shrink-0">{fmtDate(g.fecha)}</span>
                            <span className="flex-1 truncate">{g.transportista}</span>
                            <span className="text-gray-400 text-xs hidden sm:block w-40 truncate">
                              {clientesSummary(g.guia_items || [])}
                            </span>
                            <span className="tabular-nums w-14 text-right shrink-0">{g.total_bultos}</span>
                            <span className="w-24 shrink-0">
                              <StatusBadge estado={isDispatched ? "despachada" : "pendiente"} />
                            </span>
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Expanded content */}
                          {isExpanded && (
                            <div className="px-4 pb-5 border-t border-gray-100">
                              {expandedLoading ? (
                                <div className="py-6 flex justify-center"><svg className="animate-spin h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
                              ) : expandedGuia ? (
                                <>
                                  {/* Items table */}
                                  <div className="overflow-x-auto mt-4">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
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
                                  </div>

                                  {/* Observaciones */}
                                  {expandedGuia.observaciones && (
                                    <p className="text-xs text-gray-500 mt-3 italic">{expandedGuia.observaciones}</p>
                                  )}

                                  {/* Dispatched: read-only despacho data */}
                                  {isDispatched && (
                                    <div className="mt-4 pt-4 border-t border-gray-100">
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
                                            <img src={expandedGuia.firma_base64} alt="Firma" className="h-12 border border-gray-100 rounded p-1 bg-white" />
                                          </div>
                                        )}
                                        {expandedGuia.firma_entregador_base64 && (
                                          <div>
                                            <span className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                                              {expandedGuia.tipo_despacho === "directo" ? "Firma del cliente" : "Firma del entregador"}
                                            </span>
                                            <img src={expandedGuia.firma_entregador_base64} alt="Firma" className="h-12 border border-gray-100 rounded p-1 bg-white" />
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
                                  <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-100">
                                    {canEdit && (
                                      <button
                                        onClick={() => onEdit(expandedGuia.id)}
                                        className="text-xs text-gray-500 hover:text-black transition"
                                      >
                                        Editar
                                      </button>
                                    )}
                                    <button
                                      onClick={() => onPrint(expandedGuia.id)}
                                      className="text-xs text-gray-500 hover:text-black transition"
                                    >
                                      Imprimir
                                    </button>
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
                          )}
                        </div>
                      );
                    })}

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
