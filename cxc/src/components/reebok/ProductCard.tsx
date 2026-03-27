'use client'

import { useState } from 'react'
import { Product } from '@/components/reebok/supabase'
import { useRouter } from 'next/navigation'

export default function ProductCard({ product, stock = 0, orderQty = 0 }: { product: Product; stock?: number; orderQty?: number }) {
  const router = useRouter()
  const [qty, setQty] = useState(orderQty > 0 ? orderQty : 1)
  const [status, setStatus] = useState<'idle' | 'adding' | 'added' | 'no-order'>(orderQty > 0 ? 'added' : 'idle')

  const genderLabel = product.gender === 'male' ? 'Hombre' : product.gender === 'female' ? 'Mujer' : product.gender === 'kids' ? 'Ninos' : ''

  const handleAdd = async () => {
    const activeOrderId = localStorage.getItem('reebok_active_order_id')
    const activeOrderClient = localStorage.getItem('reebok_active_order_client') || localStorage.getItem('reebok_active_order_number') || 'pedido'

    if (!activeOrderId) {
      setStatus('no-order')
      return
    }

    setStatus('adding')
    try {
      // Fetch current order to get items
      const res = await fetch(`/api/catalogo/reebok/orders/${activeOrderId}`)
      if (!res.ok) { setStatus('no-order'); return }
      const order = await res.json()
      const existingItems = order.reebok_order_items || []

      // Check if product already exists
      const existingIdx = existingItems.findIndex((i: { product_id: string }) => i.product_id === product.id)
      let newItems
      if (existingIdx >= 0) {
        newItems = existingItems.map((i: { product_id: string; quantity: number }, idx: number) =>
          idx === existingIdx ? { ...i, quantity: i.quantity + qty } : i
        )
      } else {
        newItems = [...existingItems, {
          product_id: product.id,
          sku: product.sku || '',
          name: product.name,
          image_url: product.image_url || '',
          quantity: qty,
          unit_price: product.price || 0,
        }]
      }

      const putRes = await fetch(`/api/catalogo/reebok/orders/${activeOrderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems }),
      })

      if (putRes.ok) {
        setStatus('added')
        // Show toast via custom event
        window.dispatchEvent(new CustomEvent('reebok-toast', { detail: `Agregado a ${activeOrderClient}` }))
        setTimeout(() => setStatus('idle'), 2000)
      }
    } catch {
      setStatus('no-order')
    }
  }

  return (
    <div className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="aspect-square bg-reebok-grey relative overflow-hidden">
        {product.on_sale && (
          <span className="absolute top-2 left-2 z-10 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">OFERTA</span>
        )}
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-3">
        {product.sku && <p className="text-[10px] text-gray-400 font-mono">{product.sku}</p>}
        <h3 className="font-medium text-sm text-reebok-dark truncate">{product.name}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{genderLabel}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm font-bold text-reebok-red">
            {product.price ? `$${product.price.toFixed(0)}` : 'Consultar'}
          </p>
          <span className={`text-[10px] font-medium ${stock > 0 ? 'text-green-600' : 'text-red-400'}`}>
            {stock > 0 ? `${stock} disp.` : 'Agotado'}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center border rounded">
            <button onClick={() => { setQty(Math.max(1, qty - 1)); setStatus('idle') }} className="w-7 h-7 flex items-center justify-center text-sm hover:bg-gray-100">-</button>
            <span className="w-8 text-center text-sm font-medium">{qty}</span>
            <button onClick={() => { setQty(qty + 1); setStatus('idle') }} className="w-7 h-7 flex items-center justify-center text-sm hover:bg-gray-100">+</button>
          </div>
          <button
            onClick={handleAdd}
            disabled={status === 'adding'}
            className={`flex-1 py-1.5 rounded text-xs font-bold uppercase transition-colors ${
              status === 'added' ? 'bg-green-500 text-white' :
              status === 'adding' ? 'bg-gray-300 text-gray-500' :
              'bg-reebok-red text-white hover:bg-red-700'
            }`}
          >
            {status === 'added' ? (orderQty > 0 ? `En pedido (${qty})` : 'Agregado!') : status === 'adding' ? '...' : 'Agregar'}
          </button>
        </div>

        {/* No active order prompt */}
        {status === 'no-order' && (
          <div className="mt-2 bg-gray-50 rounded p-2 text-center">
            <p className="text-[10px] text-gray-500 mb-1">No hay pedido activo</p>
            <div className="flex gap-1">
              <button onClick={() => router.push('/catalogo/reebok/pedidos')} className="flex-1 text-[10px] bg-reebok-red text-white py-1 rounded hover:bg-red-700 transition">
                Nuevo pedido
              </button>
              <button onClick={() => setStatus('idle')} className="text-[10px] text-gray-400 px-2">✕</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
