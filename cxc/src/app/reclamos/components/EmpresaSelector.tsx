"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { Reclamo, Contacto } from "./types";
import { EMPRESAS, EC, daysSince, calcSub, reclamoTaxes } from "./constants";
import { matchReclamo, matchHint } from "./search";
import { SkeletonTable, EmptyState, Toast } from "@/components/ui";

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
  const [excelBusy, setExcelBusy] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  function getC(empresa: string) {
    return contactos.find((c) => c.empresa === empresa) || null;
  }

  async function downloadEmpresaExcel(empresa: string, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (excelBusy) return;
    const ids = reclamos.filter((r) => r.empresa === empresa).map((r) => r.id);
    if (!ids.length) return;
    setExcelBusy(empresa);
    try {
      const res = await fetch(`/api/reclamos/proveedor/${encodeURIComponent(empresa)}/export-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reclamo_ids: ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al generar el Excel.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reclamos-${empresa}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Excel de ${empresa} descargado`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al generar el Excel");
    } finally {
      setExcelBusy(null);
    }
  }

  async function downloadEmpresaPdf(empresa: string, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (pdfBusy) return;
    const ids = reclamos.filter((r) => r.empresa === empresa).map((r) => r.id);
    if (!ids.length) return;
    setPdfBusy(empresa);
    try {
      const res = await fetch(`/api/reclamos/proveedor/${encodeURIComponent(empresa)}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reclamo_ids: ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al generar el PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reclamos-${empresa}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`PDF de ${empresa} descargado`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al generar el PDF");
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <div>
      <AppHeader module="Reclamos" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-light tracking-tight">Reclamos</h1>
          </div>
          <button onClick={onNewReclamo} className="text-sm bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all">Nuevo Reclamo</button>
        </div>

        {(role === "admin" || role === "secretaria") && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
            <div className="border border-gray-200 rounded-lg p-4"><div className="text-xs text-gray-400 uppercase tracking-widest">Total Pendiente</div><div className="text-xl font-semibold mt-1 tabular-nums">${fmt(totalPendiente)}</div></div>
            <div className="border border-gray-200 rounded-lg p-4"><div className="text-xs text-gray-400 uppercase tracking-widest">Abiertos</div><div className="text-xl font-semibold mt-1">{pendientes.length}</div></div>
            <div className={`border rounded-lg p-4 ${alertas > 0 ? "border-red-200 bg-red-50" : "border-gray-200"}`}><div className="text-xs text-gray-400 uppercase tracking-widest">Alertas +45 días</div><div className={`text-xl font-semibold mt-1 ${alertas > 0 ? "text-red-600" : ""}`}>{alertas}</div></div>
          </div>
        )}

        {/* Global search */}
        <div className="mb-4">
          <input type="text" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Buscar por N° factura, N° reclamo, código de ítem o empresa…" className="w-full border-b border-gray-200 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition max-w-md" />
        </div>

        {globalSearch.trim() ? (() => {
          const q = globalSearch.toLowerCase();
          // matchReclamo cubre N° reclamo, factura (header + ítems) y código de
          // ítem; empresa y notas se mantienen como campos extra de esta lista.
          const results = reclamos
            .map((r) => ({ r, via: matchReclamo(r, globalSearch) }))
            .filter(({ r, via }) =>
              via !== null ||
              (r.empresa || "").toLowerCase().includes(q) ||
              (r.notas || "").toLowerCase().includes(q)
            );
          return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">{results.length} resultados para &quot;{globalSearch}&quot;</p>
                <button onClick={() => setGlobalSearch("")} className="text-xs text-gray-400 hover:text-black transition">× Limpiar</button>
              </div>
              {results.length === 0 ? <EmptyState title="No encontramos nada" subtitle={`Intenta con otro termino en vez de "${globalSearch}"`} /> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-400">
                    <th className="text-left pb-3 font-medium">N° Reclamo</th>
                    <th className="text-left pb-3 font-medium">Empresa</th>
                    <th className="text-left pb-3 font-medium">Factura</th>
                    <th className="text-left pb-3 font-medium">Fecha</th>
                    <th className="text-left pb-3 font-medium">Estado</th>
                    <th className="text-right pb-3 font-medium">Total</th>
                  </tr></thead>
                  <tbody>
                    {results.map(({ r, via }) => (
                      <tr key={r.id} onClick={() => onLoadDetail(r.id, r.empresa)} className="border-b border-gray-200 hover:bg-gray-50/80 transition cursor-pointer">
                        <td className="py-3 font-medium text-xs">
                          {r.nro_reclamo}
                          {matchHint(r, via) && <span className="block font-normal text-xs text-gray-400 mt-0.5">{matchHint(r, via)}</span>}
                        </td>
                        <td className="py-3 text-gray-500">{r.empresa}</td>
                        <td className="py-3 text-gray-500">{r.nro_factura}</td>
                        <td className="py-3 text-gray-500">{fmtDate(r.fecha_reclamo)}</td>
                        <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${EC[r.estado] || "bg-gray-100 text-gray-500"}`}>{r.estado}</span></td>
                        <td className="py-3 text-right tabular-nums">${fmt(reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total)}</td>
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
              const open = ers.filter((r) => r.estado !== "Pagado");
              const tot = open.reduce((s, r) => s + reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total, 0);
              const hasAlert = open.some((r) => daysSince(r.fecha_reclamo) > 45);
              const c = getC(empresa);
              return (
                <div key={empresa}
                  onClick={() => onSelectEmpresa(empresa)}
                  className={`border border-gray-200 rounded-lg p-6 cursor-pointer hover:border-gray-300 transition ${open.length === 0 ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-semibold">{empresa}</p>
                    {/* 36px de alto y 6px de separación: dos targets chicos y
                        pegados, ×10 empresas. A 44px de alto y gap-2 (8px). */}
                    <div className="flex gap-2 flex-wrap justify-end">
                      <button onClick={(ev) => downloadEmpresaExcel(empresa, ev)} disabled={excelBusy !== null} title="Descargar Excel con links a las facturas y fotos (abren con un clic)"
                        className="text-gray-600 hover:text-black hover:border-gray-400 transition text-xs border border-gray-300 px-4 min-h-[44px] rounded-full flex-shrink-0 font-medium disabled:opacity-40">{excelBusy === empresa ? "Excel…" : "↓ Excel"}</button>
                      <button onClick={(ev) => downloadEmpresaPdf(empresa, ev)} disabled={pdfBusy !== null} title="Descargar PDF consolidado del proveedor (resumen + detalle por reclamo con fotos)"
                        className="text-gray-600 hover:text-black hover:border-gray-400 transition text-xs border border-gray-300 px-4 min-h-[44px] rounded-full flex-shrink-0 font-medium disabled:opacity-40">{pdfBusy === empresa ? "PDF…" : "↓ PDF"}</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-xs text-gray-400">{c?.nombre || "Sin contacto"}</p>
                    {hasAlert && <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-medium border border-red-100">Alerta</span>}
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
                        className="text-xs text-gray-400 hover:text-black transition flex items-center gap-1 w-full min-h-[44px]">
                        <span className="transition-transform" style={{ display: "inline-block", transform: expandedHistorial[empresa] ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                        Historial ({ers.length})
                      </button>
                      {expandedHistorial[empresa] && (
                        <div className="mt-2 space-y-1.5">
                          {ers.slice(0, 5).map((r) => (
                            <div key={r.id}
                              onClick={() => onLoadDetail(r.id, empresa)}
                              className="flex items-center justify-between gap-2 text-xs min-h-[44px] py-1 px-2 rounded-lg hover:bg-gray-50 cursor-pointer transition">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-700">{r.nro_reclamo}</span>
                                <span className="text-gray-400">{fmtDate(r.fecha_reclamo)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded-full ${EC[r.estado] || "bg-gray-100 text-gray-500"}`}>{r.estado}</span>
                                <span className="tabular-nums text-gray-500">${fmt(reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total)}</span>
                              </div>
                            </div>
                          ))}
                          {ers.length > 5 && (
                            <button onClick={() => onSelectEmpresa(empresa)} className="text-xs text-gray-400 hover:text-black transition mt-1 flex items-center min-h-[44px] px-2">Ver todos &rarr;</button>
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
      <Toast message={toast} />
    </div>
  );
}
