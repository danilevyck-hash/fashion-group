"use client";

// ============================================================================
// «ESCRIBE ELIMINAR» (23-sep-2026, el período manda).
//
// Daniel: *«se elimina y listo… con seguro de que escriban ELIMINAR»*. Es la
// confirmación destructiva del sistema (`ConfirmDeleteModal`) pero con la
// PALABRA en vez del segundo de espera: el botón rojo se prende solo cuando
// lo escrito es exactamente `ELIMINAR` (`confirmaEliminar`, puro). Un motivo
// opcional queda como rastro en la base; nada más se pregunta.
// ============================================================================

import { useState } from "react";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { PALABRA_PARA_ANULAR, confirmaEliminar } from "@/lib/marketing/periodo-manda";

interface Props {
  titulo: string;
  descripcion: string;
  /** Con `true` se pide un porqué, opcional. */
  conMotivo?: boolean;
  etiquetaBoton?: string;
  etiquetaCargando?: string;
  /** Recibe el motivo escrito (vacío si no se pidió o no se escribió). */
  onConfirmar: (motivo: string) => Promise<void>;
  onCerrar: () => void;
}

export default function ConfirmarEliminar({
  titulo,
  descripcion,
  conMotivo = false,
  etiquetaBoton = "Eliminar",
  etiquetaCargando = "Eliminando…",
  onConfirmar,
  onCerrar,
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [palabra, setPalabra] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const dismiss = useFormModalDismiss(true, onCerrar, !trabajando);
  const confirmada = confirmaEliminar(palabra);

  const confirmar = async () => {
    if (!confirmada || trabajando) return;
    setTrabajando(true);
    try {
      await onConfirmar(motivo.trim());
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" {...dismiss.backdrop} />
      <div
        ref={dismiss.panelRef}
        className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
        onClick={(e) => e.stopPropagation()}
        data-fg-confirmar-eliminar
      >
        <h3 className="text-base font-semibold mb-1">{titulo}</h3>
        <p className="text-sm text-gray-500 mb-4">{descripcion}</p>

        {conMotivo && (
          <>
            <label htmlFor="mk-eliminar-motivo" className="block text-sm text-gray-600 mb-1">
              Por qué <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              id="mk-eliminar-motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Se cargó dos veces, no era de esta tienda…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm focus:border-black focus:outline-none mb-3"
            />
          </>
        )}

        <label htmlFor="mk-eliminar-palabra" className="block text-sm text-gray-600 mb-1">
          Escribe <span className="font-mono font-semibold text-gray-900">{PALABRA_PARA_ANULAR}</span> para confirmar
        </label>
        <input
          id="mk-eliminar-palabra"
          type="text"
          value={palabra}
          onChange={(e) => setPalabra(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={PALABRA_PARA_ANULAR}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm font-mono tracking-wider focus:border-black focus:outline-none mb-4"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={confirmar}
            disabled={!confirmada || trabajando}
            className="flex-1 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-40 transition"
          >
            {trabajando ? etiquetaCargando : etiquetaBoton}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            disabled={trabajando}
            className="flex-1 border border-gray-200 text-gray-600 px-4 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
