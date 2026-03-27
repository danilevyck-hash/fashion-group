'use client'

import Link from 'next/link'
import { useCart } from '@/components/reebok/CartProvider'
import { useState, useEffect, useRef } from 'react'

interface DirClient { nombre: string; empresa: string; correo: string; whatsapp: string }

export default function Pedido() {
  const { items, removeFromCart, updateQuantity, clearCart } = useCart()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<DirClient[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const PIEZAS_POR_BULTO = 12
  const total = items.reduce((sum, item) => sum + (item.price || 0) * item.quantity * PIEZAS_POR_BULTO, 0)
  const totalBultos = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPiezas = totalBultos * PIEZAS_POR_BULTO

  // CHANGE 1: Autocomplete from directorio
  function handleNameChange(value: string) {
    setClientName(value)
    if (searchTimeout) clearTimeout(searchTimeout)
    if (value.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/reebok/clientes-search?q=${encodeURIComponent(value)}`)
        if (res.ok) {
          const data = await res.json()
          setSuggestions(data || [])
          setShowSuggestions((data || []).length > 0)
        }
      } catch { /* */ }
    }, 300)
    setSearchTimeout(t)
  }

  function selectClient(c: DirClient) {
    setClientName(c.nombre)
    if (c.correo) setClientEmail(c.correo)
    setShowSuggestions(false)
    setSuggestions([])
  }

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.parentElement?.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // CHANGE 2: Only "Enviar Pedido" via email
  const handleSendOrder = async () => {
    if (!clientName.trim()) { alert('Ingresa el nombre del cliente'); return }
    setSending(true)
    try {
      const res = await fetch('/api/catalogo/reebok/send-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim() || undefined,
          items: items.map(item => ({
            productName: item.productName,
            productId: item.productId,
            quantity: item.quantity,
            piezas: item.quantity * PIEZAS_POR_BULTO,
            price: item.price,
            subtotal: item.price ? item.price * item.quantity * PIEZAS_POR_BULTO : 0,
          })),
          totalBultos, totalPiezas, total,
        }),
      })
      if (res.ok) {
        setSent(true)
      } else {
        const err = await res.json()
        alert(err.error || 'Error al enviar pedido')
      }
    } catch { alert('Error de conexión') }
    setSending(false)
  }

  if (sent) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Pedido enviado</h1>
        <p className="text-gray-500 mb-6">Tu pedido de {totalBultos} bultos (${total.toFixed(2)}) ha sido enviado. Te contactaremos pronto.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/catalogo/reebok" className="bg-reebok-red text-white px-6 py-3 rounded font-bold text-sm uppercase hover:bg-red-700 transition-colors">
            Seguir comprando
          </Link>
          <button onClick={() => { clearCart(); setSent(false) }} className="border border-gray-300 text-gray-600 px-6 py-3 rounded text-sm hover:bg-gray-50 transition-colors">
            Vaciar carrito
          </button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">Tu pedido</h1>
        <p className="text-gray-500 mb-6">No tienes productos en tu pedido</p>
        <Link href="/catalogo/reebok" className="inline-block bg-reebok-red text-white px-6 py-3 rounded font-bold text-sm uppercase hover:bg-red-700 transition-colors">
          Ver catalogo
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Tu pedido</h1>
      <p className="text-gray-500 mb-6">{totalBultos} bultos ({totalPiezas} piezas) — <span className="text-reebok-red font-bold">${total.toFixed(2)}</span></p>

      {/* Client info with autocomplete */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="relative" ref={inputRef}>
          <label className="text-[11px] text-gray-400 uppercase tracking-wider block mb-1">Nombre del cliente <span className="text-red-500">*</span></label>
          <input type="text" value={clientName} onChange={e => handleNameChange(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
            placeholder="Nombre completo"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300" />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {suggestions.slice(0, 5).map((c, i) => (
                <button key={i} onClick={() => selectClient(c)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition flex items-center justify-between border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{c.nombre}</div>
                    {c.empresa && <div className="text-xs text-gray-400">{c.empresa}</div>}
                  </div>
                  {c.correo && <span className="text-[10px] text-gray-300 truncate ml-2 max-w-[120px]">{c.correo}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase tracking-wider block mb-1">Email <span className="normal-case text-gray-300">(opcional)</span></label>
          <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="email@ejemplo.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
      </div>

      <div className="space-y-3 mb-8">
        {items.map(item => (
          <div key={`${item.productId}-${item.size}`} className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-4">
            <div className="w-16 h-16 bg-reebok-grey rounded overflow-hidden flex-shrink-0">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Sin foto</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm truncate">{item.productName}</h3>
              <p className="text-xs text-gray-500">{item.quantity} bultos ({item.quantity * PIEZAS_POR_BULTO} pzs)</p>
              {item.price && <p className="text-xs text-reebok-red font-bold">${(item.price * item.quantity * PIEZAS_POR_BULTO).toFixed(2)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)} className="w-8 h-8 border rounded text-sm flex items-center justify-center">-</button>
              <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
              <button onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)} className="w-8 h-8 border rounded text-sm flex items-center justify-center">+</button>
            </div>
            <button onClick={() => removeFromCart(item.productId, item.size)} className="text-gray-400 hover:text-red-500 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {/* Send order — main CTA */}
        <button
          onClick={handleSendOrder}
          disabled={sending || !clientName.trim()}
          className="w-full bg-reebok-red text-white py-4 rounded-lg font-bold text-center text-sm uppercase tracking-wider hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          {sending ? 'Enviando...' : 'Enviar Pedido'}
        </button>

        <button onClick={clearCart} className="w-full border border-gray-300 text-gray-600 py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Vaciar pedido
        </button>
      </div>
    </div>
  )
}
