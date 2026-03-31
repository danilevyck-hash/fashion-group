'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────────

type InventoryResult = {
  updated: { sku: string; name: string; anterior: number; nueva: number }[]
  wentToZero: { sku: string; name: string }[]
  notFound: { codigo: string; descripcion: string }[]
  notInCSV: { sku: string; name: string }[]
}

type ImportResult = {
  created: number
  updated: number
  errors: number
} | null

type PhotoResult = {
  filename: string
  sku: string
  status: 'success' | 'no_match' | 'error'
  message: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-reebok-red ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ReebokAdmin() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const role = sessionStorage.getItem('cxc_role')
    if (!role || !['admin', 'secretaria'].includes(role)) {
      router.replace('/')
      return
    }
    setAuthorized(true)
  }, [router])

  if (!authorized) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Admin Reebok</h1>
      <InventorySection />
      <div className="my-10 border-t border-gray-200" />
      <ProductsSection />
      <div className="mt-8 text-center">
        <Link href="/catalogo/reebok/admin/productos" className="text-xs text-gray-400 hover:text-gray-600 underline">
          Ver lista completa de productos &rarr;
        </Link>
      </div>
    </div>
  )
}

// ── Section 1: Actualizar Inventario ───────────────────────────────────────────

function InventorySection() {
  const [shoesResult, setShoesResult] = useState<InventoryResult | null>(null)
  const [wearResult, setWearResult] = useState<InventoryResult | null>(null)

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Actualizar Inventario</h2>

      <div className="text-xs text-gray-500 space-y-1 mb-5">
        <p>Descarga el listado de articulos desde Switch Soft &rarr; Stock Articulos &rarr; Listado de Articulos &rarr; Descargar (primera opcion)</p>
        <p>Descarga cada empresa por separado desde Switch Soft y sube cada archivo en su seccion correspondiente</p>
        <p>El sistema actualiza solo los productos que encuentre por codigo</p>
      </div>

      <div className="space-y-6">
        <InventoryZone label="Active Shoes" empresa="shoes" notInCSVLabel="en footwear del website pero no en este CSV" result={shoesResult} onResult={setShoesResult} />
        <InventoryZone label="Active Wear" empresa="wear" notInCSVLabel="en apparel/accesorios del website pero no en este CSV" result={wearResult} onResult={setWearResult} />
      </div>
    </section>
  )
}

// ── Inventory Zone (reusable for Shoes / Wear) ────────────────────────────────

function InventoryZone({
  label,
  empresa,
  notInCSVLabel,
  result,
  onResult,
}: {
  label: string
  empresa: 'shoes' | 'wear'
  notInCSVLabel: string
  result: InventoryResult | null
  onResult: (r: InventoryResult | null) => void
}) {
  const [processing, setProcessing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const processCSV = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) return
    setProcessing(true)

    try {
      const buffer = await file.arrayBuffer()
      const text = new TextDecoder('latin1').decode(buffer)

      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) {
        setProcessing(false)
        return
      }

      const header = lines[0].split(';').map(h => h.trim().replace(/"/g, ''))
      const codigoIdx = header.findIndex(h => normalizeHeader(h) === 'CODIGO')
      const existenciaIdx = header.findIndex(h => normalizeHeader(h) === 'EXISTENCIA')
      const descripcionIdx = header.findIndex(h => normalizeHeader(h) === 'DESCRIPCION')

      if (codigoIdx === -1 || existenciaIdx === -1) {
        alert('CSV no tiene columnas CODIGO y/o EXISTENCIA')
        setProcessing(false)
        return
      }

      const map = new Map<string, { existencia: number; descripcion: string }>()
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''))
        const codigo = cols[codigoIdx]
        const existencia = parseInt(cols[existenciaIdx])
        const descripcion = descripcionIdx !== -1 ? cols[descripcionIdx] || '' : ''
        if (codigo && !isNaN(existencia)) {
          map.set(codigo, { existencia, descripcion })
        }
      }

      const items = Array.from(map.entries()).map(([codigo, data]) => ({
        codigo,
        existencia: data.existencia,
        descripcion: data.descripcion,
      }))

      const res = await fetch('/api/catalogo/reebok/inventory/switchsoft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, empresa }),
      })
      const data: InventoryResult = await res.json()
      onResult(data)
    } catch {
      alert('Error al procesar el archivo')
    }
    setProcessing(false)
  }, [onResult, empresa])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processCSV(file)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>

      {processing ? (
        <div className="flex items-center justify-center py-8 border border-gray-200 rounded-lg">
          <Spinner />
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragging ? 'border-reebok-red bg-red-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-medium">Subir CSV — {label}</p>
          <p className="text-xs text-gray-400 mt-0.5">.csv</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={e => { if (e.target.files?.[0]) processCSV(e.target.files[0]); e.target.value = '' }}
            className="hidden"
          />
        </div>
      )}

      {result && (
        <>
          <InventoryResultBlock result={result} notInCSVLabel={notInCSVLabel} />
          <button
            onClick={() => onResult(null)}
            className="text-xs text-gray-400 hover:text-gray-600 underline mt-2"
          >
            Limpiar resultados
          </button>
        </>
      )}
    </div>
  )
}

