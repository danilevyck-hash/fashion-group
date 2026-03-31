'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Product, InventoryItem } from '@/components/reebok/supabase'
import AdminNav from '@/components/reebok/AdminNav'

export default function Inventario() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ updated: number; skipped: number; notFound: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !['admin', 'secretaria'].includes(sessionStorage.getItem('cxc_role') || '')) {
      router.push('/catalogo/reebok/admin')
      return
    }
    loadData()
  }, [router])

  const loadData = async () => {
    const [prods, inv] = await Promise.all([
      fetch('/api/catalogo/reebok/products').then(r => r.json()),
      fetch('/api/catalogo/reebok/inventory').then(r => r.json()),
    ])
    setProducts(prods)
    setInventory(inv)
    setLoading(false)
  }

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const getInventory = (productId: string) => inventory.filter(i => i.product_id === productId)
  const getTotalQty = (productId: string) => getInventory(productId).reduce((s, i) => s + i.quantity, 0)

  const addSize = async (productId: string, size: string, quantity: number) => {
    await fetch('/api/catalogo/reebok/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, size, quantity }),
    })
    loadData()
  }

  const updateQty = async (id: string, quantity: number) => {
    await fetch('/api/catalogo/reebok/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, quantity }),
    })
    loadData()
  }

  const deleteSize = async (id: string) => {
    await fetch(`/api/catalogo/reebok/inventory?id=${id}`, { method: 'DELETE' })
    loadData()
  }

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)

    try {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

      // Skip header if present
      const startIdx = lines[0]?.toLowerCase().includes('sku') ? 1 : 0
      const items: { sku: string; quantity: number }[] = []

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(/[,;\t]/).map(s => s.trim().replace(/"/g, ''))
        if (parts.length >= 2) {
          const sku = parts[0]
          const qty = parseInt(parts[1])
          if (sku && !isNaN(qty)) {
            items.push({ sku, quantity: qty })
          }
        }
      }

      if (items.length === 0) {
        alert('No se encontraron datos validos. El CSV debe tener: SKU, Cantidad')
        setUploading(false)
        return
      }

      const res = await fetch('/api/catalogo/reebok/inventory/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const result = await res.json()
      setUploadResult(result)
      loadData()
    } catch (err) {
      alert('Error al procesar el archivo')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Inventario</h1>
      <AdminNav />

      {/* CSV Upload */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="font-bold text-sm mb-2">Subir inventario masivo (CSV)</h2>
        <p className="text-xs text-gray-600 mb-3">
          Sube un CSV con dos columnas: <strong>SKU, Cantidad</strong>. Se actualizara la cantidad de cada producto por SKU.
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv"
            onChange={handleCSVUpload}
            className="text-sm"
          />
          {uploading && <span className="text-sm text-blue-600">Subiendo...</span>}
        </div>
        {uploadResult && (
          <div className="mt-3 text-sm">
            <p className="text-green-600 font-medium">✓ {uploadResult.updated} actualizados</p>
            {uploadResult.skipped > 0 && (
              <p className="text-orange-600">⚠ {uploadResult.skipped} omitidos</p>
            )}
            {uploadResult.notFound.length > 0 && (
              <details className="mt-1">
                <summary className="text-xs text-red-500 cursor-pointer">SKUs no encontrados ({uploadResult.notFound.length})</summary>
                <p className="text-xs text-gray-500 mt-1">{uploadResult.notFound.join(', ')}</p>
              </details>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-center py-10 text-gray-500">Cargando...</p>
      ) : (
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(p.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-reebok-grey rounded overflow-hidden flex-shrink-0">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-contain" /> : null}
                  </div>
                  <div>
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.sku && <span className="text-xs text-gray-500 ml-2">({p.sku})</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${getTotalQty(p.id) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {getTotalQty(p.id)} unidades
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${expanded.has(p.id) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {expanded.has(p.id) && (
                <div className="border-t px-4 py-3 bg-gray-50">
                  {getInventory(p.id).length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500">
                          <th className="text-left py-1">Talla</th>
                          <th className="text-left py-1">Cantidad</th>
                          <th className="text-left py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {getInventory(p.id).map(inv => (
                          <tr key={inv.id} className="border-t border-gray-200">
                            <td className="py-1 font-medium">{inv.size}</td>
                            <td className="py-1">
                              <input
                                type="number"
                                value={inv.quantity}
                                onChange={e => updateQty(inv.id, parseInt(e.target.value) || 0)}
                                className="w-20 border rounded px-2 py-1 text-sm"
                                min={0}
                              />
                            </td>
                            <td className="py-1">
                              <button onClick={() => deleteSize(inv.id)} className="text-red-500 text-xs hover:underline">Eliminar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-xs text-gray-500">Sin inventario registrado</p>
                  )}

                  <AddSizeForm onAdd={(size, qty) => addSize(p.id, size, qty)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddSizeForm({ onAdd }: { onAdd: (size: string, qty: number) => void }) {
  const [size, setSize] = useState('')
  const [qty, setQty] = useState('0')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!size) return
    onAdd(size, parseInt(qty) || 0)
    setSize('')
    setQty('0')
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
      <input value={size} onChange={e => setSize(e.target.value)} placeholder="Talla" className="border rounded px-2 py-1 text-sm w-20" />
      <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="Cant" min={0} className="border rounded px-2 py-1 text-sm w-20" />
      <button type="submit" className="text-xs bg-reebok-red text-white px-3 py-1 rounded hover:bg-red-700 transition-colors">Agregar</button>
    </form>
  )
}
