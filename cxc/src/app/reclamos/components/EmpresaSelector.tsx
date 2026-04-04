"use client";

import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { Reclamo, Contacto } from "./types";
import { EMPRESAS, EC, daysSince, calcSub, buildReclamosPdfHtml, openPdfWindow, FACTOR_TOTAL } from "./constants";
import { SkeletonTable, EmptyState } from "@/components/ui";

interface Props {
  role: string;
  reclamos: Reclamo[];
  loading: boolean;
  contactos: Contacto[];
  globalSearch: string;
  setGlobalSearch: (v: string) => void;
  expandedHistorial: Record<string, boolean>;
  setExpandedHistorial: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  totalPendiente: number;
  pendientes: Reclamo[];
  alertas: number;
  onNewReclamo: () => void;
  onSelectEmpresa: (empresa: string) => void;
  onLoadDetail: (id: string, empresa: string) => void;
}

export default function EmpresaSelector({
  role, reclamos, loading, contactos, globalSearch, setGlobalSearch,
  expandedHistorial, setExpandedHistorial, totalPendiente, pendientes, alertas,
  onNewReclamo, onSelectEmpresa, onLoadDetail,
}: Props) {
  function getC(empresa: string) {
    return contactos.find((c) => c.empresa === empresa) || null;
  }

  async function downloadEmpresaExcel(empresa: string, ev: React.MouseEvent) {
    ev.stopPropagation();
    const ids = reclamos.filter((r) => r.empresa === empresa).map((r) => r.id);
    if (!ids.length) return;
    const res = await fetch("/api/reclamos/export-excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Reclamos-${empresa}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    }
  }

  function downloadEmpresaPdf(empresa: string, ev: React.MouseEvent) {
    ev.stopPropagation();
    const empReclamos = reclamos.filter((r) => r.empresa === empresa);
    if (!empReclamos.length) return;
    openPdfWindow(buildReclamosPdfHtml(empReclamos, empresa));
  }

  return (
    <div>
      <AppHeader module="Reclamos a Proveedores" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-light tracking-tight">Reclamos</h1>
          <button onClick={onNewReclamo} className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 transition">Nuevo Reclamo</button>
        </div>

        {role === "admin" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
            <div className="border border-gray-200 rounded-lg p-4"><div className="text-xs text-gray-400 uppercase tracking-widest">Total Pendiente</div><div className="text-xl font-semibold mt-1 tabular-nums">${fmt(totalPendiente)}</div></div>
            <div className="border border-gray-200 rounded-lg p-4"><div className="text-xs text-gray-400 uppercase tracking-widest">Reclamos Abiertos</div><div className="text-xl font-semibold mt-1">{pendientes.length}</div></div>
            <div className={`border rounded-lg p-4 ${alertas > 0 ? "border-red-200 bg-red-50" : "border-gray-200"}`}><div className="text-xs text-gray-400 uppercase tracking-widest">Alertas +45 días</div><div className={`text-xl font-semibold mt-1 ${alertas > 0 ? "text-red-600" : ""}`}>{alertas}</div></div>
          </div>
        )}

        {/* Global search */}
        <div className="mb-4">
          <input type="text" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Buscar por N° factura, N° reclamo o empresa..." className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition max-w-md" />
        </div>

        {globalSearch.trim() ? (() => {
          const q = globalSearch.toLowerCase();
          const results = reclamos.filter((r) =>
            (r.nro_factura || "").toLowerCase().includes(q) ||
            (r.nro_reclamo || "").toLowerCase().includes(q) ||
            (r.empresa || "").toLowerCase().includes(q) ||
            (r.notas || "").toLowerCase().includes(q)
          );
          return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">{results.length} resultados para &quot;{globalSearch}&quot;</p>
                <button onClick={() => setGlobalSearch("")} className="text-xs text-gray-400 hover:text-black transition">× Limpiar</button>
              </div>
              {results.length === 0 ? <EmptyState title="Sin resultados" subtitle={`No se encontraron resultados para "${globalSearch}"`} /> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-200 text-[10px] uppercase tracking-[0.05em] text-gray-400">
                    <th className="text-left pb-3 font-medium">N° Reclamo</th>
                    <th className="text-left pb-3 font-medium">Empresa</th>
                    <th className="text-left pb-3 font-medium">Factura</th>
                    <th className="text-left pb-3 font-medium">Fecha</th>
                    <th className="text-left pb-3 font-medium">Estado</th>
                    <th className="text-right pb-3 font-medium">Total</th>
                  </tr></thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} onClick={() => onLoadDetail(r.id, r.empresa)} className="border-b border-gray-200 hover:bg-gray-50/80 transition cursor-pointer">
                        <td className="py-3 font-medium text-xs">{r.nro_reclamo}</td>
                        <td className="py-3 text-gray-500">{r.empresa}</td>
                        <td className="py-3 text-gray-500">{r.nro_factura}</td>
                        <td className="py-3 text-gray-500">{fmtDate(r.fecha_reclamo)}</td>
                        <td className="py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full ${EC[r.estado] || "bg-gray-100 text-gray-500"}`}>{r.estado}</span></td>
                        <td className="py-3 text-right tabular-nums">${fmt(calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })() : loading ? (
          <SkeletonTable rows={3} cols={2} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {EMPRESAS.map((empresa) => {
              const ers = reclamos.filter((r) => r.empresa === empresa);
              const open = ers.filter((r) => r.estado !== "Resuelto con NC" && r.estado !== "Rechazado");
              const tot = open.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL, 0);
              const hasAlert = open.some((r) => daysSince(r.fecha_reclamo) > 45);
              const c = getC(empresa);
              return (
                <div key={empresa}
                  onClick={() => onSelectEmpresa(empresa)}
                  className={`border border-gray-200 rounded-lg p-6 cursor-pointer hover:border-gray-300 transition ${open.length === 0 ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-semibold">{empresa}</p>
                    <div className="flex gap-1.5">
                      <button onClick={(ev) => downloadEmpresaPdf(empresa, ev)} title="Descargar todos los reclamos de esta empresa en PDF"
                        className="text-gray-400 hover:text-black transition text-xs border border-gray-200 px-3 py-1 rounded-full flex-shrink-0">↓ PDF</button>
                      <button onClick={(ev) => downloadEmpresaExcel(empresa, ev)} title="Descargar todos los reclamos de esta empresa en Excel"
                        className="text-gray-400 hover:text-black transition text-xs border border-gray-200 px-3 py-1 rounded-full flex-shrink-0">↓ Excel</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-xs text-gray-400">{c?.nombre || "Sin contacto"}</p>
                    {hasAlert && <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-medium border border-red-100">Alerta</span>}
                  </div>
                  <div className="flex gap-6">
                    <div><p className="text-2xl font-semibold tabular-nums">{open.length}</p><p className="text-xs text-gray-400 mt-0.5">facturas</p></div>
                    <div><p className="text-2xl font-semibold tabular-nums">${fmt(tot)}</p><p className="text-xs text-gray-400 mt-0.5">pendiente</p></div>
                  </div>
                  {/* Historial */}
                  {ers.length > 0 && (
                    <div className="mt-4 border-t border-gray-200 pt-3" onClick={(ev) => ev.stopPropagation()}>
                      <button
                        onClick={() => setExpandedHistorial((p) => ({ ...p, [empresa]: !p[empresa] }))}
                        className="text-[11px] text-gray-400 hover:text-black transition flex items-center gap-1 w-full">
                        <span className="transition-transform" style={{ display: "inline-block", transform: expandedHistorial[empresa] ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                        Historial ({ers.length})
                      </button>
                      {expandedHistorial[empresa] && (
                        <div className="mt-2 space-y-1.5">
                          {ers.slice(0, 5).map((r) => (
                            <div key={r.id}
                              onClick={() => onLoadDetail(r.id, empresa)}
                              className="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg hover:bg-gray-50 cursor-pointer transition">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-700">{r.nro_reclamo}</span>
                                <span className="text-gray-400">{fmtDate(r.fecha_reclamo)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded-full ${EC[r.estado] || "bg-gray-100 text-gray-500"}`}>{r.estado}</span>
                                <span className="tabular-nums text-gray-500">${fmt(calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL)}</span>
                              </div>
                            </div>
                          ))}
                          {ers.length > 5 && (
                            <button onClick={() => onSelectEmpresa(empresa)} className="text-[11px] text-gray-400 hover:text-black transition mt-1 block">Ver todos &rarr;</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
