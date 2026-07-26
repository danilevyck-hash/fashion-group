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

interface NotificationCenterProps {
  /**
   * Tamaño del área táctil de la campana.
   *  - "compacta" (default): el botón chico del header de escritorio, donde se
   *    apunta con el mouse y 44 px serían un hueco enorme al lado de la lupa.
   *  - "tactil": 44×44, el mínimo de la casa para el dedo en el iPhone.
   *
   * Antes esto se resolvía desde AppHeader estirando el botón con selectores
   * arbitrarios (`[&>div>button]:min-w-[44px]` y un reposicionamiento del punto
   * rojo). Funcionaba, pero dejaba el tamaño de este componente escrito en otro
   * archivo: cualquier cambio acá adentro lo rompía en silencio.
   */
  size?: "compacta" | "tactil"
}

export default function NotificationCenter({ size = "compacta" }: NotificationCenterProps = {}) {
  const { notifications, unreadCount } = useNotifications()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const tactil = size === "tactil"

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

  const handleToggle = () => {
    if (!open) markAllRead()
    setOpen(prev => !prev)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleToggle}
        aria-label="Notificaciones"
        className={`relative text-gray-400 hover:text-gray-700 transition rounded-md hover:bg-gray-50 ${
          tactil
            ? "min-w-[44px] min-h-[44px] flex items-center justify-center"
            : "p-1"
        }`}
        title="Notificaciones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* El punto rojo se ancla al ÍCONO, no al botón: en modo táctil el botón
            es 44×44 y las esquinas quedan lejos de la campana dibujada. */}
        {unreadCount > 0 && (
          <span className={`absolute w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white ${
            tactil ? "top-2 right-2" : "-top-0.5 -right-0.5"
          }`} />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg border border-gray-200 shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-150">
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
        </div>
      )}
    </div>
  )
}
