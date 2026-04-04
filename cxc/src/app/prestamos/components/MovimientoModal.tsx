"use client";

import { useEffect } from "react";
import { MOV_TYPES } from "./types";

interface Props {
  show: boolean;
  step: "type" | "form";
  mLabel: string;
  mConcepto: string;
  mFecha: string;
  mMonto: string;
  mNotas: string;
  saving: boolean;
  onClose: () => void;
  onSelectType: (typeKey: string) => void;
  onBack: () => void;
  onChangeFecha: (v: string) => void;
  onChangeMonto: (v: string) => void;
  onChangeNotas: (v: string) => void;
  onSave: () => void;
}

export default function MovimientoModal({
  show, step, mLabel, mConcepto, mFecha, mMonto, mNotas, saving,
  onClose, onSelectType, onBack, onChangeFecha, onChangeMonto, onChangeNotas, onSave,
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
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
        {step === "type" ? (
          <>
            <h2 className="font-medium mb-4">Nuevo Movimiento</h2>
            <div className="grid grid-cols-2 gap-2">
              {MOV_TYPES.map((t) => (
                <button key={t.key} onClick={() => onSelectType(t.key)} className={`border rounded-lg px-3 py-3 text-left transition ${t.color}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{t.icon}</span>
                    <span className="text-xs font-medium">{t.label}</span>
                  </div>
                  <span className="text-[10px] opacity-60">Signo: {t.sign}</span>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <button onClick={onClose} className="w-full py-2 border rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={onBack} className="text-gray-400 hover:text-black transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h2 className="font-medium">{mLabel}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 uppercase">Fecha *</label>
                <input type="date" value={mFecha} onChange={e => onChangeFecha(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase">Monto ($) *</label>
                <input type="number" step="0.01" min="0.01" value={mMonto} onChange={e => onChangeMonto(e.target.value)} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="0.00" />
              </div>
              {(mConcepto === "Préstamo" || mConcepto === "Responsabilidad por daño") && Number(mMonto) >= 500 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 sm:col-span-2">
                  ⚠ Este movimiento requiere aprobación por el monto (≥ $500)
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-400 uppercase">Notas</label>
                <textarea value={mNotas} onChange={e => onChangeNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={onSave} disabled={saving} className="flex-1 py-2 bg-black text-white rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50">
                {saving ? "Guardando..." : "Registrar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
