"use client";

// ─────────────────────────────────────────────────────────────────────────────
// "¿A qué cliente fue esta línea?" — y nada más que eso.
//
// Es la ventana que abre el enlace "Atar cliente" de una línea de guía. Existe
// porque el 98% de las guías vivas están **Completadas** y por lo tanto
// cerradas a edición (174 de 177, medido el 8-ago-2026): sin esto, atarles el
// cliente exigiría reabrir el despacho, que es justo lo que no se puede hacer.
//
// Lo que se ve es deliberadamente chiquito: el nombre TAL CUAL lo escribió
// bodega —que no se toca— y un selector para decir a qué cliente del directorio
// corresponde. No hay bultos, ni facturas, ni firmas: esto no edita el
// despacho. El porqué está entero en `api/guias/[id]/cliente/route.ts`.
//
// El texto escrito a mano se CONSERVA siempre (mismo patrón que
// `mk_proyectos.tienda` + `tienda_codigo`). Es la prueba de lo que se anotó ese
// día; el código es la respuesta a "¿y quién era?".
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ModalOverlay } from "@/components/ui";
import { Ayuda } from "@/components/shared/Ayuda";
import ClientePicker from "@/components/ClientePicker";
import { CODIGOS_RETIRADOS_DE_GUIAS } from "@/lib/guias/american-classics";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";

interface Props {
  open: boolean;
  /** El texto que escribió bodega. Solo se muestra — nunca se modifica. */
  clienteTexto: string;
  /** Código ya guardado, si lo hay. "" = sin atar. */
  codigoActual: string;
  /** Cómo se llama el cliente ya atado. "" = no se pudo leer el directorio. */
  nombreActual?: string;
  /** Clientes más usados en guías, para no tener que teclear. */
  topClientes?: ClienteHit[];
  /** El directorio del grupo, para el "¿quisiste decir…?". Vacío = aún no cargó. */
  clientesDelGrupo?: readonly ClienteHit[];
  guardando: boolean;
  error: string | null;
  onClose: () => void;
  /** `null` = desatar. */
  onGuardar: (codigo: string | null) => void;
}

export default function AtarClienteModal({
  open,
  clienteTexto,
  codigoActual,
  nombreActual,
  topClientes,
  clientesDelGrupo,
  guardando,
  error,
  onClose,
  onGuardar,
}: Props) {
  // El nombre que muestra el selector arranca del texto de la línea: así el
  // campo no aparece vacío y se ve de entrada contra qué se está pareando.
  const [nombre, setNombre] = useState(nombreActual || clienteTexto);
  const [codigo, setCodigo] = useState(codigoActual);

  // Al ABRIR se copian los valores de la línea. Sin esto, atar una línea y
  // abrir la siguiente mostraría el cliente de la anterior — el mismo bug que
  // en Cheques desvinculaba en silencio al editar.
  useEffect(() => {
    if (open) {
      // Si ya está atada, el campo muestra el NOMBRE del cliente atado (no el
      // texto de la guía): así se ve de una a quién apunta hoy el código.
      setNombre(nombreActual || clienteTexto);
      setCodigo(codigoActual);
    }
  }, [open, clienteTexto, codigoActual, nombreActual]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      // Escape cierra la ventana, salvo que la lista del selector se lo haya
      // comido primero (ClientePicker hace stopPropagation cuando está abierta).
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const cambio = codigo.trim() !== codigoActual.trim();

  return (
    <ModalOverlay onBackdropClick={guardando ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atar cliente"
        className="bg-white sm:rounded-lg rounded-t-2xl w-full max-w-md mx-0 sm:mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-medium">Atar cliente</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>

        <div className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">En la guía dice</p>
          <p className="text-sm font-medium text-black mb-4 break-words">{clienteTexto || "—"}</p>

          {/* El "no cambia nada de la guía" NO se borra — es lo que hace que
              alguien se anime a tocar una guía cerrada. Pero se aprende una
              sola vez, así que vive en el ⓘ en vez de gritar cada vez. */}
          <div className="flex items-center gap-1 mb-1">
            <label htmlFor="atar-cliente-picker" className="block text-xs uppercase tracking-wide text-gray-400">
              Es este cliente
            </label>
            <Ayuda titulo="Qué se guarda" className="-my-2">
              <p>
                Lo que dice la guía no cambia. Solo se guarda a qué cliente
                corresponde.
              </p>
            </Ayuda>
          </div>
          {/* 🔑 Las sugerencias las dibuja el SELECTOR, debajo del campo: es el
              MISMO "¿Es este cliente?" que ve quien crea una guía o un cheque
              (`ClientePicker` → `SugerenciasCliente`). Antes vivían acá arriba
              y eran de Guías solamente; que la red de seguridad exista en una
              pantalla sí y en otra no es lo que este cambio vino a terminar.
              Tocarlas NO guarda: llenan el campo y hay que apretar Guardar.

              `avisarSinParecidos` lo enciende SOLO esta ventana: acá la tarea
              entera es encontrar al cliente, y quedarse muda cuando no hay
              ninguno parecido manda a buscar durante minutos algo que no está.
              El directorio se pasa por prop porque esta ventana ya lo tiene
              cargado — y `[]` significa "no se pudo leer", no "no hay". */}
          <ClientePicker
            id="atar-cliente-picker"
            value={nombre}
            codigo={codigo}
            topClientes={topClientes}
            clientesDelGrupo={clientesDelGrupo}
            // 🔴 D-201 «American Classics» tampoco se ata acá: es el duplicado
            // de D-108 y esta ventana es la otra puerta a `cliente_codigo`
            // (5-sep-2026). Ver `american-classics.ts`.
            codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}
            avisarSinParecidos
            onChange={(n, c) => {
              setNombre(n);
              setCodigo(c);
            }}
            inputClassName="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition min-h-[44px]"
          />

          {error && (
            <div className="mt-3 rounded-md bg-red-50 border border-red-100 px-3 py-2">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={() => onGuardar(codigo.trim() ? codigo.trim() : null)}
            disabled={guardando || !cambio}
            className="flex-1 min-w-[8rem] bg-black text-white px-4 rounded-md text-sm font-medium min-h-[44px] hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          {codigoActual.trim() && (
            <button
              type="button"
              onClick={() => onGuardar(null)}
              disabled={guardando}
              className="border border-gray-200 text-gray-600 px-4 rounded-md text-sm min-h-[44px] hover:bg-gray-50 active:bg-gray-100 transition-all disabled:opacity-40"
            >
              Quitar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="border border-gray-200 text-gray-600 px-4 rounded-md text-sm min-h-[44px] hover:bg-gray-50 active:bg-gray-100 transition-all disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
