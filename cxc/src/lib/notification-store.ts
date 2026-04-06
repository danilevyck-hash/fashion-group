// Lightweight notification history store (no external dependencies)
// Keeps the last 20 notifications in memory for the notification center

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: number
  type: NotificationType
  message: string
  timestamp: Date
  read: boolean
}

type Listener = () => void

let notifications: Notification[] = []
let idCounter = 0
const listeners = new Set<Listener>()
const MAX_NOTIFICATIONS = 20

function emit() {
  listeners.forEach(fn => fn())
}

export function addNotification(message: string, type: NotificationType = 'info') {
  const notification: Notification = {
    id: ++idCounter,
    type,
    message,
    timestamp: new Date(),
    read: false,
  }
  notifications = [notification, ...notifications].slice(0, MAX_NOTIFICATIONS)
  emit()
}

export function markAllRead() {
  notifications = notifications.map(n => ({ ...n, read: true }))
  emit()
}

export function clearNotifications() {
  notifications = []
  emit()
}

export function getNotifications(): Notification[] {
  return notifications
}

export function getUnreadCount(): number {
  return notifications.filter(n => !n.read).length
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
