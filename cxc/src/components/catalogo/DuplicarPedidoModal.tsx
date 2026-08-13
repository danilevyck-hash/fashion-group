"use client";

// Mini-modal de "Duplicar pedido" — compartido por las 4 marcas y por los DOS
// caminos de duplicar (el botón de la lista y "Duplicar y corregir" del pedido
// bloqueado por Switch).
//
// 🔴 TOCAR EL CLIENTE LO ELIGE; DUPLICAR LO CONFIRMA EL BOTÓN (13-ago-2026).
// Daniel, textual: *"al seleccionar un cliente de una se agrega, enves de tener
// un boton para confirmar el cliente, se siente mas natural asi"*. Antes el
// toque en la fila DISPARABA el duplicado: si el dedo pegaba en el cliente de
// al lado, el pedido ya estaba creado a nombre de otro. Ahora el toque deja el
// cliente ELEGIDO y a la vista (fila en negro + la línea "Cliente elegido:"),
// y recién el botón lo aplica.
//
// ⚠️ EL SEGUNDO TOQUE CONFIRMA EL CLIENTE, NO LA DUPLICACIÓN — por eso el botón
// dice "Usar este cliente" y no "Duplicar". Lo que se estaba equivocando era a
// QUIÉN se le hace el pedido, y eso es lo que el paso extra tiene que dejar
// leer antes de aplicarlo. Es UN solo paso más: no se re-elige nada, no hay
// pantalla intermedia y no hay formulario.
//
// El cliente de Switch sigue siendo OBLIGATORIO —Daniel: *"un vendedor TIENE
// que elegir un cliente de switch, todos siempre no solo vendedor"*— y Contado
// sigue siendo la primera opción, sin preselección silenciosa: quien no toque
// nada tiene el botón apagado y no duplica nada.
//
// 🩸 LO QUE SÍ SE FUE Y NO VUELVE: EL CAMPO DE NOMBRE LIBRE. El modal tenía DOS
// campos que preguntaban lo mismo y se contradecían: arriba el buscador de
// clientes (vacío, sin elegir) y abajo un campo de texto con el nombre del
// cliente del pedido VIEJO ya escrito. La pantalla mostraba un cliente puesto
// mientras el botón apagado pedía elegir uno — Daniel: *"como asi?"*. El
// `client_name` del pedido nuevo ES el nombre del cliente elegido, sin segunda
// fuente posible: se deriva acá con `nombreDeCliente`, la MISMA función que
// escribe el texto que se ve en pantalla.
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
  /** Se dispara al CONFIRMAR el cliente con el botón. `nombre` SIEMPRE es el
   *  del cliente elegido — en este modal no hay texto libre que lo contradiga. */
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
  // `undefined` = todavía no eligió → el botón va apagado.
  const [cliente, setCliente] = useState<ClienteSwitchOpcion | undefined>(undefined);
  useEscapeClose(true, onCancel, !duplicando);

  function confirmar() {
    if (duplicando || !cliente) return;
    onElegir(nombreDeCliente(cliente), cliente);
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
          onElegir={setCliente}
          disabled={duplicando}
        />

        {/* El cliente elegido, escrito con todas las letras: la fila queda en
            negro dentro del selector, pero el selector tiene scroll propio y el
            elegido se puede quedar fuera de vista. Este renglón es lo que hace
            que el botón sea una verificación y no una repetición. */}
        {cliente && (
          <p className="text-sm text-gray-800 mt-3">
            Cliente elegido: <span className="font-medium">{nombreDeCliente(cliente)}</span>
          </p>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <button
          onClick={confirmar}
          disabled={duplicando || !cliente}
          className="w-full mt-4 bg-black text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 disabled:active:scale-100 min-h-[44px]"
        >
          {duplicando ? "Duplicando..." : "Usar este cliente"}
        </button>
        <button
          onClick={onCancel}
          disabled={duplicando}
          className="w-full mt-2 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-50 min-h-[44px]"
        >
          Cancelar
        </button>
      </div>
    </ModalOverlay>
  );
}
