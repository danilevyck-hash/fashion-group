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

  const handleToggle = () => {
    if (!open) markAllRead()
    setOpen(prev => !prev)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleToggle}
        className="relative text-gray-400 hover:text-gray-700 transition p-1 rounded-md hover:bg-gray-50"
        title="Notificaciones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
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
                    <p className="text-[11px] text-gray-400 mt-0.5">{formatRelativeTime(n.timestamp)}</p>
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
