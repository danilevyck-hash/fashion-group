'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Product } from '@/components/reebok/supabase'
import ProductCard from '@/components/reebok/ProductCard'

export default function HomePage() {
  return <Suspense><Home /></Suspense>
}

function Home() {
  const searchParams = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [gender, setGender] = useState(searchParams.get('gender') || '')
  const [category, setCategory] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [temporada, setTemporada] = useState('')
  const [priceSort, setPriceSort] = useState('')
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({})
  const [exporting, setExporting] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Listen for toast events from ProductCard
  useEffect(() => {
    function handler(e: Event) {
      const msg = (e as CustomEvent).detail;
      setToast(msg);
      setTimeout(() => setToast(null), 2000);
    }
    window.addEventListener('reebok-toast', handler);
    return () => window.removeEventListener('reebok-toast', handler);
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/catalogo/reebok/products?active=true').then(r => r.json()),
      fetch('/api/catalogo/reebok/inventory').then(r => r.json()),
    ]).then(([prods, inv]) => {
      setProducts(Array.isArray(prods) ? prods : [])
      // Build map: productId -> total quantity
      const map: Record<string, number> = {}
      if (Array.isArray(inv)) {
        inv.forEach((i: { product_id: string; quantity: number }) => {
          map[i.product_id] = (map[i.product_id] || 0) + i.quantity
        })
      }
      setInventoryMap(map)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const loadImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  const exportPDF = async (items: Product[]) => {
    setExporting('pdf')
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF('landscape')
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 12
      const cols = 4
      const gap = 8
      const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols
      const imgH = cardW * 0.85
      const textH = 22

      // Load all images first
      const imageMap: Record<number, string> = {}
      for (let i = 0; i < Math.min(items.length, 100); i++) {
        if (items[i].image_url) {
          const b64 = await loadImageAsBase64(items[i].image_url!)
          if (b64) imageMap[i] = b64
        }
      }

      // Header on first page
      doc.setFillColor(26, 26, 26)
      doc.rect(0, 0, pageW, 14, 'F')
      doc.setFontSize(12)
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.text('REEBOK', margin, 9)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text('Pedido', pageW - margin, 9, { align: 'right' })

      let y = 20
      for (let i = 0; i < Math.min(items.length, 100); i++) {
        const p = items[i]
        const col = i % cols

        if (col === 0 && i > 0) {
          y += imgH + textH + gap
        }

        if (y + imgH + textH > pageH - 8) {
          doc.addPage()
          // Header on each page
          doc.setFillColor(26, 26, 26)
          doc.rect(0, 0, pageW, 14, 'F')
          doc.setFontSize(12)
          doc.setTextColor(255, 255, 255)
          doc.setFont('helvetica', 'bold')
          doc.text('REEBOK', margin, 9)
          doc.setFont('helvetica', 'normal')
          y = 20
        }

        const x = margin + col * (cardW + gap)

        // Grey card background like website
        doc.setFillColor(245, 240, 235)
        doc.roundedRect(x, y, cardW, imgH, 1.5, 1.5, 'F')

        // Image with small padding to keep it inside card
        if (imageMap[i]) {
          const pad = 2
          doc.addImage(imageMap[i], 'JPEG', x + pad, y + pad, cardW - pad * 2, imgH - pad * 2)
        }

        // SKU
        doc.setFontSize(6)
        doc.setTextColor(150, 150, 150)
        doc.setFont('helvetica', 'normal')
        doc.text(p.sku || '-', x, y + imgH + 4)

        // Name
        doc.setFontSize(8)
        doc.setTextColor(26, 26, 26)
        doc.setFont('helvetica', 'bold')
        doc.text(p.name, x, y + imgH + 9, { maxWidth: cardW })
        doc.setFont('helvetica', 'normal')

        // Gender
        const genderLabel = p.gender === 'male' ? 'Hombre' : p.gender === 'female' ? 'Mujer' : p.gender === 'kids' ? 'Ninos' : 'Unisex'
        doc.setFontSize(6)
        doc.setTextColor(120, 120, 120)
        doc.text(genderLabel, x, y + imgH + 13)

        // Price in red
        if (p.price) {
          doc.setFontSize(8)
          doc.setTextColor(204, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.text(`$${p.price.toFixed(2)}`, x, y + imgH + 18)
          doc.setFont('helvetica', 'normal')
        }
      }

      doc.save('catalogo-reebok.pdf')
    } catch (err) { console.error(err); alert('Error al generar PDF') }
    setExporting('')
  }

  const exportExcel = async (items: Product[]) => {
    setExporting('excel')
    try {
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Catalogo')
      ws.columns = [
        { header: 'Foto', key: 'image', width: 30 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Nombre', key: 'name', width: 30 },
        { header: 'Genero', key: 'gender', width: 12 },
        { header: 'Precio', key: 'price', width: 12 },
      ]
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } }

      for (let i = 0; i < Math.min(items.length, 100); i++) {
        const p = items[i]
        const genderLabel = p.gender === 'male' ? 'Hombre' : p.gender === 'female' ? 'Mujer' : p.gender === 'kids' ? 'Ninos' : p.gender === 'unisex' ? 'Unisex' : '-'
        const row = ws.addRow({ image: '', sku: p.sku || '-', name: p.name, gender: genderLabel, price: p.price ? `$${p.price}` : '-' })
        row.height = 160
        if (p.image_url) {
          try {
            const res = await fetch(p.image_url)
            const blob = await res.blob()
            const buffer = await blob.arrayBuffer()
            const ext = p.image_url.toLowerCase().includes('.png') ? 'png' : 'jpeg'
            const imageId = wb.addImage({ buffer, extension: ext })
            ws.addImage(imageId, { tl: { col: 0, row: i + 1 }, ext: { width: 200, height: 155 } })
          } catch { /* skip */ }
        }
      }
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'catalogo-reebok.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error(err); alert('Error al generar Excel') }
    setExporting('')
  }

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.color?.toLowerCase().includes(search.toLowerCase()) && !p.sku?.toLowerCase().includes(search.toLowerCase())) return false
    if (gender && p.gender !== gender) return false
    if (category && p.category !== category) return false
    if (subCategory && p.sub_category !== subCategory) return false
    if (temporada === 'oferta' && !p.on_sale) return false
    if (temporada === 'temporada' && p.on_sale) return false
    if (priceSort && p.price !== parseFloat(priceSort)) return false
    return true
  }).sort((a, b) => {
    // Calzado siempre primero
    const catOrder = (c: string) => c === 'footwear' ? 0 : c === 'apparel' ? 1 : 2
    return catOrder(a.category) - catOrder(b.category)
  })

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-reebok-dark to-reebok-red text-white py-10 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-12 mx-auto brightness-0 invert" />
          <p className="text-sm opacity-80 mt-2">Catalogo de productos — Panama</p>
        </div>
      </section>

      {/* Catalogo */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Nombre o SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-reebok-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Genero</label>
            <select value={gender} onChange={e => setGender(e.target.value)} className="border border-gray-300 rounded px-4 py-2">
              <option value="">Todos</option>
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
              <option value="kids">Ninos</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Categoria</label>
            <select value={category} onChange={e => { setCategory(e.target.value); setSubCategory('') }} className="border border-gray-300 rounded px-4 py-2">
              <option value="">Todas</option>
              {[...new Set(products.filter(p => p.active).map(p => p.category))].sort().map(cat => (
                <option key={cat} value={cat}>{cat === 'footwear' ? 'Calzado' : cat === 'apparel' ? 'Ropa' : 'Accesorios'}</option>
              ))}
            </select>
          </div>
          {category && (() => {
            const subs = [...new Set(products.filter(p => p.category === category && p.sub_category).map(p => p.sub_category!))]
            const labels: Record<string, string> = { medias: 'Medias', gorras: 'Gorras', mochilas: 'Mochilas', camisetas: 'Camisetas', hoodies: 'Hoodies', shorts: 'Shorts', classics: 'Classics', court: 'Court', running: 'Running', training: 'Training', otros: 'Otros' }
            return subs.length > 0 ? (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo</label>
                <select value={subCategory} onChange={e => setSubCategory(e.target.value)} className="border border-gray-300 rounded px-4 py-2">
                  <option value="">Todos</option>
                  {subs.sort().map(s => <option key={s} value={s}>{labels[s] || s}</option>)}
                </select>
              </div>
            ) : null
          })()}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Coleccion</label>
            <select value={temporada} onChange={e => { setTemporada(e.target.value); if (e.target.value !== 'oferta') setPriceSort('') }} className="border border-gray-300 rounded px-4 py-2">
              <option value="">Todo</option>
              <option value="oferta">Oferta</option>
              <option value="temporada">Temporada</option>
            </select>
          </div>
          {temporada === 'oferta' && (
            <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Precio</label>
            <select value={priceSort} onChange={e => setPriceSort(e.target.value)} className="border border-gray-300 rounded px-4 py-2">
              <option value="">Todos</option>
              <option value="25">$25</option>
              <option value="30">$30</option>
              <option value="35">$35</option>
            </select>
            </div>
          )}
          <div className="relative self-end">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!!exporting}
              className="border border-gray-400 text-gray-600 rounded px-4 py-2 text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
            >
              {exporting ? 'Generando...' : 'Exportar'}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                <button onClick={() => { exportPDF(filtered); setShowExportMenu(false) }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 whitespace-nowrap">PDF</button>
                <button onClick={() => { exportExcel(filtered); setShowExportMenu(false) }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 whitespace-nowrap">Excel</button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-500">Cargando productos...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">No se encontraron productos</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(p => <ProductCard key={p.id} product={p} stock={inventoryMap[p.id] || 0} />)}
          </div>
        )}
      </div>

      {/* Footer con link admin */}
      <footer className="border-t border-gray-200 py-6 px-4 mt-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-xs text-gray-400">
          <p>Reebok Panama</p>
          <Link href="catalogo/reebok/admin" className="hover:text-gray-600 transition-colors">Admin</Link>
        </div>
      </footer>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-full text-sm z-50 shadow-lg">{toast}</div>}
    </div>
  )
}
