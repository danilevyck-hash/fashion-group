'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminNav from '@/components/reebok/AdminNav'

type UploadResult = {
  filename: string
  sku: string
  status: 'success' | 'no_match' | 'error'
  message: string
}

export default function BulkUpload() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('cxc_role') !== 'admin') {
      router.push('/catalogo/reebok/admin')
    }
  }, [router])

  const processFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setProcessing(true)
    setProgress({ current: 0, total: imageFiles.length })
    setResults([])

    // Fetch all products to match SKUs
    const productsRes = await fetch('/api/catalogo/reebok/products')
    const products = await productsRes.json()

    const newResults: UploadResult[] = []

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      const sku = file.name.replace(/\.[^.]+$/, '') // Remove extension
      setProgress({ current: i + 1, total: imageFiles.length })

      // Find matching product by SKU
      const match = products.find((p: { sku: string | null }) =>
        p.sku && (p.sku === sku || p.sku.toLowerCase() === sku.toLowerCase())
      )

      if (!match) {
        newResults.push({ filename: file.name, sku, status: 'no_match', message: 'No se encontro producto con este SKU' })
        continue
      }

      try {
        // Upload image
        const fd = new FormData()
        fd.append('file', file)
        const uploadRes = await fetch('/api/catalogo/reebok/upload', { method: 'POST', body: fd })
        const uploadData = await uploadRes.json()

        if (!uploadData.url) throw new Error(uploadData.error || 'Upload failed')

        // Update product with image URL
        await fetch('/api/catalogo/reebok/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: match.id, image_url: uploadData.url }),
        })

        newResults.push({ filename: file.name, sku, status: 'success', message: `Asignada a: ${match.name}` })
      } catch (err) {
        newResults.push({ filename: file.name, sku, status: 'error', message: String(err) })
      }
    }

    setResults(newResults)
    setProcessing(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Upload Masivo de Fotos</h1>
      <AdminNav />

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <p className="text-sm text-gray-600 mb-4">
          Sube multiples fotos. El nombre del archivo debe ser el SKU del producto (ej: <code className="bg-gray-100 px-1 rounded">100000100.jpg</code>).
          La foto se asignara automaticamente al producto que tenga ese SKU.
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
            dragging ? 'border-reebok-red bg-red-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="font-medium">Arrastra fotos aqui o haz click para seleccionar</p>
          <p className="text-sm text-gray-500 mt-1">JPG, PNG, WEBP</p>
        </div>
        <input ref={fileRef} type="file" multiple accept="image/*" onChange={e => e.target.files && processFiles(e.target.files)} className="hidden" />
      </div>

      {processing && (
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span>Procesando...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-reebok-red h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">Archivo</th>
                <th className="text-left py-2 px-2">SKU</th>
                <th className="text-left py-2 px-2">Estado</th>
                <th className="text-left py-2 px-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 px-2 font-mono text-xs">{r.filename}</td>
                  <td className="py-2 px-2">{r.sku}</td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      r.status === 'success' ? 'bg-green-100 text-green-700' :
                      r.status === 'no_match' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {r.status === 'success' ? 'OK' : r.status === 'no_match' ? 'Sin match' : 'Error'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-gray-600">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
