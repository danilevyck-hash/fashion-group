'use client'

import { useState } from 'react'
import { Product } from '@/components/reebok/supabase'
import { useCart } from './CartProvider'

export default function ProductCard({ product, stock = 0 }: { product: Product; stock?: number }) {
  const { addToCart } = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const genderLabel = product.gender === 'male' ? 'Hombre' : product.gender === 'female' ? 'Mujer' : product.gender === 'kids' ? 'Ninos' : ''

  const handleAdd = () => {
    addToCart({
      productId: product.id,
      productName: product.name,
      color: product.color || '',
      size: 'UNICA',
      quantity: qty,
      imageUrl: product.image_url || '',
      price: product.price,
    })
    setAdded(true)
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
            {product.price ? `$${product.price.toFixed(2)}` : 'Consultar precio'}
          </p>
          <span className={`text-[10px] font-medium ${stock > 0 ? 'text-green-600' : 'text-red-400'}`}>
            {stock > 0 ? `${stock} disp.` : 'Agotado'}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center border rounded">
            <button onClick={() => { setQty(Math.max(1, qty - 1)); setAdded(false) }} className="w-7 h-7 flex items-center justify-center text-sm hover:bg-gray-100">-</button>
            <span className="w-8 text-center text-sm font-medium">{qty}</span>
            <button onClick={() => { setQty(qty + 1); setAdded(false) }} className="w-7 h-7 flex items-center justify-center text-sm hover:bg-gray-100">+</button>
          </div>
          <button
            onClick={handleAdd}
            className={`flex-1 py-1.5 rounded text-xs font-bold uppercase transition-colors ${
              added ? 'bg-green-500 text-white' : 'bg-reebok-red text-white hover:bg-red-700'
            }`}
          >
            {added ? 'Agregado!' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
