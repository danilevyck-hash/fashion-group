'use client'

import { duracionToastMs } from '@/lib/ui/toast-duracion'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useBackdropDismiss, useEscapeClose } from '@/lib/hooks/useModalDismiss'
import { CajaAviso, type ToastType } from '@/components/CajaAviso'

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
    // La regla de la casa (CLAUDE.md): éxitos 3 s, errores y avisos 8 s. Un
    // solo número por clase, en `lib/ui/toast-duracion.ts`.
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duracionToastMs(type))
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

  // Clic fuera y Escape = Cancelar (nunca confirman). El confirm resuelve la
  // promesa en false, igual que el botón Cancelar.
  const cancelConfirm = useCallback(() => { confirmState?.onCancel() }, [confirmState])
  useEscapeClose(!!confirmState, cancelConfirm)
  const backdropConfirm = useBackdropDismiss(confirmState ? cancelConfirm : undefined)

  return (
    <ToastContext.Provider value={{ toast, confirm: confirmFn }}>
      {children}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <CajaAviso key={t.id} message={t.message} type={t.type} onDismiss={() => dismiss(t.id)}
            className="pointer-events-auto max-w-sm animate-in slide-in-from-right fade-in duration-200" />
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div {...backdropConfirm} className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] animate-in fade-in duration-150">
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
