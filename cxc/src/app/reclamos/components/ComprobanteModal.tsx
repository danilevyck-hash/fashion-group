"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { validateComprobanteFile } from "./fotoUpload";

interface Props {
  open: boolean;
  submitting: boolean;
  /** Si true, no deja continuar sin archivo (flujo a Pagado). Si false, el
   *  comprobante es opcional (flujo a En proceso). */
  requireFile: boolean;
  title: string;
  description: string;
  submitLabel: string;
  onClose: () => void;
  /** file puede ser null solo cuando requireFile=false. */
  onSubmit: (file: File | null, nota: string) => void;
}

/**
 * Modal de comprobante de un reclamo — acepta FOTO o PDF.
 * Dos usos: pasar a "En proceso" (comprobante opcional) y adjuntar el
 * comprobante obligatorio antes de marcar Pagado.
 */
export default function ComprobanteModal({ open, submitting, requireFile, title, description, submitLabel, onClose, onSubmit }: Props) {
  useBodyScrollLock(open);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset al abrir — EN RENDER, no en un efecto: el modal se queda montado con
  // `open=false`, así que un efecto limpiaría los campos un render TARDE y
  // useFormModalDismiss tomaría su foto sobre los valores viejos (creería que
  // hay cambios sin guardar y ya no dejaría cerrar con clic fuera / Escape).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setFile(null); setPreview(null); setNota(""); setError(null); }
  }

  // Libera el object URL del preview al cambiarlo/cerrar.
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  // Clic fuera + Escape = Cancelar. Si el usuario ya adjuntó el archivo o
  // escribió la nota, ninguno de los dos cierra: se sale con Cancelar o
  // subiendo. Bloqueado mientras se sube, igual que antes.
  const { panelRef, backdrop } = useFormModalDismiss(open, onClose, !submitting);

  if (!open) return null;

  const esPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

  const pick = (f: File | null) => {
    if (!f) return;
    const err = validateComprobanteFile(f);
    if (err) { setError(err); return; }
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(esPdf(f) ? null : URL.createObjectURL(f));
  };

  const confirm = () => {
    if (requireFile && !file) { setError("Adjunta una foto o PDF del comprobante para continuar."); return; }
    onSubmit(file, nota.trim());
  };

  return createPortal(
    <div
      {...backdrop}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <div className="mt-4">
            {preview ? (
              <div className="relative overflow-hidden rounded-md border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Comprobante" className="max-h-56 w-full object-contain bg-gray-50" />
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-800">{file.name}</div>
                  <div className="text-xs text-gray-400">PDF · {(file.size / 1024 / 1024).toFixed(1)}MB</div>
                </div>
              </div>
            )}
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-2 text-xs font-medium text-blue-600 hover:underline"
            >
              Cambiar archivo
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-4 flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-7 text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
            <span className="text-sm font-medium">Foto o PDF del comprobante{requireFile ? "" : " (opcional)"}</span>
          </button>
        )}

        <label className="mt-4 block">
          <span className="text-xs text-gray-500">Nota (opcional)</span>
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
            disabled={submitting || (requireFile && !file)}
            className="flex-1 rounded-md bg-black py-2 text-sm text-white active:scale-[0.97] transition disabled:opacity-50"
          >
            {submitting ? "Subiendo..." : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
