"use client";

import { useRef, useState } from "react";
import { fmt } from "@/lib/format";
import { RItem, LocalFoto } from "./types";
import { AccordionContent, FotoLightbox } from "@/components/ui";
import { EMPRESAS, EMPRESAS_MAP, TALLAS, GENEROS, DEFAULT_MOTIVOS, emptyItem, loadCustomMotivos, saveCustomMotivo, empresaDesdeIA, TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL } from "./constants";
import FacturaPdfUploader, { type FacturaIAData } from "./FacturaPdfUploader";

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
  facturaPdfPath: string | null;
  setFacturaPdfPath: (v: string | null) => void;
  savedReclamoId: string | null;
  savedNroReclamo: string;
  pendingFotos: LocalFoto[];
  onAddFoto: (file: File) => void;
  onRemoveFoto: (lf: LocalFoto) => void;
  onRetryFotos: () => void;
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
  isEditing?: boolean;
}

export default function ReclamoForm({
  fEmpresa, setFEmpresa, fFecha, setFFecha, fFactura, setFFactura,
  fPedido, setFPedido, fNotas, setFNotas, fItems, setFItems,
  facturaPdfPath, setFacturaPdfPath,
  savedReclamoId, savedNroReclamo, pendingFotos, onAddFoto, onRemoveFoto, onRetryFotos,
  saving, error,
  customMotivos, setCustomMotivos, addingMotivo, setAddingMotivo,
  newMotivoText, setNewMotivoText, onSave, onCancel, onViewSaved, onResetAndCreateAnother,
  isEditing,
}: Props) {
  const formFotoRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fotosError = pendingFotos.some((f) => f.status === "error");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  function handleBlur(field: string) { setTouched((prev) => ({ ...prev, [field]: true })); }
  function fieldError(field: string, value: string) { return touched[field] && !value.trim(); }
  const empInfo = fEmpresa ? EMPRESAS_MAP[fEmpresa] : null;
  const fSubtotal = fItems.reduce((s, i) => s + (i.subtotal || 0), 0);
  const MOTIVOS = [...DEFAULT_MOTIVOS, ...customMotivos];

  // Recently used motivos for quick-tap pills (custom motivos = most recently added)
  const recentMotivos = customMotivos.slice(-5).reverse();

  // Progressive disclosure: determine which steps are revealed
  const hasExistingData = !!isEditing || !!savedReclamoId;
  const revealAll = hasExistingData || showAll;
  const step2Visible = revealAll || !!fEmpresa;
  const step3Visible = revealAll || (step2Visible && !!fFactura.trim());
  const hasAtLeastOneItem = fItems.some((i) => i.referencia.trim() || i.descripcion.trim() || i.cantidad > 0);
  const step4Visible = revealAll || (step3Visible && hasAtLeastOneItem);

  // Current step for the progress indicator
  const currentStep = !step2Visible ? 1 : !step3Visible ? 2 : !step4Visible ? 3 : 4;

  function updateItem(idx: number, field: string, val: string | number) {
    setFItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: val };
      u.subtotal = (u.cantidad || 0) * (u.precio_unitario || 0);
      return u;
    }));
  }

  // La IA rellena la cabecera (campos editables); NO toca los ítems.
  function aplicarIA(data: FacturaIAData) {
    const emp = empresaDesdeIA(data.proveedor, data.marca);
    if (emp) setFEmpresa(emp);
    if (data.nro_factura) setFFactura(data.nro_factura);
    if (data.fecha_factura) setFFecha(data.fecha_factura);
    if (data.nro_orden_compra) setFPedido(data.nro_orden_compra);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
        <button onClick={onCancel} className="hover:text-black transition">Reclamos</button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-600 font-medium">Nuevo Reclamo</span>
      </nav>
      <div className="flex items-center justify-between mb-8 sm:mb-10">
        <h1 className="text-[21px] font-medium tracking-tight">Nuevo Reclamo</h1>
        {!revealAll && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${s <= currentStep ? "bg-black" : "bg-gray-200"}`}
                />
              ))}
              <span className="text-xs text-gray-400 ml-1.5">Paso {currentStep} de 4</span>
            </div>
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-gray-400 hover:text-black transition underline underline-offset-2"
            >
              Mostrar todos los campos
            </button>
          </div>
        )}
      </div>

      {/* ── Factura PDF + autocompletado por IA (opcional, no bloquea) ── */}
      <div className="mb-10">
        <div className="text-sm font-semibold text-gray-900 mb-4">Factura (PDF) — autocompletar</div>
        <div className="max-w-xl">
          <FacturaPdfUploader onUploaded={setFacturaPdfPath} onExtracted={aplicarIA} />
          <p className="text-xs text-gray-400 mt-2">Sube el PDF y la IA rellena proveedor, marca, factura, fecha y pedido. Revisa y corrige. Los ítems a reclamar se siguen agregando a mano.</p>
        </div>
      </div>

      {/* ── Step 1: Empresa (always visible) ── */}
      <div className="mb-10">
        <div className="text-sm font-semibold text-gray-900 mb-4">Empresa</div>
        <div className="max-w-xs">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Empresa *</label>
            <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} onBlur={() => handleBlur("empresa")} className={`border-b ${fieldError("empresa", fEmpresa) ? "border-red-400" : "border-gray-200"} py-3 sm:py-1.5 text-base sm:text-sm text-black outline-none bg-transparent`}>
              <option value="">Seleccionar...</option>
              {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            {fieldError("empresa", fEmpresa) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
            {empInfo && <p className="text-xs text-gray-400 mt-1">Proveedor: {empInfo.proveedor} | Marca: {empInfo.marca}</p>}
          </div>
        </div>
      </div>

      {/* ── Step 2: Factura, Fecha, Pedido (after empresa selected) ── */}
      <AccordionContent open={step2Visible} duration={200}>
        <div className="mb-10">
          <div className="text-sm font-semibold text-gray-900 mb-4">Datos de Factura</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-12 gap-y-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">N° Factura *</label>
              <input type="text" value={fFactura} onChange={(e) => setFFactura(e.target.value)} onBlur={() => handleBlur("factura")} placeholder="Ej. 3000012593" className={`border-b ${fieldError("factura", fFactura) ? "border-red-400" : "border-gray-200"} py-3 sm:py-1.5 text-base sm:text-sm text-black outline-none`} />
              {fieldError("factura", fFactura) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Fecha *</label>
              <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} onBlur={() => handleBlur("fecha")} className={`border-b ${fieldError("fecha", fFecha) ? "border-red-400" : "border-gray-200"} py-3 sm:py-1.5 text-base sm:text-sm text-black outline-none`} />
              {fieldError("fecha", fFecha) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">N° Pedido *</label>
              <input type="text" value={fPedido} onChange={(e) => setFPedido(e.target.value)} onBlur={() => handleBlur("pedido")} placeholder="Ej. PO-2026-001" className={`border-b ${fieldError("pedido", fPedido) ? "border-red-400" : "border-gray-200"} py-3 sm:py-1.5 text-base sm:text-sm text-black outline-none`} />
              {fieldError("pedido", fPedido) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
            </div>
          </div>
        </div>
      </AccordionContent>

      {/* ── Step 3: Items table (after factura filled) ── */}
      <AccordionContent open={step3Visible} duration={200}>
      <div className="mb-10">
        <div className="text-sm font-semibold text-gray-900 mb-2">Ítems del Reclamo</div>
        {/* Quick-tap motivo pills */}
        {recentMotivos.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-1.5">Motivos recientes:</p>
            <div className="flex flex-wrap gap-1.5">
              {recentMotivos.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    // Apply motivo to the first item that has no motivo set
                    const idx = fItems.findIndex((i) => !i.motivo);
                    if (idx >= 0) updateItem(idx, "motivo", m);
                  }}
                  className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-500 hover:border-gray-400 hover:text-black active:bg-gray-100 transition"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm [&_td]:py-3 [&_th]:pb-3 [&_th]:px-5 [&_td]:px-5 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide font-medium text-gray-500">
                <th className="pb-2 font-medium text-left">Código *</th>
                <th className="pb-2 font-medium text-left">Descripción *</th>
                <th className="pb-2 font-medium text-left" style={{ minWidth: 70 }}>Talla *</th>
                <th className="pb-2 font-medium text-left" style={{ minWidth: 90 }}>Género *</th>
                <th className="pb-2 font-medium text-right" style={{ minWidth: 60 }}>Cant. *</th>
                <th className="pb-2 font-medium text-right" style={{ minWidth: 80 }}>Precio U. *</th>
                <th className="pb-2 font-medium text-left">Motivo *</th>
                <th className="pb-2 font-medium text-right" style={{ minWidth: 80 }}>Subtotal</th>
                <th className="pb-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {fItems.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-200">
                  <td className="py-2 pr-1"><input type="text" value={item.referencia} onChange={(e) => updateItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none" /></td>
                  <td className="py-2 pr-1"><input type="text" value={item.descripcion} onChange={(e) => updateItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none" /></td>
                  <td className="py-2 pr-1">
                    {(!TALLAS.includes(item.talla) && item.talla !== "") ? (
                      <div className="flex items-center gap-1">
                        <input type="text" value={item.talla} onChange={(e) => updateItem(idx, "talla", e.target.value)} placeholder="Talla" className="w-full border-b border-gray-200 py-1 text-sm outline-none" style={{ minWidth: 50 }} />
                        <button onClick={() => updateItem(idx, "talla", "")} className="text-gray-300 hover:text-black text-xs">×</button>
                      </div>
                    ) : (
                      <select value={item.talla} onChange={(e) => { if (e.target.value === "Otros") updateItem(idx, "talla", " "); else updateItem(idx, "talla", e.target.value); }} className="border-b border-gray-200 py-1 text-sm outline-none bg-transparent" style={{ minWidth: 60 }}>
                        <option value="">—</option>
                        {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-1">
                    <select value={item.genero} onChange={(e) => updateItem(idx, "genero", e.target.value)} className={`w-full border-b py-1 text-sm outline-none bg-transparent ${item.genero ? "border-gray-200 text-black" : "border-gray-200 text-gray-400"}`} style={{ minWidth: 80 }}>
                      <option value="">Género…</option>
                      {GENEROS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-1"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-200 py-1 text-sm outline-none text-right" /></td>
                  <td className="py-2 pr-1"><input type="number" step="0.50" min={0} value={item.precio_unitario} onChange={(e) => updateItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-200 py-1 text-sm outline-none text-right" /></td>
                  <td className="py-2 pr-1">
                    {addingMotivo === idx ? (
                      <div className="flex items-center gap-1">
                        <input type="text" value={newMotivoText} onChange={(e) => setNewMotivoText(e.target.value)} placeholder="Nuevo motivo..." className="w-full border-b border-gray-200 py-1 text-sm outline-none" autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter" && newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateItem(idx, "motivo", newMotivoText.trim()); setNewMotivoText(""); setAddingMotivo(null); } }} />
                        <button onClick={() => { if (newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateItem(idx, "motivo", newMotivoText.trim()); } setNewMotivoText(""); setAddingMotivo(null); }} className="text-xs text-gray-400 hover:text-black">OK</button>
                        <button onClick={() => { setNewMotivoText(""); setAddingMotivo(null); }} className="text-xs text-gray-300 hover:text-black">x</button>
                      </div>
                    ) : (
                      <select value={item.motivo} onChange={(e) => { if (e.target.value === "__add__") { setAddingMotivo(idx); setNewMotivoText(""); } else updateItem(idx, "motivo", e.target.value); }} className="w-full border-b border-gray-200 py-1 text-sm outline-none bg-transparent">
                        <option value="">--</option>
                        {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                        <option value="__add__">+ Agregar motivo</option>
                      </select>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-500 text-xs">${fmt((item.cantidad || 0) * (item.precio_unitario || 0))}</td>
                  <td className="py-2 text-center">{fItems.length > 1 && <button onClick={() => setFItems((p) => p.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-black text-sm py-1.5 px-2 min-h-[44px]">×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: una card por ítem con campos apilados y etiquetados */}
        <div className="sm:hidden space-y-3">
          {fItems.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-gray-200 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Ítem {idx + 1}</span>
                {fItems.length > 1 && (
                  <button type="button" onClick={() => setFItems((p) => p.filter((_, i) => i !== idx))} className="text-xs text-gray-400 hover:text-red-500 min-h-[44px] px-2">Quitar</button>
                )}
              </div>
              <label className="block">
                <span className="text-xs text-gray-500">Código *</span>
                <input type="text" value={item.referencia} onChange={(e) => updateItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Descripción *</span>
                <input type="text" value={item.descripcion} onChange={(e) => updateItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">Talla *</span>
                  {(!TALLAS.includes(item.talla) && item.talla !== "") ? (
                    <div className="flex items-center gap-1">
                      <input type="text" value={item.talla} onChange={(e) => updateItem(idx, "talla", e.target.value)} placeholder="Talla" className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black" />
                      <button type="button" onClick={() => updateItem(idx, "talla", "")} className="text-gray-300 hover:text-black text-xs">×</button>
                    </div>
                  ) : (
                    <select value={item.talla} onChange={(e) => { if (e.target.value === "Otros") updateItem(idx, "talla", " "); else updateItem(idx, "talla", e.target.value); }} className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent">
                      <option value="">—</option>
                      {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Cantidad *</span>
                  <input type="number" inputMode="numeric" min={0} value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500">Género *</span>
                <select value={item.genero} onChange={(e) => updateItem(idx, "genero", e.target.value)} className={`w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black ${item.genero ? "text-black" : "text-gray-400"}`}>
                  <option value="">Género…</option>
                  {GENEROS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">Precio U. *</span>
                  <input type="number" inputMode="decimal" step="0.50" min={0} value={item.precio_unitario} onChange={(e) => updateItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black" />
                </label>
                <div className="block">
                  <span className="text-xs text-gray-500">Subtotal</span>
                  <p className="py-2 text-sm tabular-nums text-gray-600">${fmt((item.cantidad || 0) * (item.precio_unitario || 0))}</p>
                </div>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500">Motivo *</span>
                {addingMotivo === idx ? (
                  <div className="flex items-center gap-1">
                    <input type="text" value={newMotivoText} onChange={(e) => setNewMotivoText(e.target.value)} placeholder="Nuevo motivo..." className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black" autoFocus />
                    <button type="button" onClick={() => { if (newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateItem(idx, "motivo", newMotivoText.trim()); } setNewMotivoText(""); setAddingMotivo(null); }} className="text-xs text-gray-400 hover:text-black px-1">OK</button>
                    <button type="button" onClick={() => { setNewMotivoText(""); setAddingMotivo(null); }} className="text-xs text-gray-300 hover:text-black px-1">x</button>
                  </div>
                ) : (
                  <select value={item.motivo} onChange={(e) => { if (e.target.value === "__add__") { setAddingMotivo(idx); setNewMotivoText(""); } else updateItem(idx, "motivo", e.target.value); }} className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent">
                    <option value="">--</option>
                    {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                    <option value="__add__">+ Agregar motivo</option>
                  </select>
                )}
              </label>
            </div>
          ))}
        </div>

        <button onClick={() => setFItems((p) => [...p, emptyItem()])} className="text-sm text-gray-400 hover:text-black transition mt-3">+ Agregar fila</button>
        <div className="mt-6 text-right text-sm space-y-1">
          <div>Subtotal: <span className="tabular-nums font-medium">${fmt(fSubtotal)}</span></div>
          <div className="text-gray-400">Importación (10%): ${fmt(fSubtotal * TASA_IMPORTACION)}</div>
          <div className="text-gray-400">ITBMS (7% s/imp.): ${fmt(fSubtotal * TASA_ITBMS)}</div>
          <div className="text-lg font-semibold">Total: ${fmt(fSubtotal * FACTOR_TOTAL)}</div>
        </div>
      </div>
      </AccordionContent>

      {/* ── Step 4: Notas (after at least 1 item) ── */}
      <AccordionContent open={step4Visible} duration={200}>
        <div className="mb-10">
          <div className="text-sm font-semibold text-gray-900 mb-4">Notas</div>
          <div className="max-w-2xl">
            <textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} rows={2} placeholder="Notas adicionales sobre el reclamo..." className="w-full border-b border-gray-200 py-3 sm:py-1.5 text-base sm:text-sm text-black outline-none resize-none" />
          </div>
        </div>
      </AccordionContent>

      {/* ── Evidencia fotográfica (opcional) — se adjuntan ANTES de guardar ── */}
      <div className="mb-10">
        <div className="text-sm font-semibold text-gray-900 mb-1">Evidencia fotográfica <span className="font-normal text-gray-400">(opcional)</span></div>
        <p className="text-xs text-gray-400 mb-3">Adjunta las fotos ahora; se guardan junto con el reclamo en un solo paso.</p>

        {pendingFotos.length > 0 && (
          <div className="flex flex-wrap gap-4 mb-3">
            {pendingFotos.map((f) => {
              const src = f.uploaded?.url || f.previewUrl;
              return (
                <div key={f.localId} className="relative">
                  <img src={src} alt="" onClick={() => setLightboxSrc(src)} className={`w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border cursor-pointer ${f.status === "error" ? "border-red-400" : "border-gray-200"}`} />
                  {f.status === "uploading" && (
                    <div className="absolute inset-0 rounded-lg bg-white/70 flex items-center justify-center">
                      <span className="w-5 h-5 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                    </div>
                  )}
                  {f.status === "done" && (
                    <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center border-2 border-white">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </div>
                  )}
                  {f.status === "error" && (
                    <div className="absolute inset-0 rounded-lg bg-red-50/80 flex items-center justify-center pointer-events-none">
                      <span className="text-red-600 text-[11px] font-semibold">Falló</span>
                    </div>
                  )}
                  <button type="button" onClick={() => onRemoveFoto(f)} className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-black text-white rounded-full text-xs flex items-center justify-center">×</button>
                </div>
              );
            })}
          </div>
        )}

        {fotosError && (
          <div className="mb-3 text-xs">
            <p className="text-red-600 font-medium">Algunas fotos no se subieron:</p>
            <ul className="mt-1 space-y-0.5">
              {pendingFotos.filter((f) => f.status === "error").map((f) => (
                <li key={f.localId} className="text-red-500">• {f.file.name}: {f.error}</li>
              ))}
            </ul>
            {savedReclamoId && (
              <button type="button" onClick={onRetryFotos} disabled={saving} className="mt-2 inline-flex items-center gap-1 font-medium border border-red-300 text-red-600 rounded-full px-3 py-1.5 hover:bg-red-50 disabled:opacity-50">
                {saving ? "Reintentando…" : "Reintentar fotos"}
              </button>
            )}
          </div>
        )}

        {pendingFotos.length < 5 && !savedReclamoId && (
          <>
            <input ref={formFotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onAddFoto(file); if (formFotoRef.current) formFotoRef.current.value = ""; }} />
            <button
              type="button"
              onClick={() => formFotoRef.current?.click()}
              disabled={saving}
              className="w-full sm:w-auto border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg px-6 py-4 sm:py-3 flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition active:bg-gray-50 min-h-[44px] disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span className="text-sm font-medium">Adjuntar fotos</span>
              <span className="text-xs text-gray-300 hidden sm:inline">({pendingFotos.length}/5)</span>
            </button>
          </>
        )}
      </div>

      {/* ── Acciones ── */}
      {savedReclamoId ? (
        <div className="mt-8 border-t border-gray-200 pt-6">
          {/* Estado HONESTO: en verde "guardado" solo cuando reclamo + fotos
              terminaron OK. Mientras sube: "Guardando…". Si una foto falló: mixto. */}
          <div className={`flex items-center gap-3 mb-6 p-4 rounded-lg ${saving ? "bg-gray-50" : fotosError ? "bg-amber-50" : "bg-green-50"}`}>
            {saving ? (
              <span className="w-5 h-5 border-2 border-gray-300 border-t-black rounded-full animate-spin flex-shrink-0" />
            ) : fotosError ? (
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold leading-none">!</div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </div>
            )}
            <div>
              <p className="text-sm font-medium">
                {saving ? "Guardando reclamo y fotos…" : fotosError ? `${savedNroReclamo} guardado · faltan fotos` : pendingFotos.length > 0 ? `${savedNroReclamo} guardado con sus fotos` : `${savedNroReclamo} guardado`}
              </p>
              <p className="text-xs text-gray-500">
                {saving ? "No cierres esta pantalla." : fotosError ? "El reclamo quedó guardado, pero algunas fotos no subieron. Reintenta arriba." : pendingFotos.length > 0 ? "Reclamo y fotos subidos correctamente." : "Reclamo guardado. Puedes agregar fotos desde el reclamo."}
              </p>
            </div>
          </div>
          <button onClick={onViewSaved} disabled={saving} className="bg-black text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">Ver reclamo →</button>
          <button onClick={onResetAndCreateAnother} disabled={saving} className="text-sm text-gray-400 hover:text-black transition ml-4 disabled:opacity-50">Crear otro reclamo</button>
        </div>
      ) : (
        <div className="mt-8">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <div className="flex items-center gap-4 sm:gap-6">
            <button onClick={onSave} disabled={saving} className="flex-1 sm:flex-none bg-black text-white px-6 py-3 sm:py-2.5 rounded-md text-base sm:text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50 min-h-[44px]">
              {saving ? "Guardando…" : "Guardar Reclamo"}
            </button>
            <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
          </div>
        </div>
      )}

      <FotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
