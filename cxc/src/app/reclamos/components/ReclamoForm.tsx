"use client";

import { useRef, useState } from "react";
import { fmt } from "@/lib/format";
import { RItem, Foto } from "./types";
import { ConfirmDeleteModal, FotoLightbox } from "@/components/ui";
import { EMPRESAS, EMPRESAS_MAP, TALLAS, DEFAULT_MOTIVOS, emptyItem, loadCustomMotivos, saveCustomMotivo } from "./constants";

interface Props {
  fEmpresa: string;
  setFEmpresa: (v: string) => void;
  fFecha: string;
  setFFecha: (v: string) => void;
  fFactura: string;
  setFFactura: (v: string) => void;
  fPedido: string;
  setFPedido: (v: string) => void;
  fNotas: string;
  setFNotas: (v: string) => void;
  fItems: RItem[];
  setFItems: React.Dispatch<React.SetStateAction<RItem[]>>;
  savedReclamoId: string | null;
  savedNroReclamo: string;
  formFotos: Foto[];
  setFormFotos: React.Dispatch<React.SetStateAction<Foto[]>>;
  uploadingFormFoto: boolean;
  setUploadingFormFoto: (v: boolean) => void;
  saving: boolean;
  error: string | null;
  customMotivos: string[];
  setCustomMotivos: React.Dispatch<React.SetStateAction<string[]>>;
  addingMotivo: number | null;
  setAddingMotivo: (v: number | null) => void;
  newMotivoText: string;
  setNewMotivoText: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onViewSaved: () => void;
  onResetAndCreateAnother: () => void;
}

