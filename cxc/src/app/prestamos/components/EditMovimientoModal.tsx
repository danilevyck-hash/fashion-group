"use client";

import { useEffect } from "react";
import { CONCEPTO_PAGO, ORIGENES_PAGO, etiquetaConcepto } from "@/lib/prestamos-conceptos";

interface Props {
  show: boolean;
  emFecha: string;
  emConcepto: string;
  emMonto: string;
  emNotas: string;
  emOrigen: string;
  hoy: string;
  saving: boolean;
  onClose: () => void;
  onChangeFecha: (v: string) => void;
  onChangeMonto: (v: string) => void;
  onChangeNotas: (v: string) => void;
  onChangeOrigen: (v: string) => void;
  onSave: () => void;
}

/**
 * ⚠️ EL CONCEPTO NO SE PUEDE CAMBIAR y ya no se pinta como un `<select>`
 * deshabilitado: un desplegable apagado invita a intentarlo. Se muestra el
 * concepto y se dice por qué no se toca. Cambiarlo cambiaría el signo de una
 * plata ya registrada y el saldo se movería sin que nadie registrara nada.
 */
export default function EditMovimientoModal({
  show, emFecha, emConcepto, emMonto, emNotas, emOrigen, hoy, saving,
  onClose, onChangeFecha, onChangeMonto, onChangeNotas, onChangeOrigen, onSave,
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
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-medium mb-4">Editar movimiento</h2>
        <div className="space-y-4">
          <div>
            <div className="text-xs text-gray-400 uppercase">Concepto</div>
            <p className="py-2 text-sm text-gray-600">
              {etiquetaConcepto(emConcepto)}
              <span className="ml-2 text-xs text-gray-400">no se puede cambiar</span>
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Fecha *</label>
            <input type="date" max={hoy} value={emFecha} onChange={e => onChangeFecha(e.target.value)} className="w-full min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-xs text-gray-400 uppercase">Monto ($) *</label>
            <input type="number" step="0.01" min="0.01" value={emMonto} onChange={e => onChangeMonto(e.target.value)} className="w-full min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="0.00" />
          </div>
          {emConcepto === CONCEPTO_PAGO && (
            <div>
              <label className="text-xs text-gray-400 uppercase">De dónde salió</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {ORIGENES_PAGO.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onChangeOrigen(o)}
                    className={`min-h-[44px] rounded-md border px-3 text-sm transition ${
                      emOrigen === o ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 uppercase">Notas (opcional)</label>
            <textarea value={emNotas} onChange={e => onChangeNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 inline-flex min-h-[44px] items-center justify-center border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
          <button onClick={onSave} disabled={saving} className="flex-1 inline-flex min-h-[44px] items-center justify-center bg-black text-white rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
