"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { validateFotoFile } from "./fotoUpload";

interface Props {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  /** Sube comprobante: foto obligatoria + nota opcional → pasa a "En proceso". */
  onSubmit: (file: File, nota: string) => void;
}

/**
 * Modal para pasar un reclamo de "Creado" → "En proceso".
 * EXIGE una foto de comprobante (no deja continuar sin ella). Nota opcional.
 * Reusa validateFotoFile/compressImage del flujo de fotos de reclamos.
 */
export default function ComprobanteModal({ open, submitting, onClose, onSubmit }: Props) {
  useBodyScrollLock(open);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setFile(null); setPreview(null); setNota(""); setError(null); }
  }, [open]);

  // Libera el object URL del preview al cambiarlo/cerrar.
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  if (!open) return null;

  const pick = (f: File | null) => {
    if (!f) return;
    const err = validateFotoFile(f);
    if (err) { setError(err); return; }
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const confirm = () => {
    if (!file) { setError("Toma o elige una foto del comprobante para continuar."); return; }
    onSubmit(file, nota.trim());
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Pasar a “En proceso”</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Sube una <b>foto del comprobante</b> (obligatoria) y, si quieres, una nota.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />

        {preview ? (
          <div className="mt-4">
            <div className="relative overflow-hidden rounded-md border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Comprobante" className="max-h-56 w-full object-contain bg-gray-50" />
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-2 text-xs font-medium text-blue-600 hover:underline"
            >
              Cambiar foto
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-4 flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-7 text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
            <span className="text-sm font-medium">Tomar / elegir foto del comprobante</span>
          </button>
        )}

        <label className="mt-4 block">
          <span className="text-[11px] text-gray-500">Nota (opcional)</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. enviado al proveedor, esperando nota de crédito…"
            rows={2}
            className="mt-1 w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black transition"
          />
        </label>

        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => { if (!submitting) onClose(); }}
            disabled={submitting}
            className="flex-1 rounded-md border border-gray-200 py-2 text-sm hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={submitting || !file}
            className="flex-1 rounded-md bg-black py-2 text-sm text-white active:scale-[0.97] transition disabled:opacity-50"
          >
            {submitting ? "Subiendo..." : "Pasar a En proceso"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
