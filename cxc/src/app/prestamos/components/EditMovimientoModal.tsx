"use client";

import { useEffect } from "react";

interface Props {
  show: boolean;
  emFecha: string;
  emConcepto: string;
  emMonto: string;
  emNotas: string;
  saving: boolean;
  onClose: () => void;
  onChangeFecha: (v: string) => void;
  onChangeConcepto: (v: string) => void;
  onChangeMonto: (v: string) => void;
  onChangeNotas: (v: string) => void;
  onSave: () => void;
}

export default function EditMovimientoModal({
  show, emFecha, emConcepto, emMonto, emNotas, saving,
  onClose, onChangeFecha, onChangeConcepto, onChangeMonto, onChangeNotas, onSave,
}: Props) {
  useEffect(() => {
    if (!show) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-medium mb-4">Editar Movimiento</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase">Fecha *</label>
            <input type="date" value={emFecha} onChange={e => onChangeFecha(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Concepto</label>
            <select value={emConcepto} disabled title="El tipo de movimiento no se puede cambiar" className="w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent text-gray-400 cursor-not-allowed">
              <option value="Préstamo">Préstamo</option>
              <option value="Pago">Pago</option>
              <option value="Abono extra">Abono extra</option>
              <option value="Responsabilidad por daño">Responsabilidad por daño</option>
              <option value="Pago de responsabilidad">Pago de responsabilidad</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Monto ($) *</label>
            <input type="number" step="0.01" min="0.01" value={emMonto} onChange={e => onChangeMonto(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Notas</label>
            <textarea value={emNotas} onChange={e => onChangeNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
          <button onClick={onSave} disabled={saving} className="flex-1 py-2 bg-black text-white rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
