"use client";

// Mini-modal de "Duplicar pedido" — compartido por las 4 marcas y por los DOS
// caminos de duplicar (el botón de la lista y "Duplicar y corregir" del pedido
// bloqueado por Switch).
//
// 🔴 UNA SOLA DECISIÓN Y UN SOLO TOQUE: TOCAR EL CLIENTE DUPLICA (12-ago-2026).
// El cliente de Switch es OBLIGATORIO —Daniel: *"un vendedor TIENE que elegir
// un cliente de switch, todos siempre no solo vendedor"*— y Contado sigue
// siendo la primera opción, de un toque, sin preselección silenciosa: quien no
// toque nada no duplica nada.
//
// 🩸 DOS COSAS QUE SE FUERON, y ninguna es cosmética:
//
//  1. EL CAMPO DE NOMBRE LIBRE. El modal tenía DOS campos que preguntaban lo
//     mismo y se contradecían: arriba el buscador de clientes (vacío, sin
//     elegir) y abajo un campo de texto con el nombre del cliente del pedido
//     VIEJO ya escrito. La pantalla mostraba un cliente puesto mientras el
//     botón apagado pedía elegir uno — Daniel: *"como asi?"*. Ahora el
//     `client_name` del pedido nuevo ES el nombre del cliente elegido, sin
//     segunda fuente posible: se deriva acá con `nombreDeCliente`, la MISMA
//     función que escribe el texto que se ve en pantalla.
//  2. EL BOTÓN "Duplicar". Daniel: *"porq el toque doble de duplicar?"* —
//     tocar el cliente ya ES la decisión; pedir después un botón de confirmar
//     era el mismo toque dos veces. Se puede porque duplicar crea un BORRADOR
//     y NO escribe en Switch: si se toca el cliente equivocado se cambia dentro
//     del pedido o se borra el borrador. Nada irreversible. (Lo que sí exige
//     confirmación explícita es "Confirmar y enviar a Switch", que no se toca.)
//
// Quien necesite OTRO texto en el pedido (una sucursal, por ejemplo) lo edita
// adentro del pedido, donde el nombre ya es editable en borrador.
//
// El padre decide qué hacer con la elección (POST /orders o POST /duplicar);
// acá solo se captura. Los dos endpoints aceptan `cliente_switch_id`.

import { useState } from "react";
import { ModalOverlay } from "@/components/ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import ClienteSwitchPicker, { type ClienteSwitchOpcion, nombreDeCliente } from "@/components/catalogo/ClienteSwitchPicker";

interface Props {
  /** "PED-100" — para el título. */
  orderNumber: string;
  /** Base de la API de la marca, ej. "/api/catalogo/calvin". */
  api: string;
  /** Nombre del directorio Switch de la marca (textos de ayuda del selector). */
  directorioLabel: string;
  /** true mientras el POST está en vuelo (deshabilita todo). */
  duplicando: boolean;
  /** Mensaje si el duplicado falló — se ve DENTRO de la ventana, no solo en un
   *  toast que se va: sin esto el toque se siente como que no pasó nada. */
  error?: string | null;
  /** Se dispara AL TOCAR el cliente. `nombre` SIEMPRE es el del cliente
   *  elegido — en este modal no hay texto libre que lo pueda contradecir. */
  onElegir: (nombre: string, cliente: ClienteSwitchOpcion) => void;
  onCancel: () => void;
}

export default function DuplicarPedidoModal({
  orderNumber,
  api,
  directorioLabel,
  duplicando,
  error,
  onElegir,
  onCancel,
}: Props) {
  // Solo para dejar marcado (y con su "Duplicando...") el que se tocó.
  const [cliente, setCliente] = useState<ClienteSwitchOpcion | undefined>(undefined);
  useEscapeClose(true, onCancel, !duplicando);

  function elegir(c: ClienteSwitchOpcion) {
    if (duplicando) return;
    setCliente(c);
    onElegir(nombreDeCliente(c), c);
  }

  return (
    <ModalOverlay onBackdropClick={() => { if (!duplicando) onCancel(); }}>
      <div
        className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium mb-1">Duplicar pedido {orderNumber}</h3>

        <p className="text-sm text-gray-500 mb-2">¿Para quién es el pedido nuevo?</p>
        <ClienteSwitchPicker
          api={api}
          directorioLabel={directorioLabel}
          valor={cliente}
          onElegir={elegir}
          disabled={duplicando}
          notaEnElegido={duplicando ? "Duplicando..." : null}
        />

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <button
          onClick={onCancel}
          disabled={duplicando}
          className="w-full mt-4 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-50 min-h-[44px]"
        >
          Cancelar
        </button>
      </div>
    </ModalOverlay>
  );
}
