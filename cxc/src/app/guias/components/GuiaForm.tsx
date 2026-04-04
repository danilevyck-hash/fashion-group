"use client";

import { useEffect, useRef, useState } from "react";
import type { GuiaItem } from "./types";
import AddNewInline from "./AddNewInline";

interface GuiaFormProps {
  editingId: string | null;
  formNumero: number;
  fecha: string;
  setFecha: (v: string) => void;
  transportista: string;
  setTransportista: (v: string) => void;
  transportistaOtro: string;
  setTransportistaOtro: (v: string) => void;
  entregadoPor: string;
  setEntregadoPor: (v: string) => void;
  observaciones: string;
  setObservaciones: (v: string) => void;
  items: GuiaItem[];
  transportistas: string[];
  clientes: string[];
  direcciones: string[];
  empresas: string[];
  validationErrors: Set<string>;
  error: string | null;
  saving: boolean;
  onAddTransportista: (v: string) => void;
  onAddCliente: (v: string) => void;
  onAddDireccion: (v: string) => void;
  onAddEmpresa: (v: string) => void;
  onUpdateItem: (idx: number, field: keyof GuiaItem, value: string | number) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function GuiaForm({
  editingId, formNumero, fecha, setFecha,
  transportista, setTransportista, transportistaOtro, setTransportistaOtro,
  entregadoPor, setEntregadoPor, observaciones, setObservaciones,
  items, transportistas, clientes, direcciones, empresas,
  validationErrors, error, saving,
  onAddTransportista, onAddCliente, onAddDireccion, onAddEmpresa,
  onUpdateItem, onAddRow, onRemoveRow, onSave, onCancel,
}: GuiaFormProps) {
  const totalBultos = items.reduce((s, i) => s + (i.bultos || 0), 0);

  // Dynamic "Entregado por" list (persisted in localStorage)
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
    // Re-insert at original position by adding row and updating it
    onAddRow();
    // After add, the new row is at the end — we need to update it with the removed data
    // Since we can't insert at position, we update the last item
    setTimeout(() => {
      const lastIdx = items.length; // after addRow, new item is at this index
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
  }, [fecha, transportista, transportistaOtro, entregadoPor, observaciones, items]);

  // Auto-save with debounce (only when editing existing guía)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlight = useRef(false);
  useEffect(() => {
    if (!editingId || !dirty || saving || autoSaveInFlight.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (items.some(i => i.cliente) && !autoSaveInFlight.current) {
        autoSaveInFlight.current = true;
        try { handleSave(); } finally { autoSaveInFlight.current = false; }
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

  // Wrap onSave to track status
  function handleSave() {
    onSave();
    setDirty(false);
    setLastSaved(new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }));
  }

  function inputClass(key: string, base: string) {
    return `${base} ${validationErrors.has(key) || validationErrors.has(key + "-format") || validationErrors.has(key + "-separator") ? "border-red-400" : ""}`;
  }

  // Save status indicator
  const saveStatus = saving ? "saving" : dirty ? "dirty" : lastSaved ? "saved" : null;

  function SaveButton({ size = "normal" }: { size?: "normal" | "small" }) {
    const cls = size === "small"
      ? "bg-black text-white px-4 py-2 rounded-md text-xs font-medium hover:bg-gray-800 transition disabled:opacity-40"
      : "bg-black text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40";
    return (
      <button onClick={handleSave} disabled={saving || !items.some(i => i.cliente)} className={cls}>
        {saving ? "Guardando..." : editingId ? "Guardar Cambios" : "Guardar Guía"}
      </button>
    );
  }

  function StatusBadge() {
    if (saveStatus === "saving") return <span className="text-xs text-gray-400">Guardando...</span>;
    if (saveStatus === "dirty") return <span className="text-xs text-orange-500">Sin guardar</span>;
    if (saveStatus === "saved") return <span className="text-xs text-green-600">Guardado ✓ {lastSaved}</span>;
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition">← Guías</button>
          <span className="text-sm text-gray-300 font-mono">GT-{String(formNumero).padStart(3, "0")}</span>
          <StatusBadge />
        </div>
        <SaveButton size="small" />
      </div>

      <div className="flex flex-wrap items-baseline gap-4 mb-10">
        <h1 className="text-xl font-light tracking-tight">
          {editingId ? "Editar" : "Nueva"} Guía de Transporte
        </h1>
      </div>

      {/* Header fields */}
      <div className="mb-10">
        <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">Información General</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
          <div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Fecha <span className="text-red-500">*</span></label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className={inputClass("fecha", "w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition")} />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
              Transportista <span className="text-red-500">*</span>
              <AddNewInline placeholder="Nombre" onAdd={onAddTransportista} />
            </label>
            <select value={transportista} onChange={e => setTransportista(e.target.value)}
              className={inputClass("transportista", "w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none")}>
              <option value="">Seleccionar...</option>
              {transportistas.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="__other__">Otro...</option>
            </select>
            {transportista === "__other__" && (
              <input type="text" placeholder="Nombre del transportista" value={transportistaOtro} onChange={e => setTransportistaOtro(e.target.value)}
                className={inputClass("transportista", "w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition mt-3")} />
            )}
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
              Entregado por <span className="text-red-500">*</span>
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
        </div>
      </div>

      {/* Items table */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Detalle de Envío</div>
          <StatusBadge />
        </div>

        <datalist id="clientes-list">{clientes.map(c => <option key={c} value={c} />)}</datalist>
        <datalist id="direcciones-list">{direcciones.map(d => <option key={d} value={d} />)}</datalist>

        {validationErrors.has("items-empty") && (
          <p className="text-red-500 text-xs mb-3">Agrega al menos un envío con todos los campos completos.</p>
        )}

        <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="min-w-[800px] px-4 sm:px-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
              <th className="py-3 px-4 font-normal w-10 text-left">#</th>
              <th className="py-3 px-4 font-normal text-left">Cliente <span className="text-red-500">*</span><AddNewInline placeholder="Cliente" onAdd={onAddCliente} /></th>
              <th className="py-3 px-4 font-normal text-left">Dirección <span className="text-red-500">*</span><AddNewInline placeholder="Ciudad" onAdd={onAddDireccion} /></th>
              <th className="py-3 px-4 font-normal text-left">Empresa <span className="text-red-500">*</span><AddNewInline placeholder="Empresa" onAdd={onAddEmpresa} /></th>
              <th className="py-3 px-4 font-normal text-left">Factura(s) <span className="text-red-500">*</span><div className="text-[9px] text-gray-400 mt-0.5 font-normal normal-case tracking-normal">Ej: 10234, 10235</div></th>
              <th className="py-3 px-4 font-normal w-20 text-center">Bultos <span className="text-red-500">*</span></th>
              <th className="py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-2 text-gray-300">{idx + 1}</td>
                <td className="py-2 pr-2">
                  <input list="clientes-list" type="text" value={item.cliente} onChange={e => onUpdateItem(idx, "cliente", e.target.value)}
                    className={inputClass(`item-${idx}-cliente`, "w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-black transition")} />
                </td>
                <td className="py-2 pr-2">
                  <input list="direcciones-list" type="text" value={item.direccion} onChange={e => onUpdateItem(idx, "direccion", e.target.value)}
                    className={inputClass(`item-${idx}-direccion`, "w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-black transition")} />
                </td>
                <td className="py-2 pr-2">
                  <select value={item.empresa} onChange={e => onUpdateItem(idx, "empresa", e.target.value)}
                    className={inputClass(`item-${idx}-empresa`, "w-full border-b border-gray-200 py-1 text-sm outline-none bg-transparent focus:border-black transition appearance-none")}>
                    <option value="">Seleccionar...</option>
                    {empresas.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <input type="text" value={item.facturas} onChange={e => onUpdateItem(idx, "facturas", e.target.value)}
                    className={inputClass(`item-${idx}-facturas`, "w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-black transition")} />
                  {validationErrors.has(`item-${idx}-facturas-separator`) && <p className="text-[9px] text-red-500 mt-0.5">Separar con coma y espacio (ej: FA-001, FA-002)</p>}
                  {validationErrors.has(`item-${idx}-facturas-format`) && !validationErrors.has(`item-${idx}-facturas-separator`) && <p className="text-[9px] text-red-500 mt-0.5">Mín. 4 dígitos por factura</p>}
                </td>
                <td className="py-2 pr-2">
                  <input type="number" min={0} value={item.bultos || ""} placeholder="0" onChange={e => onUpdateItem(idx, "bultos", parseInt(e.target.value) || 0)}
                    className={inputClass(`item-${idx}-bultos`, "w-full border-b border-gray-200 py-1 text-sm outline-none text-center focus:border-black transition")} />
                </td>
                <td className="py-2 text-center">
                  {items.length > 1 && <button onClick={() => handleRemoveRow(idx)} className="text-gray-400 hover:text-red-500 transition text-sm">×</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </div>

        <div className="mt-3">
          <button onClick={onAddRow} className="text-sm text-gray-400 hover:text-black transition">+ Agregar fila</button>
        </div>
      </div>

      {/* Observaciones */}
      <div className="mb-10">
        <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Observaciones (opcional)</label>
        <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
          className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
      </div>

      {/* Footer */}
      <div className="mb-10">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Total de bultos:</span>
          <span className="text-lg font-semibold tabular-nums">{totalBultos}</span>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      <div className="flex flex-wrap items-center gap-6">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition">Cancelar</button>
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
