"use client";

import { useEffect, useState } from "react";
import { ModalOverlay } from "@/components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Modal de confirmación de eliminación MASIVA de pedidos — COMPARTIDO
// Reebok/Joybees (paridad total de textos y layout).
//
// Separa explícito los dos destinos del soft-delete:
//   - "sin enviar": se eliminan de la lista y ya (no existen en Switch).
//   - "ya en Switch": aquí solo se OCULTAN — siguen vivos en Switch y hay que
//     anularlos en el panel. Se listan sus números y hay "Copiar números"
//     para llevárselos al panel de Switch.
//
// Patrón destructivo del repo (ConfirmDeleteModal): botón rojo con delay de
// 1s, Escape cierra, ModalOverlay con blur (useBodyScrollLock viene del
// overlay).
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkDeleteEnviadoRow {
  /** Key estable de la fila (fuente-id). */
  key: string;
  cliente: string;
  /** numero_interno del pedido en Switch. */
  numero: string;
}

export default function BulkDeletePedidosModal({
  open,
  sinEnviar,
  enviados,
  onConfirm,
  onCancel,
  loading = false,
}: {
  open: boolean;
  /** Cuántos pedidos seleccionados NO tienen envío activo en Switch. */
  sinEnviar: number;
  /** Pedidos seleccionados que YA están en Switch (envío activo). */
  enviados: BulkDeleteEnviadoRow[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setEnabled(false);
      setCopied(false);
      const t = setTimeout(() => setEnabled(true), 1000);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const total = sinEnviar + enviados.length;
  const confirmLabel = total === 1 ? "Eliminar pedido" : `Eliminar ${total} pedidos`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(enviados.map((e) => e.numero).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard no disponible — el usuario aún ve la lista para copiar a mano */
    }
  }

  return (
    <ModalOverlay onBackdropClick={onCancel} backdropClassName="bg-black/40 backdrop-blur-sm">
      <div
        className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-3">
          {total === 1 ? "¿Eliminar 1 pedido?" : `¿Eliminar ${total} pedidos?`}
        </h3>

        {sinEnviar > 0 && (
          <p className="text-sm text-gray-500 mb-3">
            {sinEnviar === 1
              ? "1 pedido sin enviar se eliminará de la lista."
              : `${sinEnviar} pedidos sin enviar se eliminarán de la lista.`}{" "}
            No se envía nada a Switch.
          </p>
        )}

        {enviados.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800 mb-2">
              {enviados.length === 1
                ? "1 ya está en Switch — se ocultará de fashiongr pero SIGUE en Switch: anúlalo en el panel."
                : `${enviados.length} ya están en Switch — se ocultarán de fashiongr pero SIGUEN en Switch: anúlalos en el panel.`}
            </p>
            <ul className="max-h-40 overflow-y-auto divide-y divide-amber-100 mb-2">
              {enviados.map((e) => (
                <li key={e.key} className="py-1.5 flex items-baseline gap-2 text-sm">
                  <span className="font-semibold text-amber-900 tabular-nums whitespace-nowrap">#{e.numero}</span>
                  <span className="text-amber-700 truncate">{e.cliente}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-amber-300 bg-white text-xs font-medium text-amber-800 hover:bg-amber-100 active:scale-[0.97] transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? "Números copiados" : "Copiar números"}
            </button>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onConfirm}
            disabled={!enabled || loading}
            className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-all bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-40 min-h-[44px]"
          >
            {loading ? "Eliminando..." : !enabled ? `${confirmLabel}...` : confirmLabel}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 active:bg-gray-100 transition-all disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
