'use client'

import Link from 'next/link'
import { useCart } from '@/components/reebok/CartProvider'
import { useState } from 'react'

export default function Pedido() {
  const { items, removeFromCart, updateQuantity, clearCart } = useCart()
  const [exporting, setExporting] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '50760000000'

  const PIEZAS_POR_BULTO = 12
  const total = items.reduce((sum, item) => sum + (item.price || 0) * item.quantity * PIEZAS_POR_BULTO, 0)
  const totalBultos = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPiezas = totalBultos * PIEZAS_POR_BULTO

  const generatePDF = async () => {
    const { jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF('portrait')

    // Header
    doc.setFillColor(26, 26, 26)
    doc.rect(0, 0, 210, 20, 'F')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text('REEBOK PANAMA — Pedido', 14, 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(new Date().toLocaleDateString('es-PA'), 196, 13, { align: 'right' })

    // Load images
    const imageMap: Record<number, string> = {}
    for (let i = 0; i < items.length; i++) {
      if (items[i].imageUrl) {
        try {
          const res = await fetch(items[i].imageUrl)
          const blob = await res.blob()
          const b64: string = await new Promise(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
          imageMap[i] = b64
        } catch { /* skip */ }
      }
    }

    const rows = items.map(item => [
      '', // photo placeholder
      item.productId.substring(0, 12),
      item.productName,
      item.quantity.toString(),
      `${item.quantity * PIEZAS_POR_BULTO}`,
      item.price ? `$${item.price.toFixed(2)}` : '-',
      item.price ? `$${(item.price * item.quantity * PIEZAS_POR_BULTO).toFixed(2)}` : '-',
    ])

    autoTable(doc, {
      startY: 28,
      head: [['Foto', 'SKU', 'Producto', 'Bultos', 'Piezas', 'Precio/u', 'Subtotal']],
      body: rows,
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 22 }, 2: { cellWidth: 50 }, 3: { cellWidth: 16, halign: 'center' }, 4: { cellWidth: 16, halign: 'center' }, 5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 25, halign: 'right' } },
      styles: { cellPadding: 3, fontSize: 8, minCellHeight: 22 },
      headStyles: { fillColor: [204, 0, 0] },
      didDrawCell: (data) => {
        if (data.column.index === 0 && data.section === 'body') {
          const img = imageMap[data.row.index]
          if (img) doc.addImage(img, 'JPEG', data.cell.x + 2, data.cell.y + 2, 25, 20)
        }
      },
    })

    // Totals
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setTextColor(26, 26, 26)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total: ${totalBultos} bultos (${totalPiezas} piezas)`, 14, finalY)
    doc.setTextColor(204, 0, 0)
    doc.text(`$${total.toFixed(2)}`, 196, finalY, { align: 'right' })

    return doc
  }

  const handleDownloadPDF = async () => {
    setExporting('pdf')
    try {
      const doc = await generatePDF()
      doc.save('pedido-reebok.pdf')
    } catch (err) { console.error(err); alert('Error al generar PDF') }
    setExporting('')
  }

  const handleDownloadExcel = async () => {
    setExporting('excel')
    try {
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Pedido')
      ws.columns = [
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Producto', key: 'name', width: 30 },
        { header: 'Bultos', key: 'bultos', width: 10 },
        { header: 'Piezas', key: 'piezas', width: 10 },
        { header: 'Precio/u', key: 'price', width: 12 },
        { header: 'Subtotal', key: 'subtotal', width: 15 },
      ]
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } }

      items.forEach(item => {
        ws.addRow({
          sku: item.productId.substring(0, 12),
          name: item.productName,
          bultos: item.quantity,
          piezas: item.quantity * PIEZAS_POR_BULTO,
          price: item.price ? `$${item.price.toFixed(2)}` : '-',
          subtotal: item.price ? `$${(item.price * item.quantity * PIEZAS_POR_BULTO).toFixed(2)}` : '-',
        })
      })

      const totalRow = ws.addRow({ sku: '', name: 'TOTAL', bultos: totalBultos, piezas: totalPiezas, price: '', subtotal: `$${total.toFixed(2)}` })
      totalRow.font = { bold: true }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'pedido-reebok.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error(err); alert('Error al generar Excel') }
    setExporting('')
  }

  const sendOrderEmail = async () => {
    try {
      await fetch('/api/catalogo/reebok/send-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName || 'Sin nombre',
          clientEmail: clientEmail || undefined,
          items: items.map(item => ({
            productName: item.productName,
            productId: item.productId,
            quantity: item.quantity,
            piezas: item.quantity * PIEZAS_POR_BULTO,
            price: item.price,
            subtotal: item.price ? item.price * item.quantity * PIEZAS_POR_BULTO : 0,
          })),
          totalBultos, totalPiezas, total,
        }),
      })
    } catch { /* email send is best-effort */ }
  }

  const handleWhatsApp = async () => {
    setExporting('whatsapp')
    try {
      // Send email simultaneously
      sendOrderEmail()

      const doc = await generatePDF()
      const pdfBlob = doc.output('blob')
      const pdfFile = new File([pdfBlob], 'pedido-reebok.pdf', { type: 'application/pdf' })

      if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
        await navigator.share({
          title: 'Pedido Reebok',
          text: `Pedido de ${clientName || 'cliente'}: ${totalBultos} bultos — $${total.toFixed(2)}`,
          files: [pdfFile],
        })
      } else {
        let msg = `Hola! Soy ${clientName || 'cliente'}. Quiero hacer un pedido:\n\n`
        items.forEach((item, i) => {
          msg += `${i + 1}. ${item.productName} — ${item.quantity} bultos (${item.quantity * PIEZAS_POR_BULTO} pzs)`
          if (item.price) msg += ` — $${(item.price * item.quantity * PIEZAS_POR_BULTO).toFixed(2)}`
          msg += '\n'
        })
        msg += `\nTotal: ${totalBultos} bultos (${totalPiezas} piezas) — $${total.toFixed(2)}`

        window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank')
      }
    } catch (err) { console.error(err); alert('Error') }
    setExporting('')
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">Tu pedido</h1>
        <p className="text-gray-500 mb-6">No tienes productos en tu pedido</p>
        <Link href="/" className="inline-block bg-reebok-red text-white px-6 py-3 rounded font-bold text-sm uppercase hover:bg-red-700 transition-colors">
          Ver catalogo
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Tu pedido</h1>
      <p className="text-gray-500 mb-6">{totalBultos} bultos ({totalPiezas} piezas) — <span className="text-reebok-red font-bold">${total.toFixed(2)}</span></p>

      {/* Client info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div>
          <label className="text-[11px] text-gray-400 uppercase tracking-wider block mb-1">Nombre del cliente *</label>
          <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nombre completo"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase tracking-wider block mb-1">Email <span className="normal-case text-gray-300">(opcional)</span></label>
          <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="email@ejemplo.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
      </div>

      <div className="space-y-3 mb-8">
        {items.map(item => (
          <div key={`${item.productId}-${item.size}`} className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-4">
            <div className="w-16 h-16 bg-reebok-grey rounded overflow-hidden flex-shrink-0">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Sin foto</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm truncate">{item.productName}</h3>
              <p className="text-xs text-gray-500">{item.quantity} bultos ({item.quantity * PIEZAS_POR_BULTO} pzs)</p>
              {item.price && <p className="text-xs text-reebok-red font-bold">${(item.price * item.quantity * PIEZAS_POR_BULTO).toFixed(2)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)} className="w-8 h-8 border rounded text-sm flex items-center justify-center">-</button>
              <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
              <button onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)} className="w-8 h-8 border rounded text-sm flex items-center justify-center">+</button>
            </div>
            <button onClick={() => removeFromCart(item.productId, item.size)} className="text-gray-400 hover:text-red-500 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {/* WhatsApp - main CTA */}
        <button
          onClick={handleWhatsApp}
          disabled={!!exporting}
          className="w-full bg-green-500 text-white py-4 rounded-lg font-bold text-center text-sm uppercase tracking-wider hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          {exporting === 'whatsapp' ? 'Generando...' : 'Enviar pedido por WhatsApp + PDF'}
        </button>

        {/* Download buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDownloadPDF}
            disabled={!!exporting}
            className="border border-reebok-red text-reebok-red py-3 rounded-lg text-sm font-medium hover:bg-reebok-red hover:text-white transition-colors disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={handleDownloadExcel}
            disabled={!!exporting}
            className="border border-green-600 text-green-600 py-3 rounded-lg text-sm font-medium hover:bg-green-600 hover:text-white transition-colors disabled:opacity-50"
          >
            {exporting === 'excel' ? 'Generando...' : 'Descargar Excel'}
          </button>
        </div>

        <button onClick={clearCart} className="w-full border border-gray-300 text-gray-600 py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Vaciar pedido
        </button>
      </div>
    </div>
  )
}
