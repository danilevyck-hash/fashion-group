"use client";

import { useEffect, useState } from "react";
import { ModalOverlay } from "@/components/ui";
import type { ConsolidatedClient } from "@/lib/types";
import { composeEmailHtml } from "@/lib/cxc/estado-cuenta-email";

// El código Switch (D-XXX) es el mismo en todas las empresas del cliente.
function codigoDe(client: ConsolidatedClient): string | null {
  return Object.values(client.companies).find((c) => c?.codigo)?.codigo ?? null;
}
function nombreDe(client: ConsolidatedClient): string {
  return Object.values(client.companies).find((c) => c?.nombre)?.nombre ?? client.nombre_normalized;
}

interface PreviewData {
  destinatario: string;
  asunto: string;
  cuerpo: string;
  firma: string;
  tablaHtml: string;
  empresasNombres: string[];
  sharedCount: number;
  mes: string;
  totalDocs: number;
  remitenteEmail: string | null;
}

interface Props {
  client: ConsolidatedClient | null;
  companyFilter: string;
  onClose: () => void;
  onSent: (msg: string) => void;
}

export default function EnviarEmailModal({ client, companyFilter, onClose, onSent }: Props) {
  const open = !!client;
  const codigo = client ? codigoDe(client) : null;
  const nombre = client ? nombreDe(client) : "";
  const nombreNormalizado = client?.nombre_normalized ?? "";
  const empresaScope = companyFilter === "all" ? "todas" : companyFilter;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [destinatario, setDestinatario] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !codigo) return;
    let cancel = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    const params = new URLSearchParams({
      codigo,
      empresa: empresaScope,
      nombre,
      nombreNormalizado,
    });
    fetch(`/api/cxc/enviar-email?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: PreviewData) => {
        if (cancel) return;
        setPreview(d);
        setDestinatario(d.destinatario);
        setAsunto(d.asunto);
        setCuerpo(d.cuerpo);
      })
      .catch(() => { if (!cancel) setError("No se pudo preparar el correo. Intenta de nuevo."); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [open, codigo, empresaScope, nombre, nombreNormalizado]);

  async function handleSend() {
    if (!client || !codigo || !preview) return;
    if (!destinatario.trim()) { setError("Escribe un correo de destino."); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/cxc/enviar-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          nombre,
          nombreNormalizado,
          empresa: empresaScope,
          destinatario: destinatario.trim(),
          asunto: asunto.trim(),
          cuerpo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "No se pudo enviar el correo. Intenta de nuevo.");
        setSending(false);
        return;
      }
      onSent(
        data?.logged === false
          ? "Correo enviado (no se pudo registrar en la bitácora)"
          : "Correo enviado",
      );
      onClose();
    } catch {
      setError("No se pudo enviar el correo. Intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  const previewHtml = preview
    ? composeEmailHtml({ cuerpo, tablaHtml: preview.tablaHtml, firma: preview.firma })
    : "";

  return (
    <ModalOverlay onBackdropClick={sending ? undefined : onClose} align="start">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white sm:rounded-lg rounded-t-2xl w-full sm:max-w-2xl mx-0 sm:mx-4 my-0 sm:my-8 border border-gray-200 max-h-[92vh] flex flex-col"
      >
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Enviar estado de cuenta</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {nombre}{codigo ? ` · ${codigo}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="text-gray-400 hover:text-gray-700 transition disabled:opacity-50 -mr-1 p-1"
            aria-label="Cerrar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 bg-gray-100 rounded-md" />
              <div className="h-10 bg-gray-100 rounded-md" />
              <div className="h-28 bg-gray-100 rounded-md" />
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {preview && !loading && (
            <>
              {preview.totalDocs === 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Este cliente no tiene documentos con saldo en el alcance seleccionado.
                </p>
              )}

              {preview.sharedCount >= 10 && (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Este correo está registrado en {preview.sharedCount} clientes distintos. Verifica que sea el destinatario correcto.
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Para</label>
                <input
                  type="email"
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  placeholder="correo@cliente.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {!preview.destinatario && (
                  <p className="text-xs text-gray-400 mt-1">Este cliente no tenía correo registrado. Escríbelo arriba.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
                <input
                  type="text"
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje</label>
                <textarea
                  value={cuerpo}
                  onChange={(e) => setCuerpo(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                />
                <p className="text-xs text-gray-400 mt-1">
                  La tabla de saldos se arma automáticamente y no se edita. Se adjunta un PDF por empresa.
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Vista previa</p>
                <div className="border border-gray-200 rounded-md overflow-auto max-h-[45vh] bg-gray-50 p-3">
                  {/* HTML de confianza: lo arma el servidor (datos escapados) y el
                      cuerpo editable se escapa dentro de composeEmailHtml. */}
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-700 transition active:scale-[0.97] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || loading || !preview || !destinatario.trim()}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-black px-5 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-50"
          >
            {sending ? "Enviando…" : "Enviar correo"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
