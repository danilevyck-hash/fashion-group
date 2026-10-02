'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ABAJO_DEL_FLOTANTE_CSS, DIAMETRO_FLOTANTE, MARGEN_FLOTANTE } from '@/lib/navegacion/barra-celular'
import { TAB_BAR_2026_10 } from '@/lib/navegacion/tab-bar'

export type ToastType = 'success' | 'error' | 'warning'

// 🔴 UN SOLO AVISO EN TODO EL SISTEMA (Daniel, 2-oct-2026). Había dos: este
// proveedor pintaba el éxito VERDE y el `<Toast>` de `ui.tsx` lo pintaba NEGRO.
// Los dos dibujan ahora esta misma caja (en su propio archivo para que los
// `vi.mock` de `ToastSystem` o de `ui` no se la lleven); el color sale de un solo lugar.
// Éxito negro, error rojo, aviso ámbar. Candado: `aviso-unico.test.tsx`.
export const COLOR_AVISO: Record<ToastType, string> = {
  success: 'bg-black text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-600 text-white',
}

/** La forma de la caja (sin color ni posición). La usa también el aviso armado a mano en `useAuth`. */
export const CLASE_CAJA_AVISO = 'text-sm px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2'

export function CajaAviso({ message, type = 'success', onDismiss, className = '', sinIcono = false, children }: {
  message: string
  type?: ToastType
  onDismiss?: () => void
  className?: string
  /** Para un aviso de estado («Actualizando…»), que no es ni éxito ni error. */
  sinIcono?: boolean
  /** Una acción al lado del texto, p. ej. «Deshacer». */
  children?: ReactNode
}) {
  return (
    <div role="status" data-aviso={type} className={`${COLOR_AVISO[type]} ${CLASE_CAJA_AVISO} ${className}`}>
      {sinIcono ? null : type === 'success' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      )}
      <span className="flex-1">{message}</span>
      {children}
      {onDismiss && (
        <button onClick={onDismiss} className="ml-2 p-1 rounded hover:bg-white/20 transition flex-shrink-0" aria-label="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  )
}

// 🔴 TODOS LOS AVISOS SALEN EN EL MISMO LUGAR: ABAJO AL CENTRO (Daniel, 2-oct-2026).
// Los de `useToast` salían arriba a la derecha y los de `<Toast>` abajo al
// centro. Ahora los dos (y `UndoToast`) entran en UNA sola pila, un solo nodo
// en <body>: si salen varios a la vez se apilan con su espacio, nunca uno
// encima del otro.
//
// 🔑 DÓNDE: justo encima del botón ☰ redondo del celular, que a su vez se
// sienta encima de la barra fija de abajo (`--fg-alto-barra-fija`) o de la
// franja de iOS (`safe-area-inset-bottom`). Se reusa su misma regla
// (`ABAJO_DEL_FLOTANTE_CSS`) + el alto del botón: el aviso no tapa ni el ☰ ni
// «Cobrar»/«Nuevo reclamo». En escritorio (sin ☰) queda unos 60 px arriba del
// piso: un solo número para todas las medidas. Candado: `aviso-unico.test.tsx`.
const ABAJO_DEL_BOTON_CSS = `calc(${ABAJO_DEL_FLOTANTE_CSS} + ${DIAMETRO_FLOTANTE + MARGEN_FLOTANTE}px)`
// Con la barra de pestañas (`TAB_BAR_2026_10`) el aviso se sienta encima de ella;
// la barra publica su alto en `--fg-alto-tab-bar` (0 cuando se esconde).
export const ABAJO_DE_LOS_AVISOS_CSS = TAB_BAR_2026_10
  ? `max(${ABAJO_DEL_BOTON_CSS}, calc(var(--fg-alto-tab-bar, 0px) + 8px))`
  : ABAJO_DEL_BOTON_CSS
export const CLASE_PILA_AVISOS = 'fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none'
export const ATRIBUTO_PILA_AVISOS = 'data-pila-avisos'

/** El nodo único de la pila, en <body>. Solo en el cliente. */
export function pilaDeAvisos(): HTMLElement {
  let el = document.querySelector<HTMLElement>(`[${ATRIBUTO_PILA_AVISOS}]`)
  if (!el) {
    el = document.createElement('div')
    el.setAttribute(ATRIBUTO_PILA_AVISOS, '')
    el.className = CLASE_PILA_AVISOS
    el.style.setProperty('bottom', ABAJO_DE_LOS_AVISOS_CSS)
    document.body.appendChild(el)
  }
  return el
}

const sinSuscripcion = () => () => {}
/** Manda sus hijos a la pila única de avisos. En el servidor no dibuja nada. */
export function EnLaPilaDeAvisos({ children }: { children: ReactNode }) {
  const enElCliente = useSyncExternalStore(sinSuscripcion, () => true, () => false)
  return enElCliente ? createPortal(children, pilaDeAvisos()) : null
}

/** La clase de cada aviso adentro de la pila. */
export const CLASE_AVISO_EN_PILA = 'pointer-events-auto max-w-sm animate-in slide-in-from-bottom fade-in duration-200'
