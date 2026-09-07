"use client";

// ─────────────────────────────────────────────────────────────────────────────
// REENVIAR EL PAPEL POR CORREO, DESDE LA FILA (6-sep-2026)
//
// 🔴 EL CORREO NO ES OBLIGATORIO Y NO SE MANDA SOLO. Daniel, textual: *«no
// quiero que sea obligatorio mandar el correo, pero sí que sea opcional, ya
// escrito automáticamente el mail del cliente»*. Esta ventana **viene con el
// correo escrito** —el que el pedido tenga guardado o, si no, el del cliente en
// el directorio— y no manda nada hasta que alguien toque el botón.
//
// Reusa la MISMA ruta que el detalle (`POST /send-order`), así que el papel que
// llega es el mismo. Nada de esto toca Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ModalOverlay } from "@/components/ui";

export default function ReenviarCorreoModal({
  numero,
  cliente,
  correoInicial,
  buscandoCorreo,
  enviando,
  error,
  onEnviar,
  onCancel,
}: {
  numero: string;
  cliente: string;
  correoInicial: string;
  /** Todavía se está preguntando el correo del cliente al directorio. */
  buscandoCorreo: boolean;
  enviando: boolean;
  error: string | null;
  onEnviar: (correo: string) => void;
  onCancel: () => void;
}) {
  const [correo, setCorreo] = useState(correoInicial);
  // Cuando el correo del directorio llega tarde, se escribe solo — pero nunca
  // pisa lo que la persona ya empezó a teclear.
  useEffect(() => {
    setCorreo((actual) => (actual.trim() === "" ? correoInicial : actual));
  }, [correoInicial]);

  const valido = correo.trim().includes("@");

  return (
    <ModalOverlay onBackdropClick={() => !enviando && onCancel()} align="center">
      <div className="bg-white rounded-lg border border-gray-200 w-full max-w-sm p-5">
        <h3 className="text-base font-semibold text-gray-900">Reenviar el correo</h3>
        <p className="text-sm text-gray-500 mt-1">
          {numero ? `${numero} · ` : ""}
          {cliente}
        </p>
        <label className="block text-xs text-gray-500 mt-4 mb-1">Correo del cliente</label>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder={buscandoCorreo ? "Buscando el correo…" : "cliente@correo.com"}
          className="w-full min-h-[44px] px-3 rounded-md border border-gray-200 text-sm outline-none focus:border-black transition"
        />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={enviando}
            className="min-h-[44px] px-4 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onEnviar(correo.trim())}
            disabled={enviando || !valido}
            className="min-h-[44px] px-4 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
