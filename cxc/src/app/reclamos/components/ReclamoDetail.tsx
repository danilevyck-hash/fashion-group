"use client";

import { useRef, useState, useMemo } from "react";
import { fmt, fmtDate } from "@/lib/format";
import { Toast, StatusBadge, ConfirmDeleteModal, FotoLightbox, ScrollableTable } from "@/components/ui";
import { Reclamo, RItem, Contacto } from "./types";
import { ESTADOS, EMPRESAS, EC, TALLAS, DEFAULT_MOTIVOS, emptyItem, daysSince, calcSub, buildSingleReclamoPdfHtml, openPdfWindow, loadCustomMotivos, saveCustomMotivo, TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL, estadoLabel } from "./constants";
import { useSmartSuggestions, type SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";
import SuggestionCard from "@/components/SuggestionCard";

const VALID_TRANSITIONS: Record<string, string[]> = {
  "Borrador": ["Enviado"],
  "Enviado": ["Confirmado"],
  "Confirmado": ["Aplicado", "Rechazado"],
  "Aplicado": [],
  "Rechazado": ["Borrador"],
};

interface Props {
  current: Reclamo;
  role: string;
  contactos: Contacto[];
  nota: string;
  setNota: (v: string) => void;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  editEmpresa: string;
  setEditEmpresa: (v: string) => void;
  editFactura: string;
  setEditFactura: (v: string) => void;
  editPedido: string;
  setEditPedido: (v: string) => void;
  editFecha: string;
  setEditFecha: (v: string) => void;
  editNotas: string;
  setEditNotas: (v: string) => void;
  editEstado: string;
  setEditEstado: (v: string) => void;
  editItems: RItem[];
  setEditItems: React.Dispatch<React.SetStateAction<RItem[]>>;
  editSaving: boolean;
  confirmingEstado: string | null;
  setConfirmingEstado: (v: string | null) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (v: boolean) => void;
  showAplicadaModal: boolean;
  setShowAplicadaModal: (v: boolean) => void;
  aplicadaNc: string;
  setAplicadaNc: (v: string) => void;
  aplicadaMonto: string;
  setAplicadaMonto: (v: string) => void;
  toast: string | null;
  customMotivos: string[];
  setCustomMotivos: React.Dispatch<React.SetStateAction<string[]>>;
  addingEditMotivo: number | null;
  setAddingEditMotivo: (v: number | null) => void;
  newMotivoText: string;
  setNewMotivoText: (v: string) => void;
  onBack: () => void;
  onAddNota: () => void;
  onChangeEstado: (e: string) => void;
  onDeleteReclamo: (id: string) => void;
  onSaveEdit: () => void;
  onUploadFoto: (file: File) => void;
  onDeleteFoto: (fotoId: string, path: string) => void;
  onAplicadaConfirm: () => void;
  showToast: (msg: string) => void;
}

const SUPA_URL = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_SUPABASE_URL || "") : "";

