'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'warning'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ConfirmState {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
  confirm: (message: string) => Promise<boolean>
}

const ToastContext = createContext<ToastContextType | null>(null)

let idCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++idCounter
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const confirmFn = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({
        message,
        onConfirm: () => { setConfirmState(null); resolve(true) },
        onCancel: () => { setConfirmState(null); resolve(false) },
      })
    })
  }, [])

  const colors: Record<ToastType, string> = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-amber-600',
  }

  return (
    <ToastContext.Provider value={{ toast, confirm: confirmFn }}>
      {children}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`${colors[t.type]} text-white text-sm px-4 py-2.5 rounded-lg shadow-lg pointer-events-auto flex items-center gap-3 animate-in slide-in-from-right fade-in duration-200 max-w-sm`}>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-white/70 hover:text-white text-lg leading-none">&times;</button>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] animate-in fade-in duration-150">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <p className="text-sm text-gray-800 mb-5">{confirmState.message}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={confirmState.onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 transition">Cancelar</button>
              <button onClick={confirmState.onConfirm} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
