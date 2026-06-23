"use client";

// Test manual de regresión — correr tras tocar GuiaForm o saveGuia:
//   1. Abrir una guía existente (ej GT-042) en edición
//   2. Click "+ Agregar fila" tres veces seguidas
//   3. NO debe redirigir al listado /guias ni limpiar el form
//   4. El auto-save silencioso dispara cada 1.5s sin perder el contexto
//   5. Click "Guardar" final sí debe redirigir al listado
//
// Sprint 2 (2026-05-26): el input libre del transportista se reemplazó por
// un segmented control de modo (Transportista | Entrega directa) + select
// cerrado contra el catálogo canónico (tabla `transportistas`).

import { useEffect, useRef, useState } from "react";
import type { GuiaItem, ModoEntrega, Transportista } from "./types";
import AddNewInline from "./AddNewInline";
import ClienteTypeahead from "./ClienteTypeahead";
import EmpresaCombobox from "./EmpresaCombobox";
import { ScrollableTable } from "@/components/ui";

// Fallback offline: las 8 empresas canónicas (mismos nombres que
// empresa-mapping.ts, que es server-only y no se puede importar acá). El orden
// real por frecuencia llega de /api/guias/frecuencias; esto solo cubre el caso
// sin red para que el combobox nunca quede vacío.
const FALLBACK_EMPRESAS = [
  "Vistana International",
  "Fashion Wear",
  "Fashion Shoes",
  "Active Shoes",
  "Active Wear",
  "Joystep",
  "Confecciones Boston",
  "Multifashion",
];

interface GuiaFormProps {
  editingId: string | null;
  formNumero: number;
  fecha: string;
  setFecha: (v: string) => void;
  modoEntrega: ModoEntrega;
  setModoEntrega: (v: ModoEntrega) => void;
  transportistaId: string | null;
  setTransportistaId: (v: string | null) => void;
  entregadoPor: string;
  setEntregadoPor: (v: string) => void;
  observaciones: string;
  setObservaciones: (v: string) => void;
  numeroGuiaTransp: string;
  setNumeroGuiaTransp: (v: string) => void;
  items: GuiaItem[];
  transportistas: Transportista[];
  clientes: string[];
  direcciones: string[];
  validationErrors: Set<string>;
  error: string | null;
  saving: boolean;
  onAddCliente: (v: string) => void;
  onAddDireccion: (v: string) => void;
  onUpdateItem: (idx: number, field: keyof GuiaItem, value: string | number) => void;
  onUpdateItemFields: (idx: number, partial: Partial<GuiaItem>) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  onSave: (opts?: { silent?: boolean }) => void;
  onCancel: () => void;
}

