"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

interface EnviarProveedorModalProps {
  open: boolean;
  empresa: string;
  reclamoIds: string[];
  defaultTo: string;
  contactoNombre?: string;
  count: number;
  defaultSubject?: string;
  onClose: () => void;
  onSent: (msg: string) => void;
}

/**
 * Modal editable para "Enviar al proveedor": to / asunto / mensaje autocompletados
 * desde el contacto, todos editables. Al enviar, el server arma el ZIP y lo adjunta
 * (o manda un link firmado si pesa demasiado). Reusable desde la lista de empresas,
 * la selección múltiple y el detalle de un reclamo.
 */
export default function EnviarProveedorModal({
  open, empresa, reclamoIds, defaultTo, contactoNombre, count, defaultSubject, onClose, onSent,
}: EnviarProveedorModalProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Re-prefilla los campos cada vez que se abre
  useEffect(() => {
    if (!open) return;
    const nombre = (contactoNombre || "").trim() || "equipo";
    const plural = count === 1 ? "" : "s";
    setTo(defaultTo || "");
    setSubject(
      defaultSubject ||
        (count === 1 ? `Reclamo pendiente — ${empresa}` : `Reclamos pendientes — ${empresa} (${count})`),
    );
    setMessage(
      `Estimado/a ${nombre},\n\nAdjuntamos ${count} reclamo${plural} pendiente${plural} de ${empresa} con su evidencia fotográfica y el detalle en Excel. Quedamos en espera de la nota de crédito correspondiente.`,
    );
    setError(null);
  }, [open, defaultTo, defaultSubject, contactoNombre, count, empresa]);

  // Bloquea el scroll del body mientras está abierto (hook compartido, ref-count).
  useBodyScrollLock(open);

  // Escape para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sending, onClose]);

  if (!open || !mounted) return null;

  async function send() {
    const cleanTo = to.trim();
    if (!cleanTo) { setError("Falta el correo del destinatario."); return; }
    if (!subject.trim()) { setError("Falta el asunto."); return; }
    if (reclamoIds.length === 0) { setError("No hay reclamos seleccionados."); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/reclamos/proveedor/${encodeURIComponent(empresa)}/send-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reclamo_ids: reclamoIds, to: cleanTo, subject: subject.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "No se pudo enviar el correo.");
      }
      const data = await res.json().catch(() => ({}));
      const viaLink = data?.mode === "link" ? " (enlace de descarga)" : "";
      const omitidas = Number(data?.fotosOmitidas || 0);
      const aviso = omitidas > 0 ? ` · ${omitidas} foto${omitidas === 1 ? "" : "s"} no se pudo incluir` : "";
      onSent(`Correo enviado a ${cleanTo}${viaLink}${aviso}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el correo.");
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      onClick={() => { if (!sending) onClose(); }}
    >
      <div
        className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-medium">Enviar al proveedor</h2>
          <button onClick={() => { if (!sending) onClose(); }} className="text-gray-400 hover:text-black text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-400">
            {empresa} — {count} reclamo{count === 1 ? "" : "s"} · se adjunta el ZIP (Excel resumen + fotos)
          </p>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Para</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="correo@proveedor.com"
              className="w-full border border-gray-200 rounded-md px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:border-black transition"
            />
            <p className="text-[10px] text-gray-300 mt-1">Separa varios correos con coma.</p>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Asunto</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:border-black transition"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Mensaje</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-base sm:text-sm outline-none focus:border-black transition resize-y"
            />
            <p className="text-[10px] text-gray-300 mt-1">Debajo del mensaje se agrega automáticamente la tabla resumen y la descarga.</p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={() => { if (!sending) onClose(); }}
            disabled={sending}
            className="text-sm px-4 py-2 rounded-md text-gray-500 hover:text-black transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="text-sm bg-black text-white px-5 py-2 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {sending ? "Enviando…" : "Enviar correo"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
