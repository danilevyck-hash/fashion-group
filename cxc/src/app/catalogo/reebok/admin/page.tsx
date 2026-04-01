'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Product, InventoryItem } from '@/components/reebok/supabase'
import { useToast } from '@/components/ToastSystem'

// ── Types ──────────────────────────────────────────────────────────────────────

type InventoryResult = {
  updated: { sku: string; name: string; anterior: number; nueva: number }[]
  wentToZero: { sku: string; name: string }[]
  notFound: { codigo: string; descripcion: string }[]
  notInCSV: { sku: string; name: string }[]
}

type PhotoResult = {
  filename: string
  sku: string
  status: 'success' | 'no_match' | 'error'
  message: string
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
}

function copyToClipboard(text: string) { navigator.clipboard.writeText(text) }

function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-reebok-red ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="mt-12 mb-6 flex items-center gap-4">
      <div className="flex-1 border-t border-gray-200" />
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{title}</h2>
      <div className="flex-1 border-t border-gray-200" />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function ReebokAdmin() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  // Shared data — loaded once, passed to sections that need it
  const [products, setProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const role = sessionStorage.getItem('cxc_role')
    if (!role || !['admin', 'secretaria'].includes(role)) { router.replace('/'); return }
    setAuthorized(true)
    loadData()
  }, [router])

  const loadData = async () => {
    const [p, i] = await Promise.all([
      fetch('/api/catalogo/reebok/products').then(r => r.json()),
      fetch('/api/catalogo/reebok/inventory').then(r => r.json()),
    ])
    setProducts(Array.isArray(p) ? p : [])
    setInventory(Array.isArray(i) ? i : [])
    setLoading(false)
  }

  if (!authorized) return null

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Admin Reebok</h1>

      {/* ── SECTION 1: Products ── */}
      <SectionDivider title="Productos" />
      <ProductsListSection
        products={products}
        inventory={inventory}
        loading={loading}
        setProducts={setProducts}
        setInventory={setInventory}
        reloadInventory={async () => {
          const inv = await fetch('/api/catalogo/reebok/inventory').then(r => r.json())
          setInventory(Array.isArray(inv) ? inv : [])
        }}
      />

      {/* ── SECTION 2: Inventory Update ── */}
      <SectionDivider title="Actualizar Inventario" />
      <InventoryUpdateSection />

      {/* ── SECTION 3: Import & Export ── */}
      <SectionDivider title="Importar y Exportar" />
      <ImportExportSection products={products} inventory={inventory} onDataChange={loadData} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — PRODUCTS LIST WITH ACCORDION
// ══════════════════════════════════════════════════════════════════════════════