// ── Inventory Result Block ─────────────────────────────────────────────────────

function InventoryResultBlock({ result, notInCSVLabel }: { result: InventoryResult; notInCSVLabel: string }) {
  const [showUpdated, setShowUpdated] = useState(false)

  return (
    <div className="mt-3 space-y-2">
      {/* 1. Updated */}
      {result.updated.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <button
            onClick={() => setShowUpdated(v => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-medium text-green-800">
              {result.updated.length} productos actualizados
            </span>
            <svg className={`w-4 h-4 text-green-600 transition-transform ${showUpdated ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showUpdated && (
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-green-50">
                  <tr className="text-left text-green-700">
                    <th className="py-1 pr-2">SKU</th>
                    <th className="py-1 pr-2">Nombre</th>
                    <th className="py-1 text-right">Anterior</th>
                    <th className="py-1 text-right pl-2">Nueva</th>
                  </tr>
                </thead>
                <tbody>
                  {result.updated.map((item, i) => (
                    <tr key={i} className="border-t border-green-100">
                      <td className="py-1 pr-2 font-mono">{item.sku}</td>
                      <td className="py-1 pr-2 truncate max-w-[180px]">{item.name}</td>
                      <td className="py-1 text-right text-gray-500">{item.anterior}</td>
                      <td className="py-1 text-right pl-2 font-medium">{item.nueva}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. Went to zero */}
      {result.wentToZero.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-amber-800">
              {result.wentToZero.length} quedaron en 0
            </span>
            <button
              onClick={() => copyToClipboard(result.wentToZero.map(i => `${i.sku}\t${i.name}`).join('\n'))}
              className="text-xs text-amber-700 hover:text-amber-900 underline"
            >
              Copiar lista
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto text-xs text-amber-700 font-mono space-y-0.5">
            {result.wentToZero.map((item, i) => (
              <div key={i}>{item.sku} — {item.name}</div>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-2 italic">Revisar si se deben inactivar</p>
        </div>
      )}

      {/* 3. In CSV but not in website */}
      {result.notFound.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-blue-800">
              {result.notFound.length} en CSV pero no en website
            </span>
            <button
              onClick={() => copyToClipboard(result.notFound.map(i => `${i.codigo}\t${i.descripcion}`).join('\n'))}
              className="text-xs text-blue-700 hover:text-blue-900 underline"
            >
              Copiar lista
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto text-xs text-blue-700 font-mono space-y-0.5">
            {result.notFound.map((item, i) => (
              <div key={i}>{item.codigo} — {item.descripcion}</div>
            ))}
          </div>
        </div>
      )}

      {/* 4. In website but not in CSV (filtered by empresa) */}
      {result.notInCSV.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">
              {result.notInCSV.length} {notInCSVLabel}
            </span>
            <button
              onClick={() => copyToClipboard(result.notInCSV.map(i => `${i.sku}\t${i.name}`).join('\n'))}
              className="text-xs text-gray-600 hover:text-gray-800 underline"
            >
              Copiar lista
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto text-xs text-gray-600 font-mono space-y-0.5">
            {result.notInCSV.map((item, i) => (
              <div key={i}>{item.sku} — {item.name}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section 2: Agregar Productos ───────────────────────────────────────────────

function ProductsSection() {
  const [importProcessing, setImportProcessing] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  const [photoDragging, setPhotoDragging] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [photoProgress, setPhotoProgress] = useState({ current: 0, total: 0 })
  const [photoResults, setPhotoResults] = useState<PhotoResult[]>([])
  const photoRef = useRef<HTMLInputElement>(null)

  // ── CSV Import ──

  const handleCSVImport = async (file: File) => {
    setImportProcessing(true)
    setImportResult(null)

    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) {
        setImportProcessing(false)
        return
      }

      const firstLine = lines[0]
      const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','

      const parseLine = (line: string) => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
            else inQuotes = !inQuotes
          } else if (ch === delimiter && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += ch
          }
        }
        result.push(current.trim())
        return result
      }

      const headers = parseLine(lines[0])

      const fieldMap: Record<number, string> = {}
      headers.forEach((h, i) => {
        const lower = h.toLowerCase().replace(/[^a-z]/g, '')
        if (lower.includes('sku') || lower.includes('codigo') || lower.includes('item') || lower.includes('style')) fieldMap[i] = 'sku'
        else if (lower.includes('nombre') || lower === 'name' || lower.includes('modelo')) fieldMap[i] = 'name'
        else if (lower.includes('precio') || lower === 'price' || lower.includes('rrp') || lower.includes('retail') || lower.includes('wsp')) fieldMap[i] = 'price'
        else if (lower.includes('color') || lower.includes('colour')) fieldMap[i] = 'color'
        else if (lower.includes('categ') || lower.includes('depart')) fieldMap[i] = 'category'
        else if (lower.includes('gender') || lower.includes('genero') || lower.includes('sexo')) fieldMap[i] = 'gender'
        else if (lower.includes('sub') || lower.includes('segment') || lower.includes('tipo')) fieldMap[i] = 'sub_category'
        else if (lower.includes('desc')) fieldMap[i] = 'description'
        else if (lower.includes('existencia') || lower.includes('quantity') || lower.includes('cantidad') || lower.includes('qty')) fieldMap[i] = 'quantity'
        else if (lower.includes('oferta') || lower.includes('sale')) fieldMap[i] = 'on_sale'
        else if (lower.includes('activo') || lower.includes('active')) fieldMap[i] = 'active'
      })

      const products: Record<string, string | number | boolean | undefined>[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i])
        if (cols.every(c => !c)) continue

        const product: Record<string, string | number | boolean | undefined> = {}
        Object.entries(fieldMap).forEach(([idxStr, field]) => {
          const val = cols[parseInt(idxStr)] || ''
          if (!val) return

          if (field === 'price') {
            const num = parseFloat(val.replace(/[^0-9.,]/g, '').replace(',', '.'))
            product[field] = isNaN(num) ? undefined : num
          } else if (field === 'gender') {
            const l = val.toLowerCase()
            product[field] = l.includes('hombre') || l.includes('male') || l === 'm' ? 'male'
              : l.includes('mujer') || l.includes('female') || l === 'f' ? 'female'
              : l.includes('nino') || l.includes('kid') || l.includes('junior') ? 'kids'
              : l.includes('unisex') ? 'unisex' : val
          } else if (field === 'category') {
            const l = val.toLowerCase()
            product[field] = l.includes('foot') || l.includes('calzado') || l.includes('shoe') ? 'footwear'
              : l.includes('apparel') || l.includes('ropa') ? 'apparel'
              : l.includes('acces') ? 'accessories' : val || 'footwear'
          } else if (field === 'quantity') {
            product[field] = parseInt(val) || 0
          } else if (field === 'on_sale') {
            const l = val.toLowerCase()
            product[field] = l === 'si' || l === 'yes' || l === 'true'
          } else if (field === 'active') {
            const l = val.toLowerCase()
            product[field] = l !== 'no' && l !== 'false'
          } else {
            product[field] = val
          }
        })

        if (!product.sku) continue
        if (!product.category) product.category = 'footwear'
        if (!product.name) product.name = product.sku as string
        if (product.active === undefined) product.active = true

        products.push(product)
      }

      if (products.length === 0) {
        alert('No se encontraron productos validos en el CSV')
        setImportProcessing(false)
        return
      }

      const res = await fetch('/api/catalogo/reebok/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      })
      const data = await res.json()
      setImportResult(data)
    } catch {
      alert('Error al procesar el archivo')
    }
    setImportProcessing(false)
    if (csvRef.current) csvRef.current.value = ''
  }

  // ── Photo Upload ──

  const processPhotos = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setPhotoProcessing(true)
    setPhotoProgress({ current: 0, total: imageFiles.length })
    setPhotoResults([])

    const productsRes = await fetch('/api/catalogo/reebok/products')
    const products = await productsRes.json()

    const newResults: PhotoResult[] = []

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      const sku = file.name.replace(/\.[^.]+$/, '')
      setPhotoProgress({ current: i + 1, total: imageFiles.length })

      const match = products.find((p: { sku: string | null }) =>
        p.sku && (p.sku === sku || p.sku.toLowerCase() === sku.toLowerCase())
      )

      if (!match) {
        newResults.push({ filename: file.name, sku, status: 'no_match', message: 'SKU no encontrado' })
        continue
      }

      try {
        const fd = new FormData()
        fd.append('file', file)
        const uploadRes = await fetch('/api/catalogo/reebok/upload', { method: 'POST', body: fd })
        const uploadData = await uploadRes.json()
        if (!uploadData.url) throw new Error(uploadData.error || 'Upload failed')

        await fetch('/api/catalogo/reebok/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: match.id, image_url: uploadData.url }),
        })
        newResults.push({ filename: file.name, sku, status: 'success', message: match.name })
      } catch (err) {
        newResults.push({ filename: file.name, sku, status: 'error', message: String(err) })
      }
    }

    setPhotoResults(newResults)
    setPhotoProcessing(false)
  }

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setPhotoDragging(false)
    if (e.dataTransfer.files) processPhotos(e.dataTransfer.files)
  }

  const successPhotos = photoResults.filter(r => r.status === 'success').length
  const failPhotos = photoResults.filter(r => r.status !== 'success').length

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Agregar Productos</h2>

      {/* Step 1: CSV */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-600 mb-1">Paso 1 — Sube el CSV con los nuevos productos</h3>

        {importProcessing ? (
          <div className="flex items-center justify-center py-6 border border-gray-200 rounded-lg">
            <Spinner className="h-5 w-5" />
          </div>
        ) : importResult ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-1">
            {importResult.created > 0 && <p className="text-green-700">{importResult.created} productos nuevos creados</p>}
            {importResult.updated > 0 && <p className="text-blue-700">{importResult.updated} productos actualizados</p>}
            {importResult.errors > 0 && <p className="text-red-600">{importResult.errors} errores</p>}
            <button onClick={() => setImportResult(null)} className="text-xs text-gray-500 hover:text-gray-700 underline mt-2">
              Subir otro archivo
            </button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-2 bg-reebok-dark text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer">
            Seleccionar CSV
            <input
              ref={csvRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={e => { if (e.target.files?.[0]) handleCSVImport(e.target.files[0]) }}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* Step 2: Photos */}
      <div>
        <h3 className="text-sm font-medium text-gray-600 mb-1">Paso 2 — Sube las fotos (nombre del archivo = SKU, ej: 100202579.jpg)</h3>

        {photoProcessing ? (
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Procesando...</span>
              <span className="text-gray-600">{photoProgress.current} / {photoProgress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-reebok-red h-1.5 rounded-full transition-all" style={{ width: `${(photoProgress.current / photoProgress.total) * 100}%` }} />
            </div>
          </div>
        ) : photoResults.length > 0 ? (
          <div className="space-y-2">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
              {successPhotos > 0 && <p className="text-green-700">{successPhotos} fotos asignadas</p>}
              {failPhotos > 0 && <p className="text-amber-700">{failPhotos} sin match o con error</p>}
            </div>
            {failPhotos > 0 && (
              <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                {photoResults.filter(r => r.status !== 'success').map((r, i) => (
                  <div key={i} className="flex gap-2 text-amber-700">
                    <span className="font-mono">{r.filename}</span>
                    <span>— {r.message}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setPhotoResults([])} className="text-xs text-gray-500 hover:text-gray-700 underline">
              Subir mas fotos
            </button>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setPhotoDragging(true) }}
            onDragLeave={() => setPhotoDragging(false)}
            onDrop={handlePhotoDrop}
            onClick={() => photoRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              photoDragging ? 'border-reebok-red bg-red-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <p className="text-sm font-medium">Arrastra fotos o haz click</p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP</p>
            <input
              ref={photoRef}
              type="file"
              multiple
              accept="image/*"
              onChange={e => { if (e.target.files) processPhotos(e.target.files) }}
              className="hidden"
            />
          </div>
        )}
      </div>
    </section>
  )
}
