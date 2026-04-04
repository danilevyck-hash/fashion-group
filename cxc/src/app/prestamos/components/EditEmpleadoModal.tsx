"use client";

import { useEffect } from "react";
import { EMPRESAS } from "@/lib/companies";

interface Props {
  show: boolean;
  fNombre: string;
  fEmpresa: string;
  fDeduccion: string;
  fNotas: string;
  saving: boolean;
  onClose: () => void;
  onChangeNombre: (v: string) => void;
  onChangeEmpresa: (v: string) => void;
  onChangeDeduccion: (v: string) => void;
  onChangeNotas: (v: string) => void;
  onSave: () => void;
}

export default function EditEmpleadoModal({
  show, fNombre, fEmpresa, fDeduccion, fNotas, saving,
  onClose, onChangeNombre, onChangeEmpresa, onChangeDeduccion, onChangeNotas, onSave,
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
        <h2 className="font-medium mb-4">Editar Empleado</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase">Nombre *</label>
            <input value={fNombre} onChange={e => onChangeNombre(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Empresa</label>
            <select value={fEmpresa} onChange={e => onChangeEmpresa(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
              <option value="">Sin asignar</option>
              {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Deducción Quincenal ($)</label>
            <input type="number" step="0.01" min="0" value={fDeduccion} onChange={e => onChangeDeduccion(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Notas</label>
            <textarea value={fNotas} onChange={e => onChangeNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
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
