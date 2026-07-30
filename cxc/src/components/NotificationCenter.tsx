"use client"

import { useState, useEffect, useRef, useSyncExternalStore } from "react"
import {
  getNotifications,
  getUnreadCount,
  subscribe,
  markAllRead,
  clearNotifications,
  type Notification,
  type NotificationType,
} from "@/lib/notification-store"
import DesplegableFlotante from "@/components/ui/DesplegableFlotante"

function useNotifications() {
  const notifications = useSyncExternalStore(subscribe, getNotifications, getNotifications)
  const unreadCount = useSyncExternalStore(subscribe, getUnreadCount, getUnreadCount)
  return { notifications, unreadCount }
}

const TYPE_DOT: Record<NotificationType, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)

  if (diffSec < 60) return "ahora"
  if (diffMin < 60) return `hace ${diffMin} min`
  if (diffHr < 24) return `hace ${diffHr}h`
  return `hace ${Math.floor(diffHr / 24)}d`
}

/**
 * La campana mide 44×44 SIEMPRE — ya no hay dos tamaños.
 *
 * 🩸 Tenía uno "compacto" de 24×24 para el header de escritorio, con el
 * argumento de que ahí se apunta con el mouse. El argumento se cae con la
 * medición: ese header aparece desde `sm` (640 px), o sea que **el iPad lo
 * muestra y la campana se toca con el dedo** — medida a 834 y a 1024 px daba
 * 24×24. "Escritorio" no es una pantalla grande: es un puntero fino, y a 834
 * no hay ninguno.
 *
 * Y no cuesta nada de layout: la fila del header ya mide `h-11` = 44 px, así
 * que el botón entra exacto sin mover un píxel de lo que está al lado
 * (verificado en el navegador a los 4 anchos).
 *
 * El punto rojo se ancla al ÍCONO, no al botón: en 44×44 las esquinas quedan
 * lejos de la campana dibujada de 16 px.
 */
export default function NotificationCenter() {
  const { notifications, unreadCount } = useNotifications()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  const botonRef = useRef<HTMLButtonElement>(null)

  const handleToggle = () => {
    if (!open) markAllRead()
    setOpen(prev => !prev)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        ref={botonRef}
        onClick={handleToggle}
        aria-label="Notificaciones"
        className="relative text-gray-400 hover:text-gray-700 transition rounded-md hover:bg-gray-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
        title="Notificaciones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* El punto rojo se ancla al ÍCONO, no al botón: el botón es 44×44 y
            las esquinas quedan lejos de la campana dibujada de 16 px. */}
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
        )}
      </button>

      {/* 🩸 El panel FLOTA (portal a <body> + fixed) desde el 30-jul-2026. Era
          `absolute right-0 w-80`, o sea 320 px colgados del borde derecho de la
          campana; medido a 390 px de ancho, arrancaba en **x = -54**: 54 px de
          notificación quedaban FUERA de la pantalla por la izquierda, en el
          iPhone, que es donde Daniel las lee. Ahora se acota a la pantalla.
          Ver `DesplegableFlotante`. */}
      <DesplegableFlotante
        abierto={open}
        anclaRef={botonRef}
        onCerrar={() => setOpen(false)}
        marca="notificaciones"
        ancho={320}
        alinear="derecha"
        className="bg-white rounded-lg border border-gray-200 shadow-lg"
      >
        <>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notificaciones</span>
            {notifications.length > 0 && (
              <button
                onClick={() => { clearNotifications(); setOpen(false) }}
                className="text-xs text-gray-400 hover:text-red-500 transition"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">
                Sin notificaciones
              </div>
            ) : (
              notifications.map((n: Notification) => (
                <div key={n.id} className="flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TYPE_DOT[n.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 leading-snug">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(n.timestamp)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      </DesplegableFlotante>
    </div>
  )
}
