'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function NuevoProductoPage() {
  return <Suspense><NuevoProducto /></Suspense>
}

function NuevoProducto() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [form, setForm] = useState({
    sku: '', name: '', description: '', price: '', category: 'footwear',
    gender: 'male', sub_category: '', color: '', active: true, image_url: '',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !['admin', 'secretaria'].includes(sessionStorage.getItem('cxc_role') || '')) {
      router.push('/catalogo/reebok/admin')
      return
    }
    if (editId) {
      fetch('/api/catalogo/reebok/products')
        .then(r => r.json())
        .then(products => {
          const p = products.find((x: { id: string }) => x.id === editId)
          if (p) setForm({
            sku: p.sku || '', name: p.name, description: p.description || '',
            price: p.price?.toString() || '', category: p.category, gender: p.gender || 'male',
            sub_category: p.sub_category || '', color: p.color || '', active: p.active,
            image_url: p.image_url || '',
          })
        })
    }
  }, [editId, router])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/catalogo/reebok/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.url) setForm(f => ({ ...f, image_url: data.url }))
    setUploading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const body = {
      ...form,
      price: form.price ? parseFloat(form.price) : null,
      ...(editId ? { id: editId } : {}),
    }
    await fetch('/api/catalogo/reebok/products', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    router.push('/catalogo/reebok/admin/productos')
  }

  const set = (key: string, value: string | boolean) => setForm(f => ({ ...f, [key]: value }))

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/catalogo/reebok/admin/productos" className="text-sm text-reebok-red hover:underline mb-6 inline-block">&larr; Volver a productos</Link>
      <h1 className="text-2xl font-bold mb-6">{editId ? 'Editar Producto' : 'Nuevo Producto'}</h1>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">SKU</label>
            <input value={form.sku} onChange={e => set('sku', e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="100000100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nombre *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required className="w-full border rounded px-3 py-2 text-sm" placeholder="NPC II" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Descripcion</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Precio</label>
            <input type="number" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="79.95" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categoria *</label>
            <select value={form.category} onChange={e => set('category', e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
              <option value="footwear">Calzado</option>
              <option value="apparel">Ropa</option>
              <option value="accessories">Accesorios</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Genero</label>
            <select value={form.gender} onChange={e => set('gender', e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
              <option value="kids">Ninos</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Sub-categoria</label>
            <input value={form.sub_category} onChange={e => set('sub_category', e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="classics, running, training" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Color</label>
            <input value={form.color} onChange={e => set('color', e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="WHITE/WHT" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Foto</label>
          {form.image_url ? (
            <div className="flex items-start gap-4">
              <div className="w-40 h-40 bg-reebok-grey rounded overflow-hidden flex-shrink-0">
                <img src={form.image_url} alt="Preview" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer bg-reebok-dark text-white px-4 py-2 rounded text-xs font-medium hover:bg-black transition-colors text-center">
                  {uploading ? 'Subiendo...' : 'Cambiar foto'}
                  <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={() => set('image_url', '')}
                  className="border border-red-500 text-red-500 px-4 py-2 rounded text-xs font-medium hover:bg-red-50 transition-colors"
                >
                  Eliminar foto
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="cursor-pointer inline-block bg-reebok-dark text-white px-4 py-2 rounded text-xs font-medium hover:bg-black transition-colors">
                {uploading ? 'Subiendo...' : 'Agregar foto'}
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              </label>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
          <span className="text-sm">Producto activo (visible en catalogo)</span>
        </label>

        <button type="submit" disabled={saving || !form.name} className="w-full bg-reebok-red text-white py-3 rounded font-bold text-sm uppercase hover:bg-red-700 transition-colors disabled:opacity-50">
          {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear Producto'}
        </button>
      </form>
    </div>
  )
}