export default function GuiaForm({
  editingId, formNumero, fecha, setFecha,
  modoEntrega, setModoEntrega, transportistaId, setTransportistaId,
  entregadoPor, setEntregadoPor, observaciones, setObservaciones,
  numeroGuiaTransp, setNumeroGuiaTransp,
  items, transportistas, clientes, direcciones,
  validationErrors, error, saving,
  onAddCliente, onAddDireccion,
  onUpdateItem, onUpdateItemFields, onAddRow, onRemoveRow, onSave, onCancel,
}: GuiaFormProps) {
  const totalBultos = items.reduce((s, i) => s + (i.bultos || 0), 0);

  // Real-time onBlur validation
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  function handleBlur(field: string) { setTouched((prev) => ({ ...prev, [field]: true })); }
  function fieldError(field: string, value: string) { return touched[field] && !value.trim(); }

  // Dynamic "Despachado por" list (persisted in localStorage)
  const DEFAULT_ENTREGADORES = ["Julio", "Rodrigo"];
  const [entregadores, setEntregadores] = useState(DEFAULT_ENTREGADORES);
  const [entregadoPorOtro, setEntregadoPorOtro] = useState("");
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("fg_entregadores") || "[]") as string[];
      const merged = [...DEFAULT_ENTREGADORES];
      for (const s of stored) { if (s && !merged.includes(s)) merged.push(s); }
      setEntregadores(merged);
    } catch { /* */ }
  }, []);
  function addEntregador(name: string) {
    if (!name.trim()) return;
    const n = name.trim();
    const updated = [...entregadores, n];
    setEntregadores(updated);
    const custom = updated.filter(s => !DEFAULT_ENTREGADORES.includes(s));
    localStorage.setItem("fg_entregadores", JSON.stringify(custom));
    setEntregadoPor(n);
    setEntregadoPorOtro("");
  }

  // "Más usados arriba": clientes (por cliente_codigo) y orden de las 8 empresas
  // canónicas, ambos por frecuencia de uso en guías. Aditivo y best-effort.
  const [clientesTop, setClientesTop] = useState<{ codigo: string; nombre: string }[]>([]);
  const [empresaOptions, setEmpresaOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancel = false;
    fetch("/api/guias/frecuencias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel || !d) return;
        if (Array.isArray(d.clientes)) setClientesTop(d.clientes);
        if (Array.isArray(d.empresas)) setEmpresaOptions(d.empresas);
      })
      .catch(() => { /* offline: cae al fallback de empresas */ });
    return () => { cancel = true; };
  }, []);
  const empresaOpts = empresaOptions.length > 0 ? empresaOptions : FALLBACK_EMPRESAS;

  // Undo delete row
  const [undoRow, setUndoRow] = useState<{ idx: number; item: GuiaItem; timer: ReturnType<typeof setTimeout> } | null>(null);
  function handleRemoveRow(idx: number) {
    const removed = items[idx];
    onRemoveRow(idx);
    if (undoRow) clearTimeout(undoRow.timer);
    const timer = setTimeout(() => setUndoRow(null), 3000);
    setUndoRow({ idx, item: removed, timer });
  }
  function handleUndoRemove() {
    if (!undoRow) return;
    clearTimeout(undoRow.timer);
    onAddRow();
    setTimeout(() => {
      const lastIdx = items.length;
      onUpdateItem(lastIdx, "cliente", undoRow.item.cliente);
      onUpdateItem(lastIdx, "direccion", undoRow.item.direccion);
      onUpdateItem(lastIdx, "empresa", undoRow.item.empresa);
      onUpdateItem(lastIdx, "facturas", undoRow.item.facturas);
      onUpdateItem(lastIdx, "bultos", undoRow.item.bultos);
    }, 0);
    setUndoRow(null);
  }

  // Track unsaved changes
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const changeCount = useRef(0);

  // Mark dirty on any change
  useEffect(() => {
    changeCount.current++;
    if (changeCount.current > 1) setDirty(true);
  }, [fecha, modoEntrega, transportistaId, entregadoPor, observaciones, numeroGuiaTransp, items]);

  // Auto-save with debounce (only when editing existing guía)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlight = useRef(false);
  useEffect(() => {
    if (!editingId || !dirty || saving || autoSaveInFlight.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const hasItems = items.some(i => i.cliente && i.direccion && i.empresa && i.facturas && i.bultos > 0);
      const hasModo = modoEntrega === "entrega_directa" || (modoEntrega === "transportista" && !!transportistaId);
      const hasHeader = fecha.trim() && hasModo && entregadoPor.trim();
      if (hasItems && hasHeader && !autoSaveInFlight.current) {
        console.log("[guia] autosave trigger", { items: items.length });
        autoSaveInFlight.current = true;
        try { handleSave({ silent: true }); } finally { autoSaveInFlight.current = false; }
      }
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dirty, editingId, saving]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (dirty && !saving) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, saving]);

  function handleSave(opts?: { silent?: boolean }) {
    onSave(opts);
    setDirty(false);
    setLastSaved(new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }));
  }

  function inputClass(key: string, base: string, touchedKey?: string, touchedValue?: string) {
    const hasSubmitError = validationErrors.has(key) || validationErrors.has(key + "-format") || validationErrors.has(key + "-separator");
    const hasTouchedError = touchedKey !== undefined && touchedValue !== undefined && touched[touchedKey] && !touchedValue.trim();
    const mobileSize = base.includes("text-sm") ? base.replace("text-sm", "text-base md:text-sm") : base;
    const mobilePadding = mobileSize.includes("py-2") ? mobileSize.replace("py-2", "py-3 md:py-2") : mobileSize.includes("py-1") ? mobileSize.replace("py-1", "py-2 md:py-1") : mobileSize;
    return `${mobilePadding} ${hasSubmitError || hasTouchedError ? "border-red-400" : ""}`;
  }

  const saveStatus = saving ? "saving" : dirty ? "dirty" : lastSaved ? "saved" : null;

  function SaveButton({ size = "normal" }: { size?: "normal" | "small" }) {
    const cls = size === "small"
      ? "bg-black text-white px-4 py-2 rounded-md text-xs font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40"
      : "bg-black text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40";
    return (
      <button type="button" onClick={() => handleSave()} disabled={saving || !items.some(i => i.cliente)} className={cls}>
        {saving ? "Guardando..." : editingId ? "Guardar Cambios" : "Guardar Guía"}
      </button>
    );
  }

  function StatusBadge() {
    if (saveStatus === "saving") return <span className="text-sm text-gray-400">Guardando...</span>;
    if (saveStatus === "dirty") return <span className="text-sm text-orange-500">Sin guardar</span>;
    if (saveStatus === "saved") return <span className="text-sm text-green-600 animate-save-flash">Listo, guardado {lastSaved}</span>;
    return null;
  }

  const transportistaError =
    validationErrors.has("transportista") ||
    (touched["transportista"] && modoEntrega === "transportista" && !transportistaId);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition">← Guías</button>
          <span className="text-sm text-gray-300 font-mono">GT-{String(formNumero).padStart(3, "0")}</span>
          <StatusBadge />
        </div>
        <SaveButton size="small" />
      </div>

      <div className="flex flex-wrap items-baseline gap-4 mb-6">
        <h1 className="text-xl font-light tracking-tight">
          {editingId ? "Editar" : "Nueva"} Guía de Transporte
        </h1>
      </div>

      {/* Header fields */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-4">Información General</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
          <div>
            <label className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-1 block">Fecha <span className="text-red-500">*</span></label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} onBlur={() => handleBlur("fecha")}
              className={inputClass("fecha", "w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition", "fecha", fecha)} />
            {fieldError("fecha", fecha) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-1 block">
              Modo de entrega <span className="text-red-500">*</span>
            </label>
            {/* Segmented control modo_entrega */}
            <div className="flex rounded-lg bg-gray-100 p-0.5 mb-3">
              <button
                type="button"
                onClick={() => { setModoEntrega("transportista"); handleBlur("transportista"); }}
                className={`flex-1 text-sm py-2 px-3 rounded-md transition font-medium ${modoEntrega === "transportista" ? "bg-white text-black border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
                Transportista
              </button>
              <button
                type="button"
                onClick={() => { setModoEntrega("entrega_directa"); setTransportistaId(null); }}
                className={`flex-1 text-sm py-2 px-3 rounded-md transition font-medium ${modoEntrega === "entrega_directa" ? "bg-white text-black border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
                Entrega directa
              </button>
            </div>
            {modoEntrega === "transportista" ? (
              <>
                <select
                  value={transportistaId || ""}
                  onChange={e => setTransportistaId(e.target.value || null)}
                  onBlur={() => handleBlur("transportista")}
                  className={inputClass("transportista", "w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none")}
                >
                  <option value="">Seleccionar transportista...</option>
                  {transportistas.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
                {transportistaError && (
                  <p className="text-red-500 text-xs mt-0.5">Selecciona un transportista</p>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500 italic">
                Esta guía se entrega directamente, sin transportista externo.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-1 block">
              Despachado por <span className="text-red-500">*</span>
              <AddNewInline placeholder="Nombre" onAdd={addEntregador} />
            </label>
            <select value={entregadoPor} onChange={e => setEntregadoPor(e.target.value)}
              className={inputClass("entregadoPor", "w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none")}>
              <option value="">Seleccionar...</option>
              {entregadores.map(e => <option key={e} value={e}>{e}</option>)}
              <option value="__other__">Otro...</option>
            </select>
            {entregadoPor === "__other__" && (
              <input type="text" placeholder="Nombre de quien entrega" value={entregadoPorOtro}
                onChange={e => setEntregadoPorOtro(e.target.value)}
                onBlur={() => { if (entregadoPorOtro.trim()) addEntregador(entregadoPorOtro); }}
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition mt-3" />
            )}
          </div>

          {/* N° guía del transportista — solo con transportista; opcional al
              crear (obligatorio al despachar). En entrega directa no aplica. */}
          {modoEntrega === "transportista" && (
            <div>
              <label className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-1 block">
                N° guía del transportista <span className="text-gray-300 normal-case tracking-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={numeroGuiaTransp}
                onChange={e => setNumeroGuiaTransp(e.target.value)}
                placeholder="Lo puedes poner ahora o al despachar"
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
            </div>
          )}
        </div>
      </div>

      {/* Items table */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Detalle de Envío</div>
          <StatusBadge />
        </div>

        <datalist id="clientes-list">{clientes.map(c => <option key={c} value={c} />)}</datalist>
        <datalist id="direcciones-list">{direcciones.map(d => <option key={d} value={d} />)}</datalist>

        {validationErrors.has("items-empty") && (
          <p className="text-red-500 text-xs mb-3">Agrega al menos un envío con todos los campos completos.</p>
        )}

        <ScrollableTable minWidth={800}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-400">
              <th className="py-3 px-4 font-normal w-10 text-left">#</th>
              <th className="py-3 px-4 font-normal text-left">Cliente <span className="text-red-500">*</span><AddNewInline placeholder="Cliente" onAdd={onAddCliente} /></th>
              <th className="py-3 px-4 font-normal text-left">Dirección <span className="text-red-500">*</span><AddNewInline placeholder="Ciudad" onAdd={onAddDireccion} /></th>
              <th className="py-3 px-4 font-normal text-left">Empresa <span className="text-red-500">*</span></th>
              <th className="py-3 px-4 font-normal text-left">Factura(s) <span className="text-red-500">*</span><div className="text-xs text-gray-400 mt-0.5 font-normal normal-case tracking-normal">Ej: 10234, 10235</div></th>
              <th className="py-3 px-4 font-normal w-20 text-center">Bultos <span className="text-red-500">*</span></th>
              <th className="py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-2 text-gray-300">{idx + 1}</td>
                <td className="py-2 pr-2">
                  <ClienteTypeahead
                    value={item.cliente}
                    codigo={item.cliente_codigo || ""}
                    topClientes={clientesTop}
                    onSelect={(nombre, codigo) => onUpdateItemFields(idx, { cliente: nombre, cliente_codigo: codigo })}
                    onFreeText={(texto) => onUpdateItemFields(idx, { cliente: texto, cliente_codigo: "" })}
                    onBlur={() => handleBlur(`item-${idx}-cliente`)}
                    hasError={fieldError(`item-${idx}-cliente`, item.cliente)}
                    inputClassName={inputClass(`item-${idx}-cliente`, "w-full border-b border-gray-200 py-1 pr-16 text-sm outline-none focus:border-black transition", `item-${idx}-cliente`, item.cliente)}
                  />
                  {fieldError(`item-${idx}-cliente`, item.cliente) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
                </td>
                <td className="py-2 pr-2">
                  <input list="direcciones-list" type="text" value={item.direccion} onChange={e => onUpdateItem(idx, "direccion", e.target.value)} onBlur={() => handleBlur(`item-${idx}-direccion`)}
                    className={inputClass(`item-${idx}-direccion`, "w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-black transition", `item-${idx}-direccion`, item.direccion)} />
                  {fieldError(`item-${idx}-direccion`, item.direccion) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
                </td>
                <td className="py-2 pr-2">
                  <EmpresaCombobox
                    value={item.empresa}
                    onChange={(v) => onUpdateItem(idx, "empresa", v)}
                    options={empresaOpts}
                    onBlur={() => handleBlur(`item-${idx}-empresa`)}
                    placeholder="Empresa…"
                    inputClassName={inputClass(`item-${idx}-empresa`, "w-full border-b border-gray-200 py-1 text-sm outline-none bg-transparent focus:border-black transition", `item-${idx}-empresa`, item.empresa)}
                  />
                  {fieldError(`item-${idx}-empresa`, item.empresa) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
                </td>
                <td className="py-2 pr-2">
                  <input type="text" value={item.facturas} onChange={e => onUpdateItem(idx, "facturas", e.target.value)} onBlur={() => handleBlur(`item-${idx}-facturas`)}
                    className={inputClass(`item-${idx}-facturas`, "w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-black transition", `item-${idx}-facturas`, item.facturas)} />
                  {fieldError(`item-${idx}-facturas`, item.facturas) && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
                  {validationErrors.has(`item-${idx}-facturas-separator`) && <p className="text-xs text-red-500 mt-0.5">Separar con coma y espacio (ej: FA-001, FA-002)</p>}
                  {validationErrors.has(`item-${idx}-facturas-format`) && !validationErrors.has(`item-${idx}-facturas-separator`) && <p className="text-xs text-red-500 mt-0.5">Mín. 4 dígitos por factura</p>}
                </td>
                <td className="py-2 pr-2">
                  <input type="number" min={0} value={item.bultos || ""} placeholder="0" onChange={e => onUpdateItem(idx, "bultos", parseInt(e.target.value) || 0)} onBlur={() => handleBlur(`item-${idx}-bultos`)}
                    className={inputClass(`item-${idx}-bultos`, "w-full border-b border-gray-200 py-1 text-sm outline-none text-center focus:border-black transition", `item-${idx}-bultos`, String(item.bultos || ""))} />
                  {touched[`item-${idx}-bultos`] && !item.bultos && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
                </td>
                <td className="py-2 text-center">
                  {items.length > 1 && <button onClick={() => handleRemoveRow(idx)} className="text-gray-400 hover:text-red-500 transition text-sm">×</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </ScrollableTable>

        <div className="mt-3">
          <button type="button" onClick={onAddRow} className="text-sm text-gray-400 hover:text-black transition">+ Agregar fila</button>
        </div>
      </div>

      {/* Observaciones */}
      <div className="mb-6">
        <label className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-1 block">Observaciones (opcional)</label>
        <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
          className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
      </div>

      {/* Footer */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.05em] text-gray-400">Total de bultos:</span>
          <span className="text-lg font-semibold tabular-nums">{totalBultos}</span>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      <div className="flex flex-wrap items-center gap-6">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition min-h-[44px] px-2">Cancelar</button>
        <StatusBadge />
      </div>

      {/* Undo delete row toast */}
      {undoRow && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2.5 rounded-lg border border-gray-700 flex items-center gap-3 z-50 text-sm">
          <span>Fila eliminada</span>
          <button onClick={handleUndoRemove} className="font-medium underline hover:no-underline">Deshacer</button>
        </div>
      )}
    </div>
  );
}
