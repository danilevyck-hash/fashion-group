'use client'

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

export function CajaAviso({ message, type = 'success', onDismiss, className = '' }: {
  message: string
  type?: ToastType
  onDismiss?: () => void
  className?: string
}) {
  return (
    <div role="status" data-aviso={type} className={`${COLOR_AVISO[type]} text-sm px-4 py-2.5 rounded-md shadow-lg flex items-center gap-2 ${className}`}>
      {type === 'success' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      )}
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-2 p-1 rounded hover:bg-white/20 transition flex-shrink-0" aria-label="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  )
}
