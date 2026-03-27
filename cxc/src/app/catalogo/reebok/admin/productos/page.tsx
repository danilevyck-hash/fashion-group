'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Product } from '@/components/reebok/supabase'
import AdminNav from '@/components/reebok/AdminNav'

export default function AdminProductos() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ created: number; updated: number; errors: number } | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('cxc_role') !== 'admin') {
      router.push('/catalogo/reebok/admin')
      return
    }
    loadProducts()
  }, [router])

  const loadProducts = () => {
    fetch('/api/catalogo/reebok/products')
      .then(r => r.json())
      .then(data => { setProducts(Array.isArray(data) ? data : []); setLoading(false) })
  }

  const toggleField = async (product: Product, field: 'active' | 'on_sale') => {
    await fetch('/api/catalogo/reebok/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, [field]: !product[field] }),
    })
    loadProducts()
  }

  const deleteProduct = async (id: string) => {
    if (!confirm('Eliminar este producto?')) return
    await fetch(`/api/catalogo/reebok/products?id=${id}`, { method: 'DELETE' })
    loadProducts()
  }

  const downloadTemplate = async () => {
    setUploading(true)
    try {
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Productos')
      ws.columns = [
        { header: 'CODIGO', key: 'sku', width: 15 },
        { header: 'NOMBRE', key: 'name', width: 35 },
        { header: 'PRECIO', key: 'price', width: 12 },
        { header: 'GENERO', key: 'gender', width: 12 },
        { header: 'CATEGORIA', key: 'category', width: 15 },
        { header: 'EXISTENCIA', key: 'quantity', width: 12 },
        { header: 'OFERTA', key: 'on_sale', width: 10 },
        { header: 'ACTIVO', key: 'active', width: 10 },
      ]
      // Style header
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } }

      // Fetch inventory
      const invRes = await fetch('/api/catalogo/reebok/inventory')
      const invData = await invRes.json()
      const invMap: Record<string, number> = {}
      if (Array.isArray(invData)) {
        invData.forEach((i: { product_id: string; quantity: number }) => {
          invMap[i.product_id] = (invMap[i.product_id] || 0) + i.quantity
        })
      }

      // Fill with current products
      products.forEach(p => {
        const gLabel = p.gender === 'male' ? 'Hombre' : p.gender === 'female' ? 'Mujer' : p.gender === 'kids' ? 'Ninos' : 'Unisex'
        const cLabel = p.category === 'footwear' ? 'Calzado' : p.category === 'apparel' ? 'Ropa' : 'Accesorios'
        ws.addRow({
          sku: p.sku,
          name: p.name,
          price: p.price || 0,
          gender: gLabel,
          category: cLabel,
          quantity: invMap[p.id] || 0,
          on_sale: p.on_sale ? 'Si' : 'No',
          active: p.active ? 'Si' : 'No',
        })
      })

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
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
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      const buffer = await file.arrayBuffer()
      await wb.xlsx.load(buffer)
      const ws = wb.worksheets[0]

      const items: { sku: string; name: string; price?: number; gender?: string; category?: string; quantity?: number; on_sale?: boolean; active?: boolean }[] = []
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const sku = row.getCell(1).value?.toString()?.trim()
        const name = row.getCell(2).value?.toString()?.trim()
        if (!sku) continue

        const gRaw = row.getCell(4).value?.toString()?.trim()?.toLowerCase() || ''
        const gender = gRaw.includes('hombre') || gRaw === 'male' ? 'male' : gRaw.includes('mujer') || gRaw === 'female' ? 'female' : gRaw.includes('nino') || gRaw === 'kids' ? 'kids' : 'unisex'
        const cRaw = row.getCell(5).value?.toString()?.trim()?.toLowerCase() || ''
        const category = cRaw.includes('calzado') || cRaw === 'footwear' ? 'footwear' : cRaw.includes('ropa') || cRaw === 'apparel' ? 'apparel' : 'accessories'
        const onSaleRaw = row.getCell(7).value?.toString()?.trim()?.toLowerCase() || ''
        const activeRaw = row.getCell(8).value?.toString()?.trim()?.toLowerCase() || ''

        items.push({
          sku,
          name: name || '',
          price: parseFloat(row.getCell(3).value?.toString() || '0') || undefined,
          gender,
          category,
          quantity: parseInt(row.getCell(6).value?.toString() || '0') || 0,
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
      loadProducts()
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-2">Foto</th>
                <th className="text-left py-3 px-2">SKU</th>
                <th className="text-left py-3 px-2">Nombre</th>
                <th className="text-left py-3 px-2">Color</th>
                <th className="text-left py-3 px-2">Precio</th>
                <th className="text-left py-3 px-2">Categoria</th>
                <th className="text-left py-3 px-2">Genero</th>
                <th className="text-left py-3 px-2">Activo</th>
                <th className="text-left py-3 px-2">Oferta</th>
                <th className="text-left py-3 px-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2">
                    <div className="w-12 h-12 bg-reebok-grey rounded overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">-</div>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs">{p.sku || '-'}</td>
                  <td className="py-2 px-2 font-medium">{p.name}</td>
                  <td className="py-2 px-2 text-gray-600">{p.color || '-'}</td>
                  <td className="py-2 px-2">{p.price ? `$${p.price}` : '-'}</td>
                  <td className="py-2 px-2">{p.category}</td>
                  <td className="py-2 px-2">{p.gender || '-'}</td>
                  <td className="py-2 px-2">
                    <button onClick={() => toggleField(p, 'active')} className={`px-2 py-1 rounded text-xs font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.active ? 'Si' : 'No'}
                    </button>
                  </td>
                  <td className="py-2 px-2">
                    <button onClick={() => toggleField(p, 'on_sale')} className={`px-2 py-1 rounded text-xs font-medium ${p.on_sale ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.on_sale ? 'Si' : 'No'}
                    </button>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex gap-2">
                      <Link href={`/admin/productos/nuevo?id=${p.id}`} className="text-blue-600 hover:underline text-xs">Editar</Link>
                      <button onClick={() => deleteProduct(p.id)} className="text-red-600 hover:underline text-xs">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && <p className="text-center py-10 text-gray-500">No hay productos. Agrega el primero!</p>}
        </div>
      )}
    </div>
  )
}