export default function ReclamoForm({
  fEmpresa, setFEmpresa, fFecha, setFFecha, fFactura, setFFactura,
  fPedido, setFPedido, fNotas, setFNotas, fItems, setFItems,
  savedReclamoId, savedNroReclamo, formFotos, setFormFotos,
  uploadingFormFoto, setUploadingFormFoto, saving, error,
  customMotivos, setCustomMotivos, addingMotivo, setAddingMotivo,
  newMotivoText, setNewMotivoText, onSave, onCancel, onViewSaved, onResetAndCreateAnother,
}: Props) {
  const formFotoRef = useRef<HTMLInputElement>(null);
  const [deleteFotoTarget, setDeleteFotoTarget] = useState<Foto | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const empInfo = fEmpresa ? EMPRESAS_MAP[fEmpresa] : null;
  const fSubtotal = fItems.reduce((s, i) => s + (i.subtotal || 0), 0);
  const MOTIVOS = [...DEFAULT_MOTIVOS, ...customMotivos];

  function updateItem(idx: number, field: string, val: string | number) {
    setFItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: val };
      u.subtotal = (u.cantidad || 0) * (u.precio_unitario || 0);
      return u;
    }));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition mb-8 block">← Reclamos</button>
      <h1 className="text-xl font-light tracking-tight mb-10">Nuevo Reclamo</h1>

      <div className="mb-10">
        <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Información General</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-12 gap-y-5 mb-6">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Empresa *</label>
            <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm text-black outline-none bg-transparent">
              <option value="">Seleccionar...</option>
              {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            {empInfo && <p className="text-xs text-gray-400 mt-1">Proveedor: {empInfo.proveedor} | Marca: {empInfo.marca}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">N° Factura *</label>
            <input type="text" value={fFactura} onChange={(e) => setFFactura(e.target.value)} placeholder="Ej. 3000012593" className="border-b border-gray-200 py-1.5 text-sm text-black outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Fecha *</label>
            <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm text-black outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">N° Pedido</label>
            <input type="text" value={fPedido} onChange={(e) => setFPedido(e.target.value)} placeholder="Ej. PO-2026-001" className="border-b border-gray-200 py-1.5 text-sm text-black outline-none" />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Notas</label>
            <textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} rows={1} className="border-b border-gray-200 py-1.5 text-sm text-black outline-none resize-none" />
          </div>
        </div>
      </div>

      <div className="mb-10">
        <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Ítems del Reclamo</div>
        <div className="overflow-x-auto">
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
              {fItems.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-2 pr-1"><input type="text" value={item.referencia} onChange={(e) => updateItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                  <td className="py-2 pr-1"><input type="text" value={item.descripcion} onChange={(e) => updateItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-100 py-1 text-sm outline-none" /></td>
                  <td className="py-2 pr-1">
                    {(!TALLAS.includes(item.talla) && item.talla !== "") ? (
                      <div className="flex items-center gap-1">
                        <input type="text" value={item.talla} onChange={(e) => updateItem(idx, "talla", e.target.value)} placeholder="Talla" className="w-full border-b border-gray-100 py-1 text-sm outline-none" style={{ minWidth: 50 }} />
                        <button onClick={() => updateItem(idx, "talla", "")} className="text-gray-300 hover:text-black text-xs">×</button>
                      </div>
                    ) : (
                      <select value={item.talla} onChange={(e) => { if (e.target.value === "Otros") updateItem(idx, "talla", " "); else updateItem(idx, "talla", e.target.value); }} className="border-b border-gray-100 py-1 text-sm outline-none bg-transparent" style={{ minWidth: 60 }}>
                        <option value="">—</option>
                        {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-1"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-100 py-1 text-sm outline-none text-center" /></td>
                  <td className="py-2 pr-1"><input type="number" step="0.01" min={0} value={item.precio_unitario} onChange={(e) => updateItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-100 py-1 text-sm outline-none text-right" /></td>
                  <td className="py-2 pr-1">
                    {addingMotivo === idx ? (
                      <div className="flex items-center gap-1">
                        <input type="text" value={newMotivoText} onChange={(e) => setNewMotivoText(e.target.value)} placeholder="Nuevo motivo..." className="w-full border-b border-gray-200 py-1 text-sm outline-none" autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter" && newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateItem(idx, "motivo", newMotivoText.trim()); setNewMotivoText(""); setAddingMotivo(null); } }} />
                        <button onClick={() => { if (newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateItem(idx, "motivo", newMotivoText.trim()); } setNewMotivoText(""); setAddingMotivo(null); }} className="text-xs text-gray-400 hover:text-black">OK</button>
                        <button onClick={() => { setNewMotivoText(""); setAddingMotivo(null); }} className="text-xs text-gray-300 hover:text-black">x</button>
                      </div>
                    ) : (
                      <select value={item.motivo} onChange={(e) => { if (e.target.value === "__add__") { setAddingMotivo(idx); setNewMotivoText(""); } else updateItem(idx, "motivo", e.target.value); }} className="w-full border-b border-gray-100 py-1 text-sm outline-none bg-transparent">
                        <option value="">--</option>
                        {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                        <option value="__add__">+ Agregar motivo</option>
                      </select>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500 text-xs">${fmt((item.cantidad || 0) * (item.precio_unitario || 0))}</td>
                  <td className="py-2 text-center">{fItems.length > 1 && <button onClick={() => setFItems((p) => p.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-black text-sm">×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => setFItems((p) => [...p, emptyItem()])} className="text-sm text-gray-400 hover:text-black transition mt-3">+ Agregar fila</button>
        <div className="mt-6 text-right text-sm space-y-1">
          <div>Subtotal: <span className="tabular-nums font-medium">${fmt(fSubtotal)}</span></div>
          <div className="text-gray-400">Importación (10%): ${fmt(fSubtotal * 0.10)}</div>
          <div className="text-gray-400">ITBMS (7% s/imp.): ${fmt(fSubtotal * 0.077)}</div>
          <div className="text-lg font-semibold">Total: ${fmt(fSubtotal * 1.177)}</div>
        </div>
      </div>

      {savedReclamoId ? (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
            <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center flex-shrink-0">
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
            <div>
              <p className="text-sm font-medium">{savedNroReclamo} guardado</p>
              <p className="text-xs text-gray-400">Agrega fotos de evidencia si tienes (opcional)</p>
            </div>
          </div>
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-3">Fotos de evidencia</div>
            {formFotos.length > 0 && (
              <div className="flex gap-3 flex-wrap mb-3">
                {formFotos.map((f) => (
                  <div key={f.id} className="relative cursor-pointer" onClick={() => setLightboxSrc(f.url)}>
                    <img src={f.url} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-100" />
                    <button onClick={(e) => { e.stopPropagation(); setDeleteFotoTarget(f); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black text-white rounded-full text-xs flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
            {formFotos.length < 3 && (
              <>
                <input ref={formFotoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !savedReclamoId) return;
                  setUploadingFormFoto(true);
                  const fd = new FormData(); fd.append("file", file);
                  const res = await fetch(`/api/reclamos/${savedReclamoId}/fotos`, { method: "POST", body: fd });
                  if (res.ok) { const data = await res.json(); setFormFotos((p) => [...p, data]); }
                  setUploadingFormFoto(false);
                  if (formFotoRef.current) formFotoRef.current.value = "";
                }} />
                <button onClick={() => formFotoRef.current?.click()} disabled={uploadingFormFoto} className="text-sm text-gray-400 hover:text-black transition disabled:opacity-40">
                  {uploadingFormFoto ? "Subiendo..." : "+ Agregar foto"}
                </button>
              </>
            )}
          </div>
          <button onClick={onViewSaved} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition">Ver reclamo →</button>
          <button onClick={onResetAndCreateAnother} className="text-sm text-gray-400 hover:text-black transition ml-4">Crear otro reclamo</button>
        </div>
      ) : (
        <div className="mt-8">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <div className="flex items-center gap-6">
            <button onClick={onSave} disabled={saving} className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
              {saving ? "Guardando..." : "Guardar Reclamo"}
            </button>
            <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={!!deleteFotoTarget}
        title="¿Eliminar esta foto?"
        description="Se eliminará la foto de evidencia del reclamo. Esta acción no se puede deshacer."
        onConfirm={async () => {
          if (deleteFotoTarget && savedReclamoId) {
            await fetch(`/api/reclamos/${savedReclamoId}/fotos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foto_id: deleteFotoTarget.id, storage_path: deleteFotoTarget.storage_path }) });
            setFormFotos((p) => p.filter((x) => x.id !== deleteFotoTarget.id));
          }
          setDeleteFotoTarget(null);
        }}
        onCancel={() => setDeleteFotoTarget(null)}
      />

      <FotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
