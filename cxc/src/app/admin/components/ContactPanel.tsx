"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Company } from "@/lib/companies";
import { COMPANIES } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt } from "@/lib/format";

type InvoiceRow = { company_key: string; codigo: string; nombre: string; d0_30: number; d31_60: number; d61_90: number; d91_120: number; d121_180: number; d181_270: number; d271_365: number; mas_365: number; total: number };

interface Props {
  client: ConsolidatedClient;
  onOpenWhatsApp: (client: ConsolidatedClient) => void;
  onCopyCollectionMsg: (client: ConsolidatedClient) => void;
  onOpenEmail: (client: ConsolidatedClient) => void;
  onSaveEdit: (nombre: string, data: { correo: string; telefono: string; celular: string; contacto: string }) => void;
  companyFilter: string;
  roleCompanies: Company[];
}

export default function ContactPanel({
  client,
  onOpenWhatsApp,
  onCopyCollectionMsg,
  onOpenEmail,
  onSaveEdit,
  companyFilter,
  roleCompanies,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ correo: "", telefono: "", celular: "", contacto: "" });
  const [copied, setCopied] = useState<string | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [desgloseOpen, setDesgloseOpen] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const editDataRef = useRef(editData);
  editDataRef.current = editData;

  // FIX 9: Invoices fetched on demand
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchInvoices() {
      setInvoicesLoading(true);
      try {
        const res = await fetch(`/api/cxc-rows?name=${encodeURIComponent(client.nombre_normalized)}`);
        if (!cancelled) {
          const data = await res.json();
          setInvoices(data || []);
        }
      } catch { /* */ }
      if (!cancelled) setInvoicesLoading(false);
    }
    fetchInvoices();
    return () => { cancelled = true; };
  }, [client.nombre_normalized]);

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

      {/* ── Quick actions (WhatsApp primary + kebab for Email/Copiar) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onOpenWhatsApp(client); }}
          className="flex items-center gap-2 text-xs border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-50 transition font-medium min-h-[36px]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </button>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setActionsMenuOpen(!actionsMenuOpen); }}
            className="flex items-center justify-center text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 px-3 rounded-lg transition font-medium min-h-[36px] min-w-[36px]"
            aria-label="Más acciones"
            aria-haspopup="menu"
            aria-expanded={actionsMenuOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
          </button>
          {actionsMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setActionsMenuOpen(false); }} />
              <div className="absolute left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px] py-1" onClick={(e) => e.stopPropagation()} role="menu">
                <button
                  onClick={(e) => { e.stopPropagation(); setActionsMenuOpen(false); onOpenEmail(client); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  role="menuitem"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Email
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setActionsMenuOpen(false); onCopyCollectionMsg(client); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  role="menuitem"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar mensaje
                </button>
              </div>
            </>
          )}
        </div>
      </div>

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
                  <th className="text-right py-1.5 font-medium text-emerald-600">0-90d</th>
                  <th className="text-right py-1.5 font-medium text-amber-600">91-120d</th>
                  <th className="text-right py-1.5 font-medium text-red-500">121d+</th>
                  <th className="text-right py-1.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleCompanies.map((co) => {
                  const d = client.companies[co.key];
                  const current = d.d0_30 + d.d31_60 + d.d61_90;
                  const watch = d.d91_120;
                  const overdue = d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
                  return (
                    <tr key={co.key} className="border-t border-gray-200 hover:bg-white transition">
                      {roleCompanies.length > 1 && <td className="py-1.5 font-medium">{co.name}</td>}
                      <td className="text-right py-1.5 tabular-nums text-emerald-700">{fmt(current)}</td>
                      <td className="text-right py-1.5 tabular-nums text-amber-600">{fmt(watch)}</td>
                      <td className="text-right py-1.5 tabular-nums text-red-600">{fmt(overdue)}</td>
                      <td className="text-right py-1.5 tabular-nums font-semibold">{fmt(d.total)}</td>
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
                  <input className={`border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 w-full ${phoneWarning(editData.celular) ? "border-red-300" : "border-gray-200"}`} placeholder="WhatsApp / Celular"
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

          {/* ── Facturas pendientes ────────────────────────── */}
          <div>
            <button
              onClick={() => setInvoicesOpen(!invoicesOpen)}
              className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 hover:text-gray-700 transition"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${invoicesOpen ? "rotate-90" : ""}`} fill="currentColor"><path d="M3 1l5 4-5 4V1z"/></svg>
              Facturas pendientes {invoicesLoading ? "(cargando...)" : `(${invoices.length})`}
            </button>
            {invoicesOpen && (
              invoicesLoading ? (
                <div className="text-xs text-gray-400 py-2">Cargando facturas...</div>
              ) : invoices.length === 0 ? (
                <div className="text-xs text-gray-400 py-2">Sin facturas encontradas.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
                        <th className="text-left py-1.5 font-medium">Empresa</th>
                        <th className="text-right py-1.5 font-medium">0-90d</th>
                        <th className="text-right py-1.5 font-medium text-amber-600">91-120d</th>
                        <th className="text-right py-1.5 font-medium text-red-500">121d+</th>
                        <th className="text-right py-1.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv, i) => {
                        const current = (inv.d0_30 || 0) + (inv.d31_60 || 0) + (inv.d61_90 || 0);
                        const watch = inv.d91_120 || 0;
                        const overdue = (inv.d121_180 || 0) + (inv.d181_270 || 0) + (inv.d271_365 || 0) + (inv.mas_365 || 0);
                        const totalColor = overdue > 0 ? "text-red-600" : watch > 0 ? "text-amber-600" : "text-emerald-600";
                        return (
                          <tr key={i} className="border-t border-gray-200 hover:bg-white transition">
                            <td className="py-1.5 font-medium">{COMPANIES.find(c => c.key === inv.company_key)?.name ?? inv.company_key}</td>
                            <td className="text-right py-1.5 tabular-nums">{fmt(current)}</td>
                            <td className="text-right py-1.5 tabular-nums text-amber-600">{fmt(watch)}</td>
                            <td className="text-right py-1.5 tabular-nums text-red-600">{fmt(overdue)}</td>
                            <td className={`text-right py-1.5 tabular-nums font-semibold ${totalColor}`}>{fmt(inv.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* ── Nota interna ───────────────────────────────── */}
          <ClientNote clientName={client.nombre_normalized} />
        </>
      )}
    </div>
  );
}

function ClientNote({ clientName }: { clientName: string }) {
  const [note, setNote] = useState("");
  const [focused, setFocused] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem("fg_client_notes") || "{}");
      setNote(all[clientName]?.text || all[clientName] || "");
      setSavedAt(all[clientName]?.ts || null);
    } catch { /* */ }
  }, [clientName]);
  function save() {
    const now = Date.now();
    try { const all = JSON.parse(localStorage.getItem("fg_client_notes") || "{}"); all[clientName] = { text: note, ts: now }; localStorage.setItem("fg_client_notes", JSON.stringify(all)); } catch { /* */ }
    setSavedAt(now);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  }
  const agoMin = savedAt ? Math.floor((Date.now() - savedAt) / 60000) : null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5 font-medium flex items-center gap-1.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Nota interna
        {showSaved && <span className="text-green-600 normal-case tracking-normal font-normal ml-1">Nota guardada</span>}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); save(); }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}
        placeholder="Ej: Acuerdo de pago, cliente VIP..." rows={1}
        className="w-full border border-gray-200 rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-gray-300 resize-none text-gray-600 placeholder:text-gray-300" />
      <div className="flex items-center gap-2 mt-0.5">
        {focused && <span className="text-[10px] text-gray-300">Presiona Enter para guardar</span>}
        {savedAt && agoMin !== null && <span className="text-[10px] text-gray-300 ml-auto">Guardado {agoMin < 1 ? "ahora" : `hace ${agoMin} min`}</span>}
      </div>
    </div>
  );
}