export default function ReclamoDetail({
  current, role, contactos, nota, setNota, editMode, setEditMode,
  editEmpresa, setEditEmpresa, editFactura, setEditFactura, editPedido, setEditPedido,
  editFecha, setEditFecha, editNotas, setEditNotas, editEstado, setEditEstado,
  editItems, setEditItems, editSaving, confirmingEstado, setConfirmingEstado,
  showDeleteConfirm, setShowDeleteConfirm, showAplicadaModal, setShowAplicadaModal,
  aplicadaNc, setAplicadaNc, aplicadaMonto, setAplicadaMonto, toast,
  customMotivos, setCustomMotivos, addingEditMotivo, setAddingEditMotivo,
  newMotivoText, setNewMotivoText, onBack, onAddNota, onChangeEstado,
  onDeleteReclamo, onSaveEdit, onUploadFoto, onDeleteFoto, onAplicadaConfirm,
  showToast,
}: Props) {
  const fotoRef = useRef<HTMLInputElement>(null);
  const MOTIVOS = [...DEFAULT_MOTIVOS, ...customMotivos];
  const [deleteFotoTarget, setDeleteFotoTarget] = useState<{ id: string; path: string } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [showEstadoHelp, setShowEstadoHelp] = useState(false);

  async function sendEmail() {
    const c = getC(current.empresa);
    if (!c?.correo) {
      showToast(`No hay contacto con email para ${current.empresa}. Agrega un contacto primero.`);
      setShowEmailConfirm(false);
      return;
    }
    setShowEmailConfirm(false);
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/reclamos/${current.id}/send-email`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }
      showToast("Email enviado al proveedor");
    } catch (err) {
      console.error("Send email error:", err);
      showToast("Error al enviar el email");
    } finally {
      setSendingEmail(false);
    }
  }

  const items = current.reclamo_items ?? [];
  const seg = current.reclamo_seguimiento ?? [];
  const fotos = current.reclamo_fotos ?? [];
  const sub = calcSub(items);
  const days = daysSince(current.fecha_reclamo);

  // ── Smart suggestion: escalation ──
  const reclamoSuggestions = useMemo<SmartSuggestion[]>(() => {
    if (days <= 45 || current.estado !== "Enviado") return [];
    return [{
      id: `reclamo-escalate-${current.id}`,
      message: `Este reclamo lleva ${days} días. ¿Cambiar a 'Confirmado' para avanzar?`,
      actionLabel: "Marcar como Confirmado",
      onAction: () => onChangeEstado("Confirmado"),
    }];
  }, [current.id, current.estado, days, onChangeEstado]);

  const { suggestion: reclamoSuggestion, dismiss: dismissReclamo } = useSmartSuggestions(reclamoSuggestions);

  function getC(empresa: string) {
    return contactos.find((c) => c.empresa === empresa) || null;
  }

  function startEdit() {
    setEditEmpresa(current.empresa);
    setEditFactura(current.nro_factura || "");
    setEditPedido(current.nro_orden_compra || "");
    setEditFecha(current.fecha_reclamo || "");
    setEditNotas(current.notas || "");
    setEditEstado(current.estado || "");
    setEditItems((current.reclamo_items || []).map((i) => ({ ...i })));
    setEditMode(true);
  }

  function updateEditItem(idx: number, field: string, val: string | number) {
    setEditItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: val };
      u.subtotal = (Number(u.cantidad) || 0) * (Number(u.precio_unitario) || 0);
      return u;
    }));
  }

  function sendWA() {
    const c = getC(current.empresa);
    if (!c?.whatsapp) { showToast("No hay contacto WhatsApp para esta empresa."); return; }
    const nombre = c.nombre_contacto || c.nombre || "equipo";
    const total = calcSub(current.reclamo_items ?? []) * FACTOR_TOTAL;
    const msg = `Hola ${nombre}, te escribo de parte de Fashion Group para dar seguimiento al reclamo ${current.nro_reclamo}.\n\nFactura: ${current.nro_factura}\nTotal a acreditar: $${fmt(total)}\nEstado: ${current.estado}\nFecha: ${fmtDate(current.fecha_reclamo)}\n\n¿Nos puedes confirmar el estado? Gracias.`;
    try { window.open(`https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank"); } catch { showToast("No se pudo abrir WhatsApp"); }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
        <button onClick={onBack} className="hover:text-black transition">Reclamos</button>
        <span className="text-gray-300">/</span>
        <span className="hover:text-black transition cursor-default">{current.empresa}</span>
        <span className="text-gray-300">/</span>
        <span className="text-gray-600 font-medium">{current.nro_reclamo}</span>
      </nav>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-light tracking-tight">{current.nro_reclamo}</h1>
          <p className="text-sm text-gray-400 mt-1">{current.empresa} — {current.marca} — {current.proveedor}</p>
          <p className="text-sm text-gray-400">Factura: {current.nro_factura}{current.nro_orden_compra ? ` | PO: ${current.nro_orden_compra}` : ""}</p>
          <p className="text-sm text-gray-400">{fmtDate(current.fecha_reclamo)} — {days} días</p>
        </div>
        <StatusBadge estado={current.estado} />
      </div>

      {reclamoSuggestion && <SuggestionCard suggestion={reclamoSuggestion} onDismiss={dismissReclamo} />}

      {/* Action bar */}
      <div className="flex items-center gap-2 mb-6 flex-wrap overflow-x-auto pb-1">
        <button onClick={startEdit} className="text-xs border border-gray-200 px-3 py-2.5 sm:py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 active:bg-gray-100 transition-all flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
          Editar
        </button>
        <div className="relative">
          <button onClick={() => setShowEmailConfirm(!showEmailConfirm)} disabled={sendingEmail} className="text-xs bg-black text-white px-4 py-2.5 sm:py-1.5 rounded-full hover:bg-gray-800 active:scale-[0.97] transition-all flex items-center gap-1 disabled:opacity-50">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
            {sendingEmail ? "Enviando..." : "Enviar por Email"}
          </button>
          {showEmailConfirm && (() => { const c = getC(current.empresa); return (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-10" style={{ minWidth: 220 }}>
              {c?.correo ? (<>
                <p className="text-xs text-gray-500 mb-2">Enviar a <strong>{c.correo}</strong>?</p>
                <div className="flex gap-1">
                  <button onClick={sendEmail} className="text-[11px] bg-black text-white px-3 py-1 rounded-full hover:bg-gray-800 active:scale-[0.97] transition-all">Enviar</button>
                  <button onClick={() => setShowEmailConfirm(false)} className="text-[11px] text-gray-400 px-2 py-1 hover:text-black transition">Cancelar</button>
                </div>
              </>) : (<>
                <p className="text-xs text-red-500 mb-2">No hay correo configurado para {current.empresa}</p>
                <button onClick={() => setShowEmailConfirm(false)} className="text-[11px] text-gray-400 px-2 py-1 hover:text-black transition">Cerrar</button>
              </>)}
            </div>
          ); })()}
        </div>
        <button onClick={sendWA} className="text-xs border border-gray-200 px-3 py-2.5 sm:py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 active:bg-gray-100 transition-all flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
          WhatsApp
        </button>
        <button onClick={() => openPdfWindow(buildSingleReclamoPdfHtml(current, fotos))} className="text-xs border border-gray-200 px-3 py-2.5 sm:py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /><rect x="6" y="2" width="12" height="4" rx="1" /><path d="M4 18h16" /></svg>
          Imprimir
        </button>
        <button onClick={() => window.open(`/api/reclamos/${current.id}/excel`)} className="text-xs border border-gray-200 px-3 py-2.5 sm:py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          Excel
        </button>
        {(role === "admin" || role === "secretaria") && (
          <button onClick={() => setShowDeleteConfirm(true)} className="text-xs text-red-300 hover:text-red-600 transition ml-auto">Eliminar Reclamo</button>
        )}
      </div>

      {/* Enviar button for Borrador */}
      {current.estado === "Borrador" && (
        <button onClick={() => onChangeEstado("Enviado")} className="mb-6 bg-black text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          Enviar Reclamo
        </button>
      )}

      {/* Estado buttons */}
      <div className="flex items-center gap-1 mb-2 flex-wrap gap-y-2">
        {ESTADOS.map((e) => {
          const isCurrent = current.estado === e;
          const allowedNext = VALID_TRANSITIONS[current.estado] || [];
          const canTransition = allowedNext.includes(e);
          return (
            <div key={e} className="relative">
              <button
                onClick={() => { if (!isCurrent && canTransition) setConfirmingEstado(confirmingEstado === e ? null : e); }}
                disabled={!isCurrent && !canTransition}
                className={`h-11 sm:h-8 text-xs text-center transition px-4 py-2 rounded-md ${isCurrent ? `${EC[e] || "bg-gray-100 text-gray-500"} ring-1 ring-current font-medium` : canTransition ? "bg-gray-100 text-gray-400 hover:bg-gray-200" : "bg-gray-50 text-gray-300 cursor-not-allowed"}`}>
                {estadoLabel(e)}
              </button>
              {confirmingEstado === e && !isCurrent && canTransition && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 text-center" style={{ minWidth: 140 }}>
                  <p className="text-[11px] text-gray-500 mb-1.5">Cambiar a {estadoLabel(e)}?</p>
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => { if (e === "Aplicado") { setShowAplicadaModal(true); setConfirmingEstado(null); } else onChangeEstado(e); }} className="text-[11px] bg-black text-white px-3 py-1 rounded-full hover:bg-gray-800 active:scale-[0.97] transition-all">Si</button>
                    <button onClick={() => setConfirmingEstado(null)} className="text-[11px] text-gray-400 px-2 py-1 hover:text-black transition">No</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* Info icon — estado help */}
        <div className="relative">
          <button onClick={() => setShowEstadoHelp(!showEstadoHelp)} className="w-7 h-7 sm:w-6 sm:h-6 rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-400 flex items-center justify-center text-xs transition ml-1" title="Significado de cada estado">?</button>
          {showEstadoHelp && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-20" style={{ minWidth: 280 }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">Estados del reclamo</span>
                <button onClick={() => setShowEstadoHelp(false)} className="text-gray-300 hover:text-black text-sm leading-none">x</button>
              </div>
              <div className="space-y-1.5 text-[11px] text-gray-500">
                <div><span className="font-medium text-gray-700">Borrador</span> — Reclamo creado en la oficina</div>
                <div><span className="font-medium text-gray-700">Enviado</span> — Enviado al encargado/proveedor</div>
                <div><span className="font-medium text-gray-700">Confirmado</span> — Proveedor firmo/acepto el reclamo</div>
                <div><span className="font-medium text-gray-700">Aplicado</span> — Nota de credito aplicada al estado de cuenta</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Último cambio: {(() => {
          const latestSeg = seg.length > 0 ? seg[0]?.created_at : null;
          const raw = current.updated_at || latestSeg || current.created_at;
          const d = raw ? new Date(raw) : null;
          if (!d) return "—";
          return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        })()}
      </p>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8 mt-6">
        <div className="border border-gray-200 rounded-lg p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Subtotal</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub)}</div></div>
        <div className="border border-gray-200 rounded-lg p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Imp. importación (10%)</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub * TASA_IMPORTACION)}</div></div>
        <div className="border border-gray-200 rounded-lg p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">ITBMS (7%)</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub * TASA_ITBMS)}</div></div>
        <div className="bg-gray-900 rounded-lg p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Total</div><div className="text-xl font-semibold tabular-nums mt-1 text-white">${fmt(sub * FACTOR_TOTAL)}</div></div>
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Ítems</div>
          <ScrollableTable minWidth={700}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200 text-[10px] uppercase tracking-[0.05em] text-gray-400">
                  <th className="text-left pb-2 font-medium">Código</th>
                  <th className="text-left pb-2 font-medium">Descripción</th>
                  <th className="text-left pb-2 font-medium">Talla</th>
                  <th className="text-right pb-2 font-medium">Cant.</th>
                  <th className="text-right pb-2 font-medium">Precio</th>
                  <th className="text-right pb-2 font-medium">Subtotal</th>
                  <th className="text-left pb-2 font-medium">Motivo</th>
                  <th className="text-left pb-2 font-medium">Factura</th>
                  <th className="text-left pb-2 font-medium">PO</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-2">{item.referencia}</td>
                    <td className="py-2 text-gray-500">{item.descripcion}</td>
                    <td className="py-2 text-gray-500">{item.talla}</td>
                    <td className="py-2 text-right tabular-nums">{Number(item.cantidad) || 0}</td>
                    <td className="py-2 text-right tabular-nums">${fmt(item.precio_unitario)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">${fmt((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}</td>
                    <td className="py-2 text-gray-500 text-xs">{item.motivo}</td>
                    <td className="py-2 text-gray-500 text-xs">{item.nro_factura}</td>
                    <td className="py-2 text-gray-500 text-xs">{item.nro_orden_compra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      )}

      {/* Evidencia fotográfica */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Evidencia fotográfica</div>
        <p className="text-xs text-gray-400 mb-3">Adjunta fotos para agilizar la resolución</p>

        {/* Thumbnail row — horizontal scroll on mobile */}
        {fotos.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 mb-3" style={{ scrollSnapType: "x mandatory" }}>
            {fotos.map((f) => {
              const src = f.url || `${SUPA_URL}/storage/v1/object/public/reclamo-fotos/${f.storage_path}`;
              return (
                <div key={f.id} className="relative flex-shrink-0 cursor-pointer" style={{ scrollSnapAlign: "start" }} onClick={() => setLightboxSrc(src)}>
                  <img src={src} alt="" className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-lg border border-gray-200" />
                  <button onClick={(e) => { e.stopPropagation(); setDeleteFotoTarget({ id: f.id, path: f.storage_path }); }} className="absolute -top-1.5 -right-1.5 w-7 h-7 bg-black text-white rounded-full text-xs flex items-center justify-center">×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Upload area */}
        {fotos.length < 5 && (
          <>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFoto(f); if (fotoRef.current) fotoRef.current.value = ""; }} />
            <button
              onClick={() => fotoRef.current?.click()}
              className="w-full sm:w-auto border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg px-6 py-4 sm:py-3 flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition active:bg-gray-50 min-h-[44px]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span className="text-sm font-medium">Adjuntar fotos</span>
              <span className="text-xs text-gray-300 hidden sm:inline">({fotos.length}/5)</span>
            </button>
          </>
        )}
        {fotos.length === 0 && (
          <p className="text-[11px] text-gray-300 mt-2 italic">Sin fotos adjuntas</p>
        )}
      </div>

      {current.notas && <p className="text-sm text-gray-400 mb-6">Notas: {current.notas}</p>}

      {/* Seguimiento */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Seguimiento</div>
        <div className="flex gap-2 mb-3">
          <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar nota..." className="flex-1 border-b border-gray-200 py-3 sm:py-1.5 text-base sm:text-sm outline-none" />
          <button onClick={onAddNota} disabled={!nota.trim()} className="text-sm bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50">Agregar</button>
        </div>
        {seg.map((s) => (
          <div key={s.id} className="border-b border-gray-50 py-2">
            <p className="text-sm">{s.nota}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(s.created_at.slice(0, 10))} {new Date(s.created_at).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" })} — {s.autor}</p>
          </div>
        ))}
      </div>

      <ConfirmDeleteModal
        open={showDeleteConfirm}
        title={`¿Eliminar reclamo ${current.nro_reclamo}?`}
        description={`Se eliminará el reclamo de ${current.empresa} (Factura: ${current.nro_factura}) con ${items.length} ítems y todas sus notas de seguimiento. Esta acción no se puede deshacer.`}
        onConfirm={() => onDeleteReclamo(current.id)}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDeleteModal
        open={!!deleteFotoTarget}
        title="¿Eliminar esta foto?"
        description="Se eliminará la foto de evidencia del reclamo. Esta acción no se puede deshacer."
        onConfirm={() => { if (deleteFotoTarget) { onDeleteFoto(deleteFotoTarget.id, deleteFotoTarget.path); setDeleteFotoTarget(null); } }}
        onCancel={() => setDeleteFotoTarget(null)}
      />

      <FotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {/* Edit mode panel */}
      {editMode && (
        <div className="border-t border-gray-200 pt-6">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Editando Reclamo</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-12 gap-y-5 mb-6">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Empresa</label>
              <select value={editEmpresa} onChange={(e) => setEditEmpresa(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent">
                {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">N° Factura</label>
              <input type="text" value={editFactura} onChange={(e) => setEditFactura(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Fecha</label>
              <input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">N° Pedido</label>
              <input type="text" value={editPedido} onChange={(e) => setEditPedido(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Estado</label>
              <select value={editEstado} onChange={(e) => setEditEstado(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent">
                {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Notas</label>
              <textarea value={editNotas} onChange={(e) => setEditNotas(e.target.value)} rows={1} className="border-b border-gray-200 py-1.5 text-sm outline-none resize-none" />
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Ítems</div>
          <ScrollableTable minWidth={700} className="mb-4">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200 text-[10px] uppercase tracking-[0.05em] text-gray-400">
                  <th className="pb-2 font-medium text-left">Código</th>
                  <th className="pb-2 font-medium text-left">Descripción</th>
                  <th className="pb-2 font-medium text-left" style={{ minWidth: 70 }}>Talla</th>
                  <th className="pb-2 font-medium text-center" style={{ minWidth: 60 }}>Cant.</th>
                  <th className="pb-2 font-medium text-right" style={{ minWidth: 80 }}>Precio U.</th>
                  <th className="pb-2 font-medium text-left">Motivo</th>
                  <th className="pb-2 font-medium text-right" style={{ minWidth: 80 }}>Subtotal</th>
                  <th className="pb-2 w-6"></th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="py-2 pr-1"><input type="text" value={item.referencia} onChange={(e) => updateEditItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none" /></td>
                    <td className="py-2 pr-1"><input type="text" value={item.descripcion} onChange={(e) => updateEditItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none" /></td>
                    <td className="py-2 pr-1"><input type="text" value={item.talla} onChange={(e) => updateEditItem(idx, "talla", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none" style={{ minWidth: 50 }} /></td>
                    <td className="py-2 pr-1"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateEditItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-200 py-1 text-sm outline-none text-center" /></td>
                    <td className="py-2 pr-1"><input type="number" step="0.01" min={0} value={item.precio_unitario} onChange={(e) => updateEditItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-200 py-1 text-sm outline-none text-right" /></td>
                    <td className="py-2 pr-1">
                      {addingEditMotivo === idx ? (
                        <div className="flex items-center gap-1">
                          <input type="text" value={newMotivoText} onChange={(e) => setNewMotivoText(e.target.value)} placeholder="Nuevo motivo..." className="w-full border-b border-gray-200 py-1 text-sm outline-none" autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter" && newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateEditItem(idx, "motivo", newMotivoText.trim()); setNewMotivoText(""); setAddingEditMotivo(null); } }} />
                          <button onClick={() => { if (newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateEditItem(idx, "motivo", newMotivoText.trim()); } setNewMotivoText(""); setAddingEditMotivo(null); }} className="text-xs text-gray-400 hover:text-black py-2 px-3">OK</button>
                          <button onClick={() => { setNewMotivoText(""); setAddingEditMotivo(null); }} className="text-xs text-gray-300 hover:text-black py-2 px-3">x</button>
                        </div>
                      ) : (
                        <select value={item.motivo} onChange={(e) => { if (e.target.value === "__add__") { setAddingEditMotivo(idx); setNewMotivoText(""); } else updateEditItem(idx, "motivo", e.target.value); }} className="w-full border-b border-gray-200 py-1 text-sm outline-none bg-transparent">
                          <option value="">--</option>
                          {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                          <option value="__add__">+ Agregar motivo</option>
                        </select>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-500 text-xs">${fmt((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}</td>
                    <td className="py-2 text-center">{editItems.length > 1 && <button onClick={() => setEditItems((p) => p.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-black text-sm">×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          <button onClick={() => setEditItems((p) => [...p, emptyItem()])} className="text-sm text-gray-400 hover:text-black transition mb-6">+ Agregar fila</button>
          <div className="flex items-center gap-6">
            <button onClick={onSaveEdit} disabled={editSaving} className="bg-black text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50">
              {editSaving ? "Guardando..." : "Guardar Cambios"}
            </button>
            <button onClick={() => setEditMode(false)} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      <Toast message={toast} />

      {/* Aplicada modal */}
      {showAplicadaModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowAplicadaModal(false)}>
          <div className="bg-white rounded-lg p-8 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">Aplicar Nota de Crédito</h3>
            <p className="text-sm text-gray-400 mb-6">Registra los datos de la nota de crédito recibida.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 block mb-1">N° Nota de Crédito *</label>
                <input type="text" value={aplicadaNc} onChange={(e) => setAplicadaNc(e.target.value)} placeholder="Ej. NC-2026-0034" className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black" autoFocus />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 block mb-1">Monto aplicado *</label>
                <input type="number" step="0.01" value={aplicadaMonto} onChange={(e) => setAplicadaMonto(e.target.value)} placeholder="0.00" className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={onAplicadaConfirm} disabled={!aplicadaNc.trim() || !aplicadaMonto} className="flex-1 bg-black text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50">Confirmar</button>
              <button onClick={() => { setShowAplicadaModal(false); setConfirmingEstado(null); }} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
