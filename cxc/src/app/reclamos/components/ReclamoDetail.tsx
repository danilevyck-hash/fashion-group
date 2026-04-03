"use client";

import { useRef, useState } from "react";
import { fmt, fmtDate } from "@/lib/format";
import { Toast, StatusBadge, ConfirmDeleteModal, FotoLightbox } from "@/components/ui";
import { Reclamo, RItem, Contacto } from "./types";
import { ESTADOS, EMPRESAS, EC, TALLAS, DEFAULT_MOTIVOS, emptyItem, daysSince, calcSub, buildSingleReclamoPdfHtml, openPdfWindow, loadCustomMotivos, saveCustomMotivo } from "./constants";

const VALID_TRANSITIONS: Record<string, string[]> = {
  "Borrador": ["Enviado"],
  "Enviado": ["En revisión"],
  "En revisión": ["Resuelto con NC", "Rechazado"],
  "Resuelto con NC": [],
  "Rechazado": [],
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
}: Props) {
  const fotoRef = useRef<HTMLInputElement>(null);
  const MOTIVOS = [...DEFAULT_MOTIVOS, ...customMotivos];
  const [deleteFotoTarget, setDeleteFotoTarget] = useState<{ id: string; path: string } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  async function sendEmail() {
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/reclamos/${current.id}/send-email`, { method: "POST" });
      if (!res.ok) throw new Error();
      alert("Email enviado al proveedor");
    } catch {
      alert("Error al enviar el email");
    } finally {
      setSendingEmail(false);
    }
  }

  const items = current.reclamo_items ?? [];
  const seg = current.reclamo_seguimiento ?? [];
  const fotos = current.reclamo_fotos ?? [];
  const sub = calcSub(items);
  const days = daysSince(current.fecha_reclamo);

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
    if (!c?.whatsapp) { alert("No hay contacto WhatsApp para esta empresa."); return; }
    const nombre = c.nombre_contacto || c.nombre || "equipo";
    const total = calcSub(current.reclamo_items ?? []) * 1.177;
    const msg = `Hola ${nombre}, te escribo de parte de Fashion Group para dar seguimiento al reclamo ${current.nro_reclamo}.\n\nFactura: ${current.nro_factura}\nTotal a acreditar: $${fmt(total)}\nEstado: ${current.estado}\nFecha: ${fmtDate(current.fecha_reclamo)}\n\n¿Nos puedes confirmar el estado? Gracias.`;
    window.open(`https://wa.me/${(c.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-black transition mb-8 block">← Reclamos</button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-light tracking-tight">{current.nro_reclamo}</h1>
          <p className="text-sm text-gray-400 mt-1">{current.empresa} — {current.marca} — {current.proveedor}</p>
          <p className="text-sm text-gray-400">Factura: {current.nro_factura}{current.nro_orden_compra ? ` | PO: ${current.nro_orden_compra}` : ""}</p>
          <p className="text-sm text-gray-400">{fmtDate(current.fecha_reclamo)} — {days} días</p>
        </div>
        <StatusBadge estado={current.estado} />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button onClick={startEdit} className="text-xs border border-gray-200 px-3 py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
          Editar
        </button>
        <button onClick={sendEmail} disabled={sendingEmail} className="text-xs bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition flex items-center gap-1 disabled:opacity-40">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
          {sendingEmail ? "Enviando..." : "Enviar por Email"}
        </button>
        <button onClick={sendWA} className="text-xs border border-gray-200 px-3 py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
          WhatsApp
        </button>
        <button onClick={() => openPdfWindow(buildSingleReclamoPdfHtml(current, fotos))} className="text-xs border border-gray-200 px-3 py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /><rect x="6" y="2" width="12" height="4" rx="1" /><path d="M4 18h16" /></svg>
          Imprimir
        </button>
        <button onClick={() => window.open(`/api/reclamos/${current.id}/excel`)} className="text-xs border border-gray-200 px-3 py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          Excel
        </button>
        {(role === "admin" || role === "secretaria") && (
          <button onClick={() => setShowDeleteConfirm(true)} className="text-xs text-red-300 hover:text-red-600 transition ml-auto">Eliminar Reclamo</button>
        )}
      </div>

      {/* Enviar button for Borrador */}
      {current.estado === "Borrador" && (
        <button onClick={() => onChangeEstado("Enviado")} className="mb-6 bg-black text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-gray-800 transition flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          Enviar Reclamo
        </button>
      )}

      {/* Estado buttons */}
      <div className="flex items-center gap-1 mb-8 flex-wrap gap-y-2">
        {ESTADOS.map((e) => {
          const isCurrent = current.estado === e;
          const allowedNext = VALID_TRANSITIONS[current.estado] || [];
          const canTransition = allowedNext.includes(e);
          return (
            <div key={e} className="relative">
              <button
                onClick={() => { if (!isCurrent && canTransition) setConfirmingEstado(confirmingEstado === e ? null : e); }}
                disabled={!isCurrent && !canTransition}
                className={`h-8 text-xs text-center transition px-4 py-2 rounded-full ${isCurrent ? `${EC[e] || "bg-gray-100 text-gray-500"} ring-1 ring-current font-medium` : canTransition ? "bg-gray-100 text-gray-400 hover:bg-gray-200" : "bg-gray-50 text-gray-300 cursor-not-allowed"}`}>
                {e}
              </button>
              {confirmingEstado === e && !isCurrent && canTransition && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 text-center" style={{ minWidth: 140 }}>
                  <p className="text-[11px] text-gray-500 mb-1.5">Cambiar a {e}?</p>
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => { if (e === "Resuelto con NC") { setShowAplicadaModal(true); setConfirmingEstado(null); } else onChangeEstado(e); }} className="text-[11px] bg-black text-white px-3 py-1 rounded-full hover:bg-gray-800 transition">Si</button>
                    <button onClick={() => setConfirmingEstado(null)} className="text-[11px] text-gray-400 px-2 py-1 hover:text-black transition">No</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Último cambio: {(() => {
          const d = current.created_at ? new Date(current.created_at) : null;
          if (!d) return "—";
          return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        })()}
      </p>

      {/* Totals */}
      <div className="grid grid-cols-4 gap-4 mb-8 mt-6">
        <div className="border border-gray-100 rounded-xl p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Subtotal</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub)}</div></div>
        <div className="border border-gray-100 rounded-xl p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Import. 10%</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub * 0.10)}</div></div>
        <div className="border border-gray-100 rounded-xl p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">ITBMS</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(sub * 0.077)}</div></div>
        <div className="bg-gray-900 rounded-xl p-3 text-center"><div className="text-[10px] text-gray-400 uppercase">Total</div><div className="text-xl font-semibold tabular-nums mt-1 text-white">${fmt(sub * 1.177)}</div></div>
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Ítems</div>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-[700px] px-4 sm:px-0">
            <table className="w-full text-sm">
              <thead>
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
                  <tr key={i} className="border-b border-gray-100">
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
            </div>
          </div>
        </div>
      )}

      {/* Fotos */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Fotos de Evidencia</div>
        {fotos.length === 0 ? <p className="text-[12px] text-gray-400 italic">Sin fotos adjuntas</p> : (
          <div className="flex gap-3 flex-wrap">
            {fotos.map((f) => {
              const src = f.url || `${SUPA_URL}/storage/v1/object/public/reclamo-fotos/${f.storage_path}`;
              return (
                <div key={f.id} className="relative cursor-pointer" onClick={() => setLightboxSrc(src)}>
                  <img src={src} alt="" className="w-24 h-24 object-cover rounded-xl border border-gray-100" />
                  <button onClick={(e) => { e.stopPropagation(); setDeleteFotoTarget({ id: f.id, path: f.storage_path }); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black text-white rounded-full text-xs flex items-center justify-center">×</button>
                </div>
              );
            })}
          </div>
        )}
        {fotos.length < 3 && (
          <>
            <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFoto(f); if (fotoRef.current) fotoRef.current.value = ""; }} />
            <button onClick={() => fotoRef.current?.click()} className="text-sm text-gray-400 hover:text-black transition mt-2">+ Agregar foto</button>
          </>
        )}
      </div>

      {current.notas && <p className="text-sm text-gray-400 mb-6">Notas: {current.notas}</p>}

      {/* Seguimiento */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Seguimiento</div>
        <div className="flex gap-2 mb-3">
          <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar nota..." className="flex-1 border-b border-gray-200 py-1.5 text-sm outline-none" />
          <button onClick={onAddNota} disabled={!nota.trim()} className="text-sm bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition disabled:opacity-40">Agregar</button>
        </div>
        {seg.map((s) => (
          <div key={s.id} className="border-b border-gray-50 py-2">
            <p className="text-sm">{s.nota}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{new Date(s.created_at).toLocaleString("es-PA")} — {s.autor}</p>
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
        <div className="border-t border-gray-100 pt-6">
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
          <div className="overflow-x-auto -mx-4 sm:mx-0 mb-4">
            <div className="min-w-[700px] px-4 sm:px-0">
            <table className="w-full text-sm">
              <thead>
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
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-2 pr-1"><input type="text" value={item.referencia} onChange={(e) => updateEditItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                    <td className="py-2 pr-1"><input type="text" value={item.descripcion} onChange={(e) => updateEditItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                    <td className="py-2 pr-1"><input type="text" value={item.talla} onChange={(e) => updateEditItem(idx, "talla", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" style={{ minWidth: 50 }} /></td>
                    <td className="py-2 pr-1"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateEditItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-100 py-1 text-sm outline-none text-center" /></td>
                    <td className="py-2 pr-1"><input type="number" step="0.01" min={0} value={item.precio_unitario} onChange={(e) => updateEditItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-100 py-1 text-sm outline-none text-right" /></td>
                    <td className="py-2 pr-1">
                      {addingEditMotivo === idx ? (
                        <div className="flex items-center gap-1">
                          <input type="text" value={newMotivoText} onChange={(e) => setNewMotivoText(e.target.value)} placeholder="Nuevo motivo..." className="w-full border-b border-gray-200 py-1 text-sm outline-none" autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter" && newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateEditItem(idx, "motivo", newMotivoText.trim()); setNewMotivoText(""); setAddingEditMotivo(null); } }} />
                          <button onClick={() => { if (newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateEditItem(idx, "motivo", newMotivoText.trim()); } setNewMotivoText(""); setAddingEditMotivo(null); }} className="text-xs text-gray-400 hover:text-black">OK</button>
                          <button onClick={() => { setNewMotivoText(""); setAddingEditMotivo(null); }} className="text-xs text-gray-300 hover:text-black">x</button>
                        </div>
                      ) : (
                        <select value={item.motivo} onChange={(e) => { if (e.target.value === "__add__") { setAddingEditMotivo(idx); setNewMotivoText(""); } else updateEditItem(idx, "motivo", e.target.value); }} className="w-full border-b border-gray-100 py-1 text-sm outline-none bg-transparent">
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
            </div>
          </div>
          <button onClick={() => setEditItems((p) => [...p, emptyItem()])} className="text-sm text-gray-400 hover:text-black transition mb-6">+ Agregar fila</button>
          <div className="flex items-center gap-6">
            <button onClick={onSaveEdit} disabled={editSaving} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
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
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">Resuelto con Nota de Crédito</h3>
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
              <button onClick={onAplicadaConfirm} disabled={!aplicadaNc.trim() || !aplicadaMonto} className="flex-1 bg-black text-white px-4 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">Confirmar</button>
              <button onClick={() => { setShowAplicadaModal(false); setConfirmingEstado(null); }} className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-full text-sm hover:bg-gray-50 transition">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
