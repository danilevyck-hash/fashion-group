'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, Product, InventoryItem } from '@/components/reebok/supabase'
import { useCart } from '@/components/reebok/CartProvider'

export default function ProductoDetalle() {
  const { id } = useParams()
  const { addToCart } = useCart()
  const [product, setProduct] = useState<Product | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [selectedSize, setSelectedSize] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    supabase.from('products').select('*').eq('id', id).single()
      .then(({ data }) => { if (data) setProduct(data) })
    fetch(`/api/catalogo/reebok/inventory?product_id=${id}`)
      .then(r => r.json())
      .then(data => setInventory(data))
  }, [id])

  const availableSizes = inventory.filter(i => i.quantity > 0)

  const handleAdd = () => {
    if (!product || !selectedSize) return
    addToCart({
      productId: product.id,
      productName: product.name,
      color: product.color || '',
      size: selectedSize,
      quantity,
      imageUrl: product.image_url || '',
      price: product.price,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  if (!product) return <div className="text-center py-20 text-gray-500">Cargando...</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-reebok-red hover:underline mb-6 inline-block">&larr; Volver al catalogo</Link>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="aspect-square bg-reebok-grey rounded-lg overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        <div>
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          {product.sku && <p className="text-sm text-gray-500 mb-1">SKU: {product.sku}</p>}
          {product.color && <p className="text-sm text-gray-500 mb-4">Color: {product.color}</p>}
          <p className="text-2xl font-bold text-reebok-red mb-4">
            {product.price ? `$${product.price.toFixed(2)}` : 'Consultar precio'}
          </p>
          {product.description && <p className="text-gray-600 mb-6">{product.description}</p>}

          {availableSizes.length > 0 ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Talla</label>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map(inv => (
                    <button
                      key={inv.size}
                      onClick={() => setSelectedSize(inv.size)}
                      className={`px-4 py-2 border rounded text-sm font-medium transition-colors ${
                        selectedSize === inv.size
                          ? 'bg-reebok-dark text-white border-reebok-dark'
                          : 'border-gray-300 hover:border-reebok-dark'
                      }`}
                    >
                      {inv.size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Cantidad</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 border rounded flex items-center justify-center text-lg">-</button>
                  <span className="text-lg font-medium w-8 text-center">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 border rounded flex items-center justify-center text-lg">+</button>
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={!selectedSize}
                className="w-full bg-reebok-red text-white py-3 rounded font-bold text-sm uppercase tracking-wider hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {added ? 'Agregado al pedido!' : 'Agregar al pedido'}
              </button>
            </>
          ) : (
            <div className="bg-reebok-grey p-4 rounded text-center">
              <p className="text-gray-600">Tallas no disponibles en este momento</p>
              <p className="text-sm text-gray-500 mt-1">Consulta disponibilidad por WhatsApp</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
