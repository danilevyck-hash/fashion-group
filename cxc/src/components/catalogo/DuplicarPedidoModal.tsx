"use client";

// Mini-modal de "Duplicar pedido" — compartido por las 3 marcas y por los DOS
// caminos de duplicar (el botón de la lista y "Duplicar y corregir" del pedido
// bloqueado por Switch). Pregunta para quién es el pedido nuevo, con el nombre
// del original pre-llenado y editable.
//
// El padre decide qué hacer con el nombre (POST /orders o POST /duplicar); acá
// solo se captura. Si el nombre cambia, el server NO copia cliente_switch_id —
// por eso el texto de apoyo lo dice (solo cuando el padre lo pide: en la lista
// no aplica, el POST /orders nunca copia ese campo).

import { useState } from "react";
import { ModalOverlay } from "@/components/ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";

interface Props {
  /** "PED-100" — para el título. */
  orderNumber: string;
  /** Nombre del cliente del pedido original (pre-llenado). */
  nombreInicial: string;
  /** true mientras el POST está en vuelo (deshabilita todo). */
  duplicando: boolean;
  /** Aviso de que cambiar el nombre re-elige el cliente Switch (solo detalle). */
  avisoClienteSwitch?: boolean;
  onConfirm: (nombre: string) => void;
  onCancel: () => void;
}

export default function DuplicarPedidoModal({
  orderNumber,
  nombreInicial,
  duplicando,
  avisoClienteSwitch,
  onConfirm,
  onCancel,
}: Props) {
  const [nombre, setNombre] = useState(nombreInicial);
  useEscapeClose(true, onCancel, !duplicando);

  function confirmar() {
    if (duplicando) return;
    onConfirm(nombre.trim() || nombreInicial);
  }

  return (
    <ModalOverlay onBackdropClick={() => { if (!duplicando) onCancel(); }}>
      <div
        className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium mb-1">Duplicar pedido {orderNumber}</h3>
        <label htmlFor="dup-cliente" className="block text-sm text-gray-500 mb-2">
          ¿Para quién es el pedido nuevo?
        </label>
        <input
          id="dup-cliente"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
          placeholder="Nombre del cliente"
          className="w-full border border-gray-200 rounded-md px-3 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition mb-2"
        />
        {avisoClienteSwitch && (
          <p className="text-xs text-gray-400 mb-3">
            Si cambias el nombre, el cliente de Switch se vuelve a elegir en el pedido nuevo.
          </p>
        )}
        <div className="flex gap-3 mt-2">
          <button
            onClick={confirmar}
            disabled={duplicando}
            className="flex-1 bg-black text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-50 min-h-[44px]"
          >
            {duplicando ? "Duplicando..." : "Duplicar"}
          </button>
          <button
            onClick={onCancel}
            disabled={duplicando}
            className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
