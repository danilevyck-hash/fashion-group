'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminNav from '@/components/reebok/AdminNav'

type ImportResult = {
  row: number
  name: string
  status: 'success' | 'error' | 'skipped'
  message: string
}

export default function ImportarCSV() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [results, setResults] = useState<ImportResult[]>([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const productFields = [
    { key: '', label: '-- Ignorar --' },
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Nombre' },
    { key: 'description', label: 'Descripcion' },
    { key: 'price', label: 'Precio' },
    { key: 'category', label: 'Categoria' },
    { key: 'gender', label: 'Genero' },
    { key: 'sub_category', label: 'Sub-categoria' },
    { key: 'color', label: 'Color' },
  ]

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('admin_auth') !== 'true') {
      router.push('/catalogo/reebok/admin')
    }
  }, [router])

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return

    // Detect delimiter
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

    const hdrs = parseLine(lines[0])
    setHeaders(hdrs)

    // Auto-map headers
    const autoMap: Record<string, string> = {}
    hdrs.forEach(h => {
      const lower = h.toLowerCase().replace(/[^a-z]/g, '')
      if (lower.includes('sku') || lower.includes('codigo') || lower.includes('item') || lower.includes('style')) autoMap[h] = 'sku'
      else if (lower.includes('nombre') || lower === 'name' || lower.includes('description') || lower.includes('modelo')) autoMap[h] = 'name'
      else if (lower.includes('precio') || lower === 'price' || lower.includes('rrp') || lower.includes('retail') || lower.includes('wsp')) autoMap[h] = 'price'
      else if (lower.includes('color') || lower.includes('colour')) autoMap[h] = 'color'
      else if (lower.includes('categ') || lower.includes('depart')) autoMap[h] = 'category'
      else if (lower.includes('gender') || lower.includes('genero') || lower.includes('sexo')) autoMap[h] = 'gender'
      else if (lower.includes('sub') || lower.includes('segment') || lower.includes('tipo')) autoMap[h] = 'sub_category'
      else if (lower.includes('desc')) autoMap[h] = 'description'
    })
    setMapping(autoMap)

    // Parse rows
    const rows = lines.slice(1).map(line => {
      const values = parseLine(line)
      const row: Record<string, string> = {}
      hdrs.forEach((h, i) => { row[h] = values[i] || '' })
      return row
    }).filter(row => Object.values(row).some(v => v))

    setPreview(rows)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => parseCSV(ev.target?.result as string)
    reader.readAsText(file)
  }

  const handleImport = async () => {
    setImporting(true)
    setResults([])
    setProgress({ current: 0, total: preview.length })

    const newResults: ImportResult[] = []

    for (let i = 0; i < preview.length; i++) {
      const row = preview[i]
      setProgress({ current: i + 1, total: preview.length })

      // Build product from mapping
      const product: Record<string, string | number | boolean | null> = { active: true }
      let hasName = false

      Object.entries(mapping).forEach(([csvHeader, field]) => {
        if (!field) return
        let value = row[csvHeader] || ''
        if (field === 'name' && value) hasName = true
        if (field === 'price') {
          const num = parseFloat(value.replace(/[^0-9.,]/g, '').replace(',', '.'))
          product[field] = isNaN(num) ? null : num
        } else if (field === 'gender') {
          const lower = value.toLowerCase()
          if (lower.includes('male') || lower.includes('hombre') || lower.includes('men') || lower === 'm') product[field] = 'male'
          else if (lower.includes('female') || lower.includes('mujer') || lower.includes('women') || lower === 'f') product[field] = 'female'
          else if (lower.includes('kid') || lower.includes('nino') || lower.includes('junior') || lower.includes('child')) product[field] = 'kids'
          else if (lower.includes('unisex')) product[field] = 'unisex'
          else product[field] = value
        } else if (field === 'category') {
          const lower = value.toLowerCase()
          if (lower.includes('foot') || lower.includes('shoe') || lower.includes('calzado') || lower.includes('zapato')) product[field] = 'footwear'
          else if (lower.includes('apparel') || lower.includes('ropa') || lower.includes('cloth')) product[field] = 'apparel'
          else if (lower.includes('acces')) product[field] = 'accessories'
          else product[field] = value || 'footwear'
        } else {
          product[field] = value
        }
      })

      if (!product.category) product.category = 'footwear'

      if (!hasName) {
        newResults.push({ row: i + 2, name: '-', status: 'skipped', message: 'Sin nombre' })
        continue
      }

      try {
        const res = await fetch('/api/catalogo/reebok/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(product),
        })
        const data = await res.json()
        if (data.error) {
          newResults.push({ row: i + 2, name: product.name as string, status: 'error', message: data.error })
        } else {
          newResults.push({ row: i + 2, name: product.name as string, status: 'success', message: `SKU: ${product.sku || '-'}` })
        }
      } catch (err) {
        newResults.push({ row: i + 2, name: product.name as string, status: 'error', message: String(err) })
      }
    }

    setResults(newResults)
    setImporting(false)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Importar Productos (CSV)</h1>
      <AdminNav />

      {/* Step 1: Upload */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="font-medium mb-2">1. Sube tu archivo CSV</h2>
        <p className="text-sm text-gray-500 mb-4">Acepta CSV, TSV o archivos separados por punto y coma. La primera fila debe ser los encabezados.</p>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} className="text-sm" />
      </div>

      {/* Step 2: Map columns */}
      {headers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="font-medium mb-4">2. Mapea las columnas</h2>
          <p className="text-sm text-gray-500 mb-4">Asigna cada columna de tu CSV a un campo del producto. Se auto-detectaron algunos.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {headers.map(h => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded min-w-[120px] truncate" title={h}>{h}</span>
                <span className="text-gray-400">→</span>
                <select
                  value={mapping[h] || ''}
                  onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                  className="border rounded px-2 py-1 text-sm flex-1"
                >
                  {productFields.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {preview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="font-medium mb-2">3. Vista previa ({preview.length} filas)</h2>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="text-left py-1 px-2 border-b">#</th>
                  {headers.filter(h => mapping[h]).map(h => (
                    <th key={h} className="text-left py-1 px-2 border-b">{mapping[h]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2 text-gray-500">{i + 2}</td>
                    {headers.filter(h => mapping[h]).map(h => (
                      <td key={h} className="py-1 px-2 truncate max-w-[150px]">{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 10 && <p className="text-xs text-gray-500 mt-2 px-2">...y {preview.length - 10} filas mas</p>}
          </div>

          <button
            onClick={handleImport}
            disabled={importing || !Object.values(mapping).includes('name')}
            className="mt-4 w-full bg-reebok-red text-white py-3 rounded font-bold text-sm uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {importing ? `Importando ${progress.current}/${progress.total}...` : `Importar ${preview.length} productos`}
          </button>
          {!Object.values(mapping).includes('name') && (
            <p className="text-xs text-red-500 mt-2">Debes mapear al menos la columna "Nombre"</p>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="font-medium mb-3">Resultados</h2>
          <div className="flex gap-4 mb-4 text-sm">
            <span className="text-green-600">{results.filter(r => r.status === 'success').length} importados</span>
            <span className="text-yellow-600">{results.filter(r => r.status === 'skipped').length} saltados</span>
            <span className="text-red-600">{results.filter(r => r.status === 'error').length} errores</span>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b">
                  <th className="text-left py-1 px-2">Fila</th>
                  <th className="text-left py-1 px-2">Nombre</th>
                  <th className="text-left py-1 px-2">Estado</th>
                  <th className="text-left py-1 px-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 px-2">{r.row}</td>
                    <td className="py-1 px-2">{r.name}</td>
                    <td className="py-1 px-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.status === 'success' ? 'bg-green-100 text-green-700' :
                        r.status === 'skipped' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {r.status === 'success' ? 'OK' : r.status === 'skipped' ? 'Saltado' : 'Error'}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-gray-600 text-xs">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
