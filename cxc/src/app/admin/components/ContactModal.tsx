"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui";

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
  clientName: string;
  initialResultado?: string;
  initialProximoSeguimiento?: string;
  onSave: (data: { resultado_contacto: string; proximo_seguimiento: string; metodo: string }) => Promise<void>;
}

const METODOS = ["WhatsApp", "Llamada", "Email", "Visita"] as const;

export default function ContactModal({
  open,
  onClose,
  clientName,
  initialResultado = "",
  initialProximoSeguimiento = "",
  onSave,
}: ContactModalProps) {
  const [resultado, setResultado] = useState(initialResultado);
  const [proximoSeguimiento, setProximoSeguimiento] = useState(initialProximoSeguimiento);
  const [metodo, setMetodo] = useState<string>("WhatsApp");
  const [saving, setSaving] = useState(false);

  // Sync initial values each time the modal opens
  useEffect(() => {
    if (open) {
      setResultado(initialResultado);
      setProximoSeguimiento(initialProximoSeguimiento);
      setMetodo("WhatsApp");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ resultado_contacto: resultado, proximo_seguimiento: proximoSeguimiento, metodo });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar Contacto">
      <div className="text-xs text-gray-500 mb-4 -mt-2">{clientName}</div>
      <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
        {/* Método */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Método de contacto</label>
          <div className="flex gap-2 flex-wrap">
            {METODOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodo(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  metodo === m
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Resultado */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Resultado del contacto</label>
          <input
            type="text"
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            placeholder='Ej: "Promesa de pago 15/04", "No contesta", "Acuerdo parcial"'
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
        </div>

        {/* Próximo seguimiento */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Fecha próximo seguimiento</label>
          <input
            type="date"
            value={proximoSeguimiento}
            onChange={(e) => setProximoSeguimiento(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-full hover:bg-gray-800 transition disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-gray-200 text-gray-600 text-sm px-4 py-2.5 rounded-full hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
