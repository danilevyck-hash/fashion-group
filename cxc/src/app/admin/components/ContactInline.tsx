"use client";

import { useState, useEffect } from "react";

interface ContactInlineProps {
  clientName: string;
  initialResultado?: string;
  initialProximoSeguimiento?: string;
  onSave: (data: { resultado_contacto: string; proximo_seguimiento: string; metodo: string }) => Promise<void>;
  onClose: () => void;
}

const METODOS = [
  { key: "WhatsApp", icon: "wa", label: "WhatsApp" },
  { key: "Email", icon: "email", label: "Email" },
  { key: "Llamada", icon: "phone", label: "Llamada" },
  { key: "Otro", icon: "other", label: "Otro" },
] as const;

const RESULTADOS = ["Pago", "Pagara", "Prometio", "No contactable"] as const;

export default function ContactInline({
  clientName,
  initialResultado = "",
  initialProximoSeguimiento = "",
  onSave,
  onClose,
}: ContactInlineProps) {
  const [metodo, setMetodo] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);
  const [resultado, setResultado] = useState(initialResultado);
  const [resultadoCustom, setResultadoCustom] = useState("");
  const [proximoSeguimiento, setProximoSeguimiento] = useState(initialProximoSeguimiento);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // If there's an existing resultado that's not one of the presets, put it in custom
  useEffect(() => {
    if (initialResultado && !(RESULTADOS as readonly string[]).includes(initialResultado)) {
      setResultadoCustom(initialResultado);
      setResultado("");
    }
  }, [initialResultado]);

  async function handleSave() {
    if (!metodo) return;
    setSaving(true);
    try {
      const finalResultado = resultado || resultadoCustom;
      await onSave({
        resultado_contacto: finalResultado,
        proximo_seguimiento: proximoSeguimiento,
        metodo,
      });
      setSaved(true);
      setTimeout(() => onClose(), 1200);
    } finally {
      setSaving(false);
    }
  }

  // Quick save: just method, no details
  async function handleQuickSave(m: string) {
    setMetodo(m);
    if (!showDetails) {
      // If details panel is closed, save immediately with just the method
      setSaving(true);
      try {
        await onSave({
          resultado_contacto: "",
          proximo_seguimiento: "",
          metodo: m,
        });
        setSaved(true);
        setTimeout(() => onClose(), 1200);
      } finally {
        setSaving(false);
      }
    }
  }

  if (saved) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mx-4 my-2 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span className="text-xs text-emerald-700 font-medium">Contacto registrado via {metodo}</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg mx-4 my-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {/* Step 1: Choose method */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Registrar contacto</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {METODOS.map((m) => (
            <button
              key={m.key}
              type="button"
              disabled={saving}
              onClick={() => {
                if (showDetails) {
                  // Just select method, don't auto-save
                  setMetodo(m.key);
                } else {
                  handleQuickSave(m.key);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                metodo === m.key
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              } disabled:opacity-50`}
            >
              {m.key === "WhatsApp" && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              )}
              {m.key === "Email" && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              )}
              {m.key === "Llamada" && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              )}
              {m.key === "Otro" && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              )}
              {m.label}
            </button>
          ))}
        </div>

        {/* Toggle details */}
        {!showDetails && (
          <button
            onClick={() => { setShowDetails(true); if (!metodo) setMetodo("WhatsApp"); }}
            className="mt-2.5 text-[11px] text-purple-600 hover:text-purple-800 transition flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar resultado y seguimiento
          </button>
        )}
      </div>

      {/* Step 2: Optional details (collapsible) */}
      {showDetails && (
        <div className="px-4 pb-3 border-t border-gray-200 pt-3 space-y-3">
          {/* Resultado */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Resultado</label>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {RESULTADOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setResultado(r); setResultadoCustom(""); }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
                    resultado === r
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={resultadoCustom}
              onChange={(e) => { setResultadoCustom(e.target.value); setResultado(""); }}
              placeholder="O escribe un resultado personalizado..."
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
          </div>

          {/* Proximo seguimiento */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Proximo seguimiento</label>
            <input
              type="date"
              value={proximoSeguimiento}
              onChange={(e) => setProximoSeguimiento(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
          </div>

          {/* Save */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !metodo}
              className="bg-black text-white text-xs font-medium px-4 py-2 rounded-md hover:bg-gray-800 transition disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar contacto"}
            </button>
            <button
              onClick={() => setShowDetails(false)}
              disabled={saving}
              className="text-xs text-gray-500 hover:text-gray-700 transition px-3 py-2"
            >
              Ocultar detalles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
