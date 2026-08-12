"use client";

// Mini-modal de "Duplicar pedido" — compartido por las 4 marcas y por los DOS
// caminos de duplicar (el botón de la lista y "Duplicar y corregir" del pedido
// bloqueado por Switch).
//
// 🔴 EL CLIENTE DE SWITCH SE ELIGE ACÁ, Y ES OBLIGATORIO (12-ago-2026). Daniel,
// textual: *"un vendedor TIENE que elegir un cliente de switch, todos siempre no
// solo vendedor"*. Antes el pedido nacía con el nombre de texto libre y el
// cliente real se elegía después, en el detalle, con un selector que además
// estaba cerrado al vendedor: todo lo que él armaba terminaba en Contado. Ahora
// no se puede duplicar sin elegir — Contado sigue siendo una opción válida, de
// UN toque y la primera de la lista, pero hay que tocarla.
//
// El nombre de texto libre se RELLENA SOLO con el nombre del cliente elegido, y
// queda editable: es el que sale en el PDF y el correo, y a veces se le pone la
// sucursal. Elegir otro cliente lo vuelve a rellenar; lo escrito a mano se
// conserva mientras no se cambie de cliente.
//
// El padre decide qué hacer con el resultado (POST /orders o POST /duplicar);
// acá solo se captura. Los dos endpoints aceptan `cliente_switch_id`.

import { useState } from "react";
import { ModalOverlay } from "@/components/ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import ClienteSwitchPicker, { type ClienteSwitchOpcion, nombreDeCliente } from "@/components/catalogo/ClienteSwitchPicker";

interface Props {
  /** "PED-100" — para el título. */
  orderNumber: string;
  /** Nombre del cliente del pedido original (pre-llenado). */
  nombreInicial: string;
  /** Base de la API de la marca, ej. "/api/catalogo/calvin". */
  api: string;
  /** Nombre del directorio Switch de la marca (textos de ayuda del selector). */
  directorioLabel: string;
  /** true mientras el POST está en vuelo (deshabilita todo). */
  duplicando: boolean;
  onConfirm: (nombre: string, cliente: ClienteSwitchOpcion) => void;
  onCancel: () => void;
}

export default function DuplicarPedidoModal({
  orderNumber,
  nombreInicial,
  api,
  directorioLabel,
  duplicando,
  onConfirm,
  onCancel,
}: Props) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [cliente, setCliente] = useState<ClienteSwitchOpcion | undefined>(undefined);
  useEscapeClose(true, onCancel, !duplicando);

  function elegirCliente(c: ClienteSwitchOpcion) {
    setCliente(c);
    // El nombre libre sigue al cliente elegido. Contado no tiene nombre propio:
    // ahí se conserva el que ya estaba (suele ser el del mostrador real).
    if (c.id != null) setNombre(nombreDeCliente(c));
  }

  function confirmar() {
    if (duplicando || !cliente) return;
    onConfirm(nombre.trim() || nombreInicial, cliente);
  }

  return (
    <ModalOverlay onBackdropClick={() => { if (!duplicando) onCancel(); }}>
      <div
        className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium mb-1">Duplicar pedido {orderNumber}</h3>

        <label className="block text-sm text-gray-500 mb-2">
          ¿Para quién es el pedido nuevo?
        </label>
        <ClienteSwitchPicker
          api={api}
          directorioLabel={directorioLabel}
          valor={cliente}
          onElegir={elegirCliente}
          disabled={duplicando}
        />

        <label htmlFor="dup-cliente" className="block text-sm text-gray-500 mt-4 mb-2">
          Nombre que sale en el pedido
        </label>
        <input
          id="dup-cliente"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
          placeholder="Nombre del cliente"
          className="w-full border border-gray-200 rounded-md px-3 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition"
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={confirmar}
            disabled={duplicando || !cliente}
            className="flex-1 bg-black text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-50 min-h-[44px]"
          >
            {duplicando ? "Duplicando..." : !cliente ? "Elige el cliente" : "Duplicar"}
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
