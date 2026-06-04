"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtDate } from "@/lib/format";

interface Props {
  client: ConsolidatedClient;
  onSaveEdit: (nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) => void;
  companyFilter: string;
  roleCompanies: Company[];
}

export default function ContactPanel({
  client,
  onSaveEdit,
  companyFilter,
  roleCompanies,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ correo: "", telefono: "", celular: "", contacto: "" });
  const [copied, setCopied] = useState<string | null>(null);
  const [desgloseOpen, setDesgloseOpen] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const editDataRef = useRef(editData);
  editDataRef.current = editData;

  function startEdit() {
    setEditing(true);
    setEditData({
      correo: client.correo, telefono: client.telefono,
      celular: client.celular, contacto: client.contacto,
    });
    setAutoSaveStatus("idle");
  }

  // FIX 10: Auto-save with debounce
  const doAutoSave = useCallback(() => {
    setAutoSaveStatus("saving");
    onSaveEdit(client.nombre_normalized, editDataRef.current);
    setAutoSaveStatus("saved");
    setTimeout(() => setAutoSaveStatus((s) => s === "saved" ? "idle" : s), 2000);
  }, [client.nombre_normalized, onSaveEdit]);

  useEffect(() => {
    if (!editing) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doAutoSave();
    }, 2000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [editData, editing, doAutoSave]);

  // CAMBIO 7: Phone validation helper
  function phoneWarning(v: string) {
    const digits = (v || "").replace(/[^0-9]/g, "");
    return digits.length > 0 && digits.length < 7;
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
  }

  const visibleCompanies = companyFilter !== "all"
    ? roleCompanies.filter((co) => co.key === companyFilter && client.companies[co.key])
    : roleCompanies.filter((co) => client.companies[co.key]);

  return (
    <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200 space-y-3">

      {/* ═══ LEVEL 1: Always visible when expanded ═══ */}

      {/* ── Company breakdown table (expanded by default) ──── */}
      {visibleCompanies.length > 0 && (
        <div>
          <button
            onClick={() => setDesgloseOpen(!desgloseOpen)}
            className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 hover:text-gray-700 transition"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${desgloseOpen ? "rotate-90" : ""}`} fill="currentColor"><path d="M3 1l5 4-5 4V1z"/></svg>
            {roleCompanies.length === 1 || companyFilter !== "all" ? "Detalle de aging" : `Desglose por empresa (${visibleCompanies.length})`}
          </button>
          {desgloseOpen && (
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
                  {roleCompanies.length > 1 && <th className="text-left py-1.5 font-medium">Empresa</th>}
                  <th className="text-right py-1.5 font-medium text-emerald-600" title="0-30 + 31-60 + 61-90 días">Por vencer</th>
                  <th className="text-right py-1.5 font-medium text-amber-600" title="91-120 días">Vencido reciente</th>
                  <th className="text-right py-1.5 font-medium text-red-500" title="121-180 + 181-270 + 271-365 + +365 días">Vencido crítico</th>
                  <th className="text-right py-1.5 font-medium">Total</th>
                  <th className="text-right py-1.5 font-medium" title="Cobro real más reciente del cliente en esta empresa (excluye retenciones)">Último pago</th>
                </tr>
              </thead>
              <tbody>
                {visibleCompanies.map((co) => {
                  const d = client.companies[co.key];
                  const current = d.d0_30 + d.d31_60 + d.d61_90;
                  const watch = d.d91_120;
                  const overdue = d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
                  // Tooltips con el desglose de los 8 buckets originales
                  // (presentación agrupada en 3, detalle disponible al hover).
                  const tipCurrent = `0-30: $${fmt(d.d0_30)} · 31-60: $${fmt(d.d31_60)} · 61-90: $${fmt(d.d61_90)}`;
                  const tipOverdue = `121-180: $${fmt(d.d121_180)} · 181-270: $${fmt(d.d181_270)} · 271-365: $${fmt(d.d271_365)} · +365: $${fmt(d.mas_365)}`;
                  return (
                    <tr key={co.key} className="border-t border-gray-200 hover:bg-white transition">
                      {roleCompanies.length > 1 && <td className="py-1.5 font-medium">{co.name}</td>}
                      <td className="text-right py-1.5 tabular-nums text-emerald-700 cursor-help" title={tipCurrent}>{fmt(current)}</td>
                      <td className="text-right py-1.5 tabular-nums text-amber-600 cursor-help" title="91-120 días">{fmt(watch)}</td>
                      <td className="text-right py-1.5 tabular-nums text-red-600 cursor-help" title={tipOverdue}>{fmt(overdue)}</td>
                      <td className="text-right py-1.5 tabular-nums font-semibold">{fmt(d.total)}</td>
                      <td className="text-right py-1.5 tabular-nums text-gray-500 whitespace-nowrap">
                        {d.ultimoPagoFecha
                          ? `${fmtDate(d.ultimoPagoFecha)}${d.ultimoPagoMonto != null ? ` · $${fmt(d.ultimoPagoMonto)}` : ""}`
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* ── "Ver detalle completo" toggle ──────────────────── */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium transition"
      >
        {showDetail ? "Ocultar detalle \u2039" : "Ver detalle completo \u203A"}
      </button>

      {/* ═══ LEVEL 2: Hidden until "Ver detalle completo" ═══ */}
      {showDetail && (
        <>
          {/* ── Datos de contacto (editable form) ──────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Datos de contacto
              </span>
              {!editing && (
                <button onClick={(e) => { e.stopPropagation(); startEdit(); }}
                  className="text-[11px] text-gray-400 hover:text-gray-700 transition flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Editar
                </button>
              )}
            </div>

            {editing ? (
              <div className="grid grid-cols-2 gap-2 max-w-lg" onClick={(e) => e.stopPropagation()}>
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="Correo"
                  value={editData.correo} onChange={(e) => setEditData({ ...editData, correo: e.target.value })} />
                <div>
                  <input className={`border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 w-full ${phoneWarning(editData.telefono) ? "border-red-300" : "border-gray-200"}`} placeholder="Telefono"
                    value={editData.telefono} onChange={(e) => setEditData({ ...editData, telefono: e.target.value })} />
                  {phoneWarning(editData.telefono) && <span className="text-[10px] text-red-500">Numero incompleto</span>}
                </div>
                <div>
                  <input className={`border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 w-full ${phoneWarning(editData.celular) ? "border-red-300" : "border-gray-200"}`} placeholder="Celular"
                    value={editData.celular} onChange={(e) => setEditData({ ...editData, celular: e.target.value })} />
                  {phoneWarning(editData.celular) && <span className="text-[10px] text-red-500">Numero incompleto</span>}
                </div>
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="Nombre contacto"
                  value={editData.contacto} onChange={(e) => setEditData({ ...editData, contacto: e.target.value })} />
                <div className="col-span-2 flex gap-2 mt-1 items-center">
                  <button onClick={() => { if (debounceRef.current) { clearTimeout(debounceRef.current); doAutoSave(); } setEditing(false); }} className="text-xs text-gray-500 hover:text-black transition">Cerrar edicion</button>
                  {autoSaveStatus === "saved" && <span className="text-[10px] text-green-600 transition">Listo, guardado</span>}
                  {autoSaveStatus === "saving" && <span className="text-[10px] text-gray-400 transition">Guardando...</span>}
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-600 space-y-1">
                {client.contacto && <div className="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{client.contacto}</div>}
                {client.correo && (
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {client.correo}
                    <button onClick={(e) => { e.stopPropagation(); copyEmail(client.correo); }}
                      className="text-[10px] text-gray-400 hover:text-gray-600 transition">
                      {copied === client.correo ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                )}
                {client.telefono && <div className="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Tel: {client.telefono}</div>}
                {client.celular && <div className="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>Cel: {client.celular}</div>}
                {!client.contacto && !client.correo && !client.telefono && !client.celular && (
                  <div className="text-gray-400 italic">Sin informacion de contacto — <button onClick={(e) => { e.stopPropagation(); startEdit(); }} className="underline hover:text-gray-600">agregar</button></div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