function ProductsListSection({
  products, inventory, loading, setProducts, setInventory, reloadInventory,
}: {
  products: Product[]
  inventory: InventoryItem[]
  loading: boolean
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>
  reloadInventory: () => Promise<void>
}) {
  const { toast, confirm } = useToast()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const getInv = (pid: string) => inventory.filter(i => i.product_id === pid)
  const getTotal = (pid: string) => getInv(pid).reduce((s, i) => s + i.quantity, 0)

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase())
  )

  const toggleField = async (p: Product, field: 'active' | 'on_sale') => {
    const res = await fetch('/api/catalogo/reebok/products', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, [field]: !p[field] }),
    })
    if (!res.ok) { toast('Error al actualizar', 'error'); return }
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, [field]: !x[field] } : x))
  }

  const deleteProduct = async (id: string) => {
    if (!await confirm('Eliminar este producto? No se puede deshacer.')) return
    try {
      const res = await fetch(`/api/catalogo/reebok/products?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast(`Error: ${d.error || res.status}`, 'error'); return }
      setProducts(prev => prev.filter(p => p.id !== id))
      setInventory(prev => prev.filter(i => i.product_id !== id))
    } catch (err) { toast(`Error: ${err}`, 'error') }
  }

  const addSize = async (productId: string, size: string, quantity: number) => {
    await fetch('/api/catalogo/reebok/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, size, quantity }),
    })
    await reloadInventory()
  }

  const updateQty = async (invId: string, quantity: number) => {
    await fetch('/api/catalogo/reebok/inventory', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: invId, quantity }),
    })
    setInventory(prev => prev.map(i => i.id === invId ? { ...i, quantity } : i))
  }

  const deleteSize = async (invId: string) => {
    await fetch(`/api/catalogo/reebok/inventory?id=${invId}`, { method: 'DELETE' })
    setInventory(prev => prev.filter(i => i.id !== invId))
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>

  return (
    <div>
      {/* Search + Add */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o SKU..." aria-label="Buscar productos"
          className="flex-1 border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition"
        />
        <Link href="/catalogo/reebok/admin/productos/nuevo"
          className="bg-black text-white px-4 py-2 rounded text-xs font-medium hover:bg-gray-800 transition-colors whitespace-nowrap">
          + Agregar
        </Link>
        <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} productos</span>
      </div>

      {/* Product list */}
      <div className="space-y-1">
        {filtered.map(p => (
          <div key={p.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Row */}
            <div className="flex items-center hover:bg-gray-50 transition-colors">
              <button onClick={() => toggle(p.id)} className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left min-w-0">
                <div className="w-9 h-9 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                  {p.image_url
                    ? <img src={p.image_url} alt="" className="w-full h-full object-contain" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">—</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {p.sku && <span className="font-mono">{p.sku}</span>}
                    {p.sku && ' · '}{p.category} · {p.gender || '—'}
                    {p.price ? ` · $${p.price}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium tabular-nums ${getTotal(p.id) > 0 ? 'text-green-600' : 'text-red-400'}`}>
                    {getTotal(p.id)}
                  </span>
                  <svg className={`w-3.5 h-3.5 text-gray-300 transition-transform ${expanded.has(p.id) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {/* Actions */}
              <div className="flex items-center gap-1 px-2 flex-shrink-0 border-l border-gray-100">
                <button onClick={() => toggleField(p, 'active')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {p.active ? 'Activo' : 'Inactivo'}
                </button>
                <button onClick={() => toggleField(p, 'on_sale')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.on_sale ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
                  {p.on_sale ? 'Oferta' : '—'}
                </button>
                <Link href={`/catalogo/reebok/admin/productos/nuevo?id=${p.id}`} className="text-blue-600 text-[11px] px-1 hover:underline">Editar</Link>
                <button onClick={() => deleteProduct(p.id)} className="text-red-500 text-[11px] px-1 hover:underline">Eliminar</button>
              </div>
            </div>

            {/* Inventory accordion */}
            {expanded.has(p.id) && (
              <div className="border-t px-4 py-3 bg-gray-50">
                {getInv(p.id).length > 0 ? (
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-gray-500">
                      <th className="text-left py-1">Talla</th><th className="text-left py-1">Cantidad</th><th />
                    </tr></thead>
                    <tbody>
                      {getInv(p.id).map(inv => (
                        <tr key={inv.id} className="border-t border-gray-200">
                          <td className="py-1 font-medium">{inv.size}</td>
                          <td className="py-1">
                            <input type="number" value={inv.quantity} min={0} step={1}
                              onChange={e => updateQty(inv.id, parseInt(e.target.value) || 0)}
                              className="w-20 border rounded px-2 py-1 text-sm" />
                          </td>
                          <td className="py-1">
                            <button onClick={() => deleteSize(inv.id)} className="text-red-500 text-xs hover:underline">Quitar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-xs text-gray-400">Sin inventario</p>}
                <AddSizeForm onAdd={(size, qty) => addSize(p.id, size, qty)} />
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">{search ? 'Sin resultados' : 'No hay productos'}</p>}
      </div>
    </div>
  )
}

function AddSizeForm({ onAdd }: { onAdd: (size: string, qty: number) => void }) {
  const [size, setSize] = useState('')
  const [qty, setQty] = useState('0')
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!size) return; onAdd(size, parseInt(qty) || 0); setSize(''); setQty('0') }
  return (
    <form onSubmit={submit} className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
      <input value={size} onChange={e => setSize(e.target.value)} placeholder="Talla" className="border rounded px-2 py-1 text-sm w-20" />
      <input type="number" value={qty} onChange={e => setQty(e.target.value)} min={0} className="border rounded px-2 py-1 text-sm w-20" />
      <button type="submit" className="text-xs bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition-colors">Agregar</button>
    </form>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — INVENTORY UPDATE (Active Shoes / Active Wear)
// ══════════════════════════════════════════════════════════════════════════════

function InventoryUpdateSection() {
  const { toast } = useToast()
  const [shoesResult, setShoesResult] = useState<InventoryResult | null>(null)
  const [wearResult, setWearResult] = useState<InventoryResult | null>(null)
  const onError = useCallback((msg: string) => toast(msg, 'error'), [toast])

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Switch Soft &rarr; Stock Articulos &rarr; Listado de Articulos &rarr; Descargar (primera opcion). Sube cada empresa por separado.
      </p>
      <div className="space-y-5">
        <InventoryZone label="Active Shoes" empresa="shoes" notInCSVLabel="en footwear del website pero no en este CSV" result={shoesResult} onResult={setShoesResult} onError={onError} />
        <InventoryZone label="Active Wear" empresa="wear" notInCSVLabel="en apparel/accesorios del website pero no en este CSV" result={wearResult} onResult={setWearResult} onError={onError} />
      </div>
    </div>
  )
}

function InventoryZone({ label, empresa, notInCSVLabel, result, onResult, onError }: {
  label: string; empresa: 'shoes' | 'wear'; notInCSVLabel: string
  result: InventoryResult | null; onResult: (r: InventoryResult | null) => void; onError: (msg: string) => void
}) {
  const [processing, setProcessing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const processCSV = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) return
    setProcessing(true)
    try {
      const text = new TextDecoder('latin1').decode(await file.arrayBuffer())
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { setProcessing(false); return }

      const header = lines[0].split(';').map(h => h.trim().replace(/"/g, ''))
      const codigoIdx = header.findIndex(h => normalizeHeader(h) === 'CODIGO')
      const existenciaIdx = header.findIndex(h => normalizeHeader(h) === 'EXISTENCIA')
      const descripcionIdx = header.findIndex(h => normalizeHeader(h) === 'DESCRIPCION')
      if (codigoIdx === -1 || existenciaIdx === -1) { onError('CSV sin columnas CODIGO/EXISTENCIA'); setProcessing(false); return }

      const map = new Map<string, { existencia: number; descripcion: string }>()
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''))
        const codigo = cols[codigoIdx], existencia = parseInt(cols[existenciaIdx])
        if (codigo && !isNaN(existencia)) map.set(codigo, { existencia, descripcion: descripcionIdx !== -1 ? cols[descripcionIdx] || '' : '' })
      }

      const items = Array.from(map.entries()).map(([codigo, d]) => ({ codigo, existencia: d.existencia, descripcion: d.descripcion }))
      const res = await fetch('/api/catalogo/reebok/inventory/switchsoft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, empresa }),
      })
      onResult(await res.json())
    } catch { onError('Error al procesar') }
    setProcessing(false)
  }, [onResult, empresa, onError])

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) processCSV(e.dataTransfer.files[0]) }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>
      {processing ? (
        <div className="flex justify-center py-8 border border-gray-200 rounded-lg"><Spinner /></div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${dragging ? 'border-reebok-red bg-red-50' : 'border-gray-300 hover:border-gray-400'}`}>
          <p className="text-sm font-medium">Subir CSV — {label}</p>
          <p className="text-xs text-gray-400">.csv</p>
          <input ref={fileRef} type="file" accept=".csv" onChange={e => { if (e.target.files?.[0]) processCSV(e.target.files[0]); e.target.value = '' }} className="hidden" />
        </div>
      )}
      {result && (
        <>
          <InventoryResultBlock result={result} notInCSVLabel={notInCSVLabel} />
          <button onClick={() => onResult(null)} className="text-xs text-gray-400 hover:text-gray-600 underline mt-2">Limpiar</button>
        </>
      )}
    </div>
  )
}

function InventoryResultBlock({ result, notInCSVLabel }: { result: InventoryResult; notInCSVLabel: string }) {
  const [showUpdated, setShowUpdated] = useState(false)
  return (
    <div className="mt-3 space-y-2">
      {result.updated.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <button onClick={() => setShowUpdated(v => !v)} className="w-full flex items-center justify-between text-left">
            <span className="text-sm font-medium text-green-800">{result.updated.length} actualizados</span>
            <svg className={`w-4 h-4 text-green-600 transition-transform ${showUpdated ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showUpdated && (
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="w-full text-xs"><thead className="sticky top-0 bg-green-50"><tr className="text-left text-green-700"><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Nombre</th><th className="py-1 text-right">Ant</th><th className="py-1 text-right pl-2">Nueva</th></tr></thead>
                <tbody>{result.updated.map((item, i) => (
                  <tr key={i} className="border-t border-green-100"><td className="py-1 pr-2 font-mono">{item.sku}</td><td className="py-1 pr-2 truncate max-w-[180px]">{item.name}</td><td className="py-1 text-right text-gray-500">{item.anterior}</td><td className="py-1 text-right pl-2 font-medium">{item.nueva}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {result.wentToZero.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-sm font-medium text-amber-800">{result.wentToZero.length} quedaron en 0</span>
            <button onClick={() => copyToClipboard(result.wentToZero.map(i => `${i.sku}\t${i.name}`).join('\n'))} className="text-xs text-amber-700 hover:text-amber-900 underline">Copiar</button></div>
          <div className="max-h-32 overflow-y-auto text-xs text-amber-700 font-mono space-y-0.5">{result.wentToZero.map((item, i) => <div key={i}>{item.sku} — {item.name}</div>)}</div>
          <p className="text-xs text-amber-600 mt-2 italic">Revisar si se deben inactivar</p>
        </div>
      )}
      {result.notFound.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-sm font-medium text-blue-800">{result.notFound.length} en CSV pero no en website</span>
            <button onClick={() => copyToClipboard(result.notFound.map(i => `${i.codigo}\t${i.descripcion}`).join('\n'))} className="text-xs text-blue-700 hover:text-blue-900 underline">Copiar</button></div>
          <div className="max-h-32 overflow-y-auto text-xs text-blue-700 font-mono space-y-0.5">{result.notFound.map((item, i) => <div key={i}>{item.codigo} — {item.descripcion}</div>)}</div>
        </div>
      )}
      {result.notInCSV.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-sm font-medium text-gray-700">{result.notInCSV.length} {notInCSVLabel}</span>
            <button onClick={() => copyToClipboard(result.notInCSV.map(i => `${i.sku}\t${i.name}`).join('\n'))} className="text-xs text-gray-600 hover:text-gray-800 underline">Copiar</button></div>
          <div className="max-h-32 overflow-y-auto text-xs text-gray-600 font-mono space-y-0.5">{result.notInCSV.map((item, i) => <div key={i}>{item.sku} — {item.name}</div>)}</div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — IMPORT, PHOTOS, EXPORT
// ══════════════════════════════════════════════════════════════════════════════

function ImportExportSection({ products, inventory, onDataChange }: {
  products: Product[]; inventory: InventoryItem[]; onDataChange: () => void
}) {
  const [active, setActive] = useState<'import' | 'photos' | 'export' | null>(null)
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(['import', 'photos', 'export'] as const).map(key => {
          const labels = { import: 'Agregar productos', photos: 'Subir fotos', export: 'Exportar catálogo' }
          return (
            <button key={key} onClick={() => setActive(active === key ? null : key)}
              className={`py-3 rounded-lg text-sm font-medium transition-colors ${active === key ? 'bg-black text-white' : 'border border-gray-200 text-gray-700 hover:border-gray-400'}`}>
              {labels[key]}
            </button>
          )
        })}
      </div>
      {active === 'import' && <ImportPanel onDone={onDataChange} />}
      {active === 'photos' && <PhotosPanel />}
      {active === 'export' && <ExportPanel products={products} inventory={inventory} />}
    </div>
  )
}

// ── Import Panel ──

function ImportPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; errors: number } | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  function autoMapHeaders(headers: string[]) {
    const fm: Record<number, string> = {}
    headers.forEach((h, i) => {
      const l = h.toLowerCase().replace(/[^a-z]/g, '')
      if (l.includes('sku') || l.includes('codigo') || l.includes('item') || l.includes('style')) fm[i] = 'sku'
      else if (l.includes('nombre') || l === 'name' || l.includes('modelo')) fm[i] = 'name'
      else if (l.includes('precio') || l === 'price' || l.includes('rrp') || l.includes('retail') || l.includes('wsp')) fm[i] = 'price'
      else if (l.includes('color') || l.includes('colour')) fm[i] = 'color'
      else if (l.includes('categ') || l.includes('depart')) fm[i] = 'category'
      else if (l.includes('gender') || l.includes('genero') || l.includes('sexo')) fm[i] = 'gender'
      else if (l.includes('sub') || l.includes('segment') || l.includes('tipo')) fm[i] = 'sub_category'
      else if (l.includes('desc')) fm[i] = 'description'
      else if (l.includes('existencia') || l.includes('quantity') || l.includes('cantidad') || l.includes('qty')) fm[i] = 'quantity'
      else if (l.includes('oferta') || l.includes('sale')) fm[i] = 'on_sale'
      else if (l.includes('activo') || l.includes('active')) fm[i] = 'active'
    })
    return fm
  }

  function rowToProduct(cols: string[], fm: Record<number, string>) {
    const p: Record<string, string | number | boolean | undefined> = {}
    Object.entries(fm).forEach(([idx, field]) => {
      const v = cols[parseInt(idx)] || ''; if (!v) return
      if (field === 'price') { const n = parseFloat(v.replace(/[^0-9.,]/g, '').replace(',', '.')); p[field] = isNaN(n) ? undefined : n }
      else if (field === 'gender') { const x = v.toLowerCase(); p[field] = x.includes('hombre') || x.includes('male') || x === 'm' ? 'male' : x.includes('mujer') || x.includes('female') || x === 'f' ? 'female' : x.includes('nino') || x.includes('kid') ? 'kids' : x.includes('unisex') ? 'unisex' : v }
      else if (field === 'category') { const x = v.toLowerCase(); p[field] = x.includes('foot') || x.includes('calzado') ? 'footwear' : x.includes('apparel') || x.includes('ropa') ? 'apparel' : x.includes('acces') ? 'accessories' : v || 'footwear' }
      else if (field === 'quantity') p[field] = parseInt(v) || 0
      else if (field === 'on_sale') { const x = v.toLowerCase(); p[field] = x === 'si' || x === 'yes' || x === 'true' }
      else if (field === 'active') { const x = v.toLowerCase(); p[field] = x !== 'no' && x !== 'false' }
      else p[field] = v
    })
    if (!p.sku) return null
    if (!p.category) p.category = 'footwear'; if (!p.name) p.name = p.sku as string; if (p.active === undefined) p.active = true
    return p
  }

  async function parseCSV(file: File) {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []
    const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
    const parseLine = (line: string) => {
      const r: string[] = []; let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
        else if (ch === delimiter && !inQ) { r.push(cur.trim()); cur = '' } else cur += ch
      }
      r.push(cur.trim()); return r
    }
    const headers = parseLine(lines[0])
    const fm = autoMapHeaders(headers)
    const prods: Record<string, string | number | boolean | undefined>[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]); if (cols.every(c => !c)) continue
      const p = rowToProduct(cols, fm); if (p) prods.push(p)
    }
    return prods
  }

  async function parseExcel(file: File) {
    const XLSX = (await import('xlsx-js-style')).default
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
    if (rows.length < 2) return []
    const headers = rows[0].map(h => String(h))
    const fm = autoMapHeaders(headers)
    const prods: Record<string, string | number | boolean | undefined>[] = []
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].map(c => String(c).trim()); if (cols.every(c => !c)) continue
      const p = rowToProduct(cols, fm); if (p) prods.push(p)
    }
    return prods
  }

  const handleFile = async (file: File) => {
    setProcessing(true); setResult(null)
    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
      const prods = isExcel ? await parseExcel(file) : await parseCSV(file)
      if (prods.length === 0) { toast('Sin productos válidos', 'warning'); setProcessing(false); return }
      const res = await fetch('/api/catalogo/reebok/products/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ products: prods }) })
      setResult(await res.json()); onDone()
    } catch { toast('Error al procesar', 'error') }
    setProcessing(false); if (ref.current) ref.current.value = ''
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      {processing ? <div className="flex justify-center py-6"><Spinner className="h-5 w-5" /></div>
        : result ? (
          <div className="text-sm space-y-1">
            {result.created > 0 && <p className="text-green-700">{result.created} nuevos</p>}
            {result.updated > 0 && <p className="text-blue-700">{result.updated} actualizados</p>}
            {result.errors > 0 && <p className="text-red-600">{result.errors} errores</p>}
            <button onClick={() => setResult(null)} className="text-xs text-gray-500 underline mt-2">Subir otro</button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800 cursor-pointer">
            Seleccionar CSV o Excel
            <input ref={ref} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} className="hidden" />
          </label>
        )}
    </div>
  )
}

// ── Photos Panel ──

function PhotosPanel() {
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [results, setResults] = useState<PhotoResult[]>([])
  const ref = useRef<HTMLInputElement>(null)

  const processFiles = async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/')); if (!imgs.length) return
    setProcessing(true); setProgress({ current: 0, total: imgs.length }); setResults([])
    const prods = await fetch('/api/catalogo/reebok/products').then(r => r.json())
    const out: PhotoResult[] = []
    for (let i = 0; i < imgs.length; i++) {
      const file = imgs[i], sku = file.name.replace(/\.[^.]+$/, '')
      setProgress({ current: i + 1, total: imgs.length })
      const match = prods.find((p: { sku: string | null }) => p.sku && (p.sku === sku || p.sku.toLowerCase() === sku.toLowerCase()))
      if (!match) { out.push({ filename: file.name, sku, status: 'no_match', message: 'SKU no encontrado' }); continue }
      try {
        const fd = new FormData(); fd.append('file', file)
        const u = await fetch('/api/catalogo/reebok/upload', { method: 'POST', body: fd }).then(r => r.json())
        if (!u.url) throw new Error(u.error || 'Upload failed')
        await fetch('/api/catalogo/reebok/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: match.id, image_url: u.url }) })
        out.push({ filename: file.name, sku, status: 'success', message: match.name })
      } catch (err) { out.push({ filename: file.name, sku, status: 'error', message: String(err) }) }
    }
    setResults(out); setProcessing(false)
  }

  const ok = results.filter(r => r.status === 'success').length
  const fail = results.filter(r => r.status !== 'success').length

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      {processing ? (
        <div><div className="flex justify-between text-sm mb-1"><span>Procesando...</span><span>{progress.current}/{progress.total}</span></div>
          <div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-reebok-red h-1.5 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} /></div></div>
      ) : results.length > 0 ? (
        <div className="text-sm space-y-2">
          {ok > 0 && <p className="text-green-700">{ok} fotos asignadas</p>}
          {fail > 0 && <><p className="text-amber-700">{fail} sin match o error</p>
            <div className="max-h-32 overflow-y-auto text-xs space-y-0.5">{results.filter(r => r.status !== 'success').map((r, i) => <div key={i} className="text-amber-600 font-mono">{r.filename} — {r.message}</div>)}</div></>}
          <button onClick={() => setResults([])} className="text-xs text-gray-500 underline">Subir mas</button>
        </div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files) }}
          onClick={() => ref.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragging ? 'border-reebok-red bg-red-50' : 'border-gray-200 hover:border-gray-400'}`}>
          <p className="text-sm font-medium">Arrastra fotos o haz click</p>
          <p className="text-xs text-gray-400 mt-1">Nombre = SKU (ej: 100202579.jpg)</p>
          <input ref={ref} type="file" multiple accept="image/*" onChange={e => { if (e.target.files) processFiles(e.target.files) }} className="hidden" />
        </div>
      )}
    </div>
  )
}

// ── Export Panel ──

function ExportPanel({ products, inventory }: { products: Product[]; inventory: InventoryItem[] }) {
  const { toast } = useToast()
  const [exporting, setExporting] = useState('')
  const getSizes = (pid: string) => inventory.filter(i => i.product_id === pid && i.quantity > 0).map(i => i.size).join(', ')

  const exportExcel = async () => {
    setExporting('excel')
    try {
      const XLSX = (await import('xlsx-js-style')).default
      const hs = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: 'CC0000' }, patternType: 'solid' as const } }
      const cols = ['SKU', 'Nombre', 'Color', 'Precio', 'Categoría', 'Género', 'Tallas']
      const hr = cols.map(h => ({ v: h, s: hs }))
      const rows = products.filter(p => p.active).map(p => [p.sku || '-', p.name, p.color || '-', p.price ? `$${p.price}` : '-', p.category, p.gender || '-', getSizes(p.id) || '-'])
      const ws = XLSX.utils.aoa_to_sheet([hr, ...rows])
      ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 30 }]
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Catalogo')
      const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'catalogo-reebok.xlsx'; a.click()
    } catch { toast('Error al exportar', 'error') }
    setExporting('')
  }

  const exportPDF = async () => {
    setExporting('pdf')
    try {
      const { jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF('landscape')
      doc.setFontSize(18); doc.text('Catálogo Reebok Panamá', 14, 20)
      doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleDateString('es-PA')}`, 14, 28)
      const active = products.filter(p => p.active)
      const rows = active.slice(0, 100).map(p => [p.sku || '-', p.name, p.color || '-', p.price ? `$${p.price}` : '-', p.category, getSizes(p.id) || '-'])
      autoTable(doc, { startY: 35, head: [['SKU', 'Nombre', 'Color', 'Precio', 'Categoría', 'Tallas']], body: rows, styles: { cellPadding: 3, fontSize: 8 } })
      doc.save('catalogo-reebok.pdf')
    } catch { toast('Error al exportar', 'error') }
    setExporting('')
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="grid grid-cols-2 gap-3">
        <button onClick={exportExcel} disabled={!!exporting} className="bg-green-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
          {exporting === 'excel' ? 'Generando...' : 'Exportar Excel'}
        </button>
        <button onClick={exportPDF} disabled={!!exporting} className="bg-black text-white py-3 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
          {exporting === 'pdf' ? 'Generando...' : 'Exportar PDF'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">{products.filter(p => p.active).length} productos activos</p>
    </div>
  )
}
