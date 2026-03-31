'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import XLSX from 'xlsx-js-style'
import { Product, InventoryItem } from '@/components/reebok/supabase'
import AdminNav from '@/components/reebok/AdminNav'

export default function AdminProductos() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ created: number; updated: number; errors: number } | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)

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
    setProducts(Array.isArray(prods) ? prods : [])
    setInventory(Array.isArray(inv) ? inv : [])
    setLoading(false)
  }

  const getInventory = (productId: string) => inventory.filter(i => i.product_id === productId)
  const getTotalQty = (productId: string) => getInventory(productId).reduce((s, i) => s + i.quantity, 0)

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleField = async (product: Product, field: 'active' | 'on_sale') => {
    await fetch('/api/catalogo/reebok/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, [field]: !product[field] }),
    })
    loadData()
  }

  const deleteProduct = async (id: string) => {
    if (!confirm('Eliminar este producto? Esta accion no se puede deshacer.')) return
    try {
      const res = await fetch(`/api/catalogo/reebok/products?id=${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(`Error al eliminar: ${data.error || `HTTP ${res.status}`}`)
        return
      }
      setProducts(prev => prev.filter(p => p.id !== id))
      setInventory(prev => prev.filter(i => i.product_id !== id))
    } catch (err) {
      alert(`Error de conexion: ${err}`)
    }
  }

  // ── Inventory actions ──

  const addSize = async (productId: string, size: string, quantity: number) => {
    await fetch('/api/catalogo/reebok/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, size, quantity }),
    })
    const inv = await fetch('/api/catalogo/reebok/inventory').then(r => r.json())
    setInventory(Array.isArray(inv) ? inv : [])
  }

  const updateQty = async (invId: string, quantity: number) => {
    await fetch('/api/catalogo/reebok/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: invId, quantity }),
    })
    setInventory(prev => prev.map(i => i.id === invId ? { ...i, quantity } : i))
  }

  const deleteSize = async (invId: string) => {
    await fetch(`/api/catalogo/reebok/inventory?id=${invId}`, { method: 'DELETE' })
    setInventory(prev => prev.filter(i => i.id !== invId))
  }

  // ── Excel template ──

  const downloadTemplate = async () => {
    setUploading(true)
    try {
      const invMap: Record<string, number> = {}
      inventory.forEach(i => { invMap[i.product_id] = (invMap[i.product_id] || 0) + i.quantity })

      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: 'CC0000' }, patternType: 'solid' as const },
      }
      const headers = ['CODIGO', 'NOMBRE', 'PRECIO', 'GENERO', 'CATEGORIA', 'EXISTENCIA', 'OFERTA', 'ACTIVO']
      const headerRow = headers.map(h => ({ v: h, s: headerStyle }))

      const dataRows = products.map(p => {
        const gLabel = p.gender === 'male' ? 'Hombre' : p.gender === 'female' ? 'Mujer' : p.gender === 'kids' ? 'Ninos' : 'Unisex'
        const cLabel = p.category === 'footwear' ? 'Calzado' : p.category === 'apparel' ? 'Ropa' : 'Accesorios'
        return [p.sku, p.name, p.price || 0, gLabel, cLabel, invMap[p.id] || 0, p.on_sale ? 'Si' : 'No', p.active ? 'Si' : 'No']
      })

      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
      ws['!cols'] = [
        { wch: 15 }, { wch: 35 }, { wch: 12 }, { wch: 12 },
        { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Productos')

      const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'plantilla-productos-reebok.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error(err); alert('Error al generar plantilla') }
    setUploading(false)
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]

      const items: { sku: string; name: string; price?: number; gender?: string; category?: string; quantity?: number; on_sale?: boolean; active?: boolean }[] = []
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]
        const sku = row[0]?.toString()?.trim()
        const name = row[1]?.toString()?.trim()
        if (!sku) continue

        const gRaw = row[3]?.toString()?.trim()?.toLowerCase() || ''
        const gender = gRaw.includes('hombre') || gRaw === 'male' ? 'male' : gRaw.includes('mujer') || gRaw === 'female' ? 'female' : gRaw.includes('nino') || gRaw === 'kids' ? 'kids' : 'unisex'
        const cRaw = row[4]?.toString()?.trim()?.toLowerCase() || ''
        const category = cRaw.includes('calzado') || cRaw === 'footwear' ? 'footwear' : cRaw.includes('ropa') || cRaw === 'apparel' ? 'apparel' : 'accessories'
        const onSaleRaw = row[6]?.toString()?.trim()?.toLowerCase() || ''
        const activeRaw = row[7]?.toString()?.trim()?.toLowerCase() || ''

        items.push({
          sku,
          name: name || '',
          price: parseFloat(row[2]?.toString() || '0') || undefined,
          gender,
          category,
          quantity: parseInt(row[5]?.toString() || '0') || 0,
          on_sale: onSaleRaw === 'si' || onSaleRaw === 'yes' || onSaleRaw === 'true',
          active: activeRaw !== 'no' && activeRaw !== 'false',
        })
      }

      if (items.length === 0) {
        alert('No se encontraron datos en el Excel')
        setUploading(false)
        return
      }

      const res = await fetch('/api/catalogo/reebok/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: items }),
      })
      const result = await res.json()
      setUploadResult(result)
      loadData()
    } catch (err) { console.error(err); alert('Error al procesar archivo') }
    setUploading(false)
    if (csvRef.current) csvRef.current.value = ''
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Link href="/catalogo/reebok/admin/productos/nuevo" className="bg-reebok-red text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700 transition-colors">
          + Agregar Producto
        </Link>
      </div>

      <AdminNav />

      {/* Plantilla Excel */}
      <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
        <h2 className="font-bold text-sm mb-2">Plantilla de productos</h2>
        <p className="text-xs text-gray-600 mb-3">
          Descarga la plantilla con todos los productos actuales. Edita lo que necesites (precio, nombre, genero, etc.) y vuelve a subir. Las fotos NO se tocan — se conectan por el <strong>CODIGO (SKU)</strong>.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={downloadTemplate} disabled={uploading} className="bg-reebok-dark text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
            Descargar plantilla
          </button>
          <label className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 transition-colors cursor-pointer">
            Subir plantilla editada
            <input ref={csvRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
          </label>
          {uploading && <span className="text-sm text-green-600">Procesando...</span>}
        </div>
        {uploadResult && (
          <div className="mt-3 text-sm">
            {uploadResult.created > 0 && <p className="text-green-600">{uploadResult.created} productos nuevos creados</p>}
            {uploadResult.updated > 0 && <p className="text-blue-600">{uploadResult.updated} productos actualizados</p>}
            {uploadResult.errors > 0 && <p className="text-red-500">{uploadResult.errors} errores</p>}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-center py-10 text-gray-500">Cargando...</p>
      ) : (
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Product row */}
              <div className="flex items-center hover:bg-gray-50">
                <button onClick={() => toggle(p.id)} className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0">
                  <div className="w-10 h-10 bg-reebok-grey rounded overflow-hidden flex-shrink-0">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">-</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      {p.sku && <span className="text-xs text-gray-400 font-mono flex-shrink-0">{p.sku}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{p.category}</span>
                      <span className="text-xs text-gray-300">|</span>
                      <span className="text-xs text-gray-400">{p.gender || '-'}</span>
                      {p.price && <>
                        <span className="text-xs text-gray-300">|</span>
                        <span className="text-xs text-gray-400">${p.price}</span>
                      </>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs font-medium ${getTotalQty(p.id) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {getTotalQty(p.id)} uds
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded.has(p.id) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 px-3 flex-shrink-0 border-l border-gray-100">
                  <button onClick={() => toggleField(p, 'active')} className={`px-2 py-1 rounded text-xs font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.active ? 'Activo' : 'Inactivo'}
                  </button>
                  <button onClick={() => toggleField(p, 'on_sale')} className={`px-2 py-1 rounded text-xs font-medium ${p.on_sale ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.on_sale ? 'Oferta' : '-'}
                  </button>
                  <Link href={`/catalogo/reebok/admin/productos/nuevo?id=${p.id}`} className="text-blue-600 hover:underline text-xs px-1">Editar</Link>
                  <button onClick={() => deleteProduct(p.id)} className="text-red-600 hover:underline text-xs px-1">Eliminar</button>
                </div>
              </div>

              {/* Inventory accordion */}
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
                              <button onClick={() => deleteSize(inv.id)} className="text-red-500 text-xs hover:underline">Quitar talla</button>
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
          {products.length === 0 && <p className="text-center py-10 text-gray-500">No hay productos. Agrega el primero!</p>}
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
