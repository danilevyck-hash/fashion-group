'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Product, InventoryItem } from '@/components/reebok/supabase'
import AdminNav from '@/components/reebok/AdminNav'

export default function Exportar() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [filterGender, setFilterGender] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)
  const [exporting, setExporting] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('admin_auth') !== 'true') {
      router.push('/catalogo/reebok/admin')
      return
    }
    Promise.all([
      fetch('/api/catalogo/reebok/products').then(r => r.json()),
      fetch('/api/catalogo/reebok/inventory').then(r => r.json()),
    ]).then(([p, i]) => { setProducts(p); setInventory(i) })
  }, [router])

  const filtered = products.filter(p => {
    if (onlyActive && !p.active) return false
    if (filterGender && p.gender !== filterGender) return false
    if (filterCategory && p.category !== filterCategory) return false
    return true
  })

  const getSizes = (productId: string) =>
    inventory.filter(i => i.product_id === productId && i.quantity > 0).map(i => i.size).join(', ')

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

  const exportPDF = async () => {
    setExporting('pdf')
    try {
      const { jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF('landscape')
      doc.setFontSize(18)
      doc.text('Catalogo Reebok Panama', 14, 20)
      doc.setFontSize(10)
      doc.text(`Generado: ${new Date().toLocaleDateString('es-PA')}`, 14, 28)

      const rows: (string | null)[][] = []
      const images: { row: number; base64: string }[] = []

      for (let i = 0; i < Math.min(filtered.length, 100); i++) {
        const p = filtered[i]
        if (p.image_url) {
          const b64 = await loadImageAsBase64(p.image_url)
          if (b64) images.push({ row: i, base64: b64 })
        }
        rows.push([
          '', // placeholder for image
          p.sku || '-',
          p.name,
          p.color || '-',
          p.price ? `$${p.price}` : '-',
          p.category,
          getSizes(p.id) || '-',
        ])
      }

      autoTable(doc, {
        startY: 35,
        head: [['Foto', 'SKU', 'Nombre', 'Color', 'Precio', 'Categoria', 'Tallas']],
        body: rows,
        columnStyles: { 0: { cellWidth: 25 } },
        styles: { cellPadding: 3, fontSize: 8, minCellHeight: 20 },
        didDrawCell: (data) => {
          if (data.column.index === 0 && data.section === 'body') {
            const img = images.find(im => im.row === data.row.index)
            if (img) {
              doc.addImage(img.base64, 'JPEG', data.cell.x + 2, data.cell.y + 2, 20, 16)
            }
          }
        },
      })

      doc.save('catalogo-reebok.pdf')
    } catch (err) {
      console.error('PDF export error:', err)
      alert('Error al exportar PDF')
    }
    setExporting('')
  }

  const exportExcel = async () => {
    setExporting('excel')
    try {
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Catalogo')

      ws.columns = [
        { header: 'Foto', key: 'image', width: 15 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Nombre', key: 'name', width: 30 },
        { header: 'Color', key: 'color', width: 20 },
        { header: 'Precio', key: 'price', width: 12 },
        { header: 'Categoria', key: 'category', width: 15 },
        { header: 'Genero', key: 'gender', width: 12 },
        { header: 'Tallas', key: 'sizes', width: 30 },
      ]

      // Style header
      ws.getRow(1).font = { bold: true }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } }
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }

      for (let i = 0; i < Math.min(filtered.length, 100); i++) {
        const p = filtered[i]
        const row = ws.addRow({
          image: '',
          sku: p.sku || '-',
          name: p.name,
          color: p.color || '-',
          price: p.price ? `$${p.price}` : '-',
          category: p.category,
          gender: p.gender || '-',
          sizes: getSizes(p.id) || '-',
        })
        row.height = 60

        if (p.image_url) {
          try {
            const res = await fetch(p.image_url)
            const blob = await res.blob()
            const buffer = await blob.arrayBuffer()
            const ext = p.image_url.toLowerCase().includes('.png') ? 'png' : 'jpeg'
            const imageId = wb.addImage({ buffer, extension: ext })
            ws.addImage(imageId, {
              tl: { col: 0, row: i + 1 },
              ext: { width: 80, height: 55 },
            })
          } catch { /* skip image */ }
        }
      }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'catalogo-reebok.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Excel export error:', err)
      alert('Error al exportar Excel')
    }
    setExporting('')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Exportar Catalogo</h1>
      <AdminNav />

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="font-medium mb-4">Filtros</h2>
        <div className="flex flex-wrap gap-4 mb-4">
          <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className="border rounded px-3 py-2 text-sm">
            <option value="">Todos los generos</option>
            <option value="male">Hombre</option>
            <option value="female">Mujer</option>
            <option value="kids">Ninos</option>
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border rounded px-3 py-2 text-sm">
            <option value="">Todas las categorias</option>
            <option value="footwear">Calzado</option>
            <option value="apparel">Ropa</option>
            <option value="accessories">Accesorios</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} />
            Solo productos activos
          </label>
        </div>
        <p className="text-sm text-gray-500">{filtered.length} productos para exportar (max 100)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={exportPDF}
          disabled={!!exporting || filtered.length === 0}
          className="bg-reebok-red text-white py-4 rounded-lg font-bold text-sm uppercase tracking-wider hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {exporting === 'pdf' ? 'Generando PDF...' : 'Exportar PDF'}
        </button>
        <button
          onClick={exportExcel}
          disabled={!!exporting || filtered.length === 0}
          className="bg-green-600 text-white py-4 rounded-lg font-bold text-sm uppercase tracking-wider hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {exporting === 'excel' ? 'Generando Excel...' : 'Exportar Excel'}
        </button>
      </div>
    </div>
  )
}
