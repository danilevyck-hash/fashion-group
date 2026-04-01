"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { useToast } from "@/components/ToastSystem";

interface OrderItem { id?: string; product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; }
interface Order { id: string; order_number: string; client_name: string; comment: string; total: number; reebok_order_items: OrderItem[]; created_at: string; }
interface DirClient { nombre: string; empresa: string; }

const P = 12; // piezas por bulto

export default function OrderDetailPage() {
  const router = useRouter();
  const { confirm: confirmAction } = useToast();
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DirClient[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const nameRef = useRef<HTMLDivElement>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalogo/reebok/orders/${id}`);
      if (res.ok) {
        const d = await res.json();
        // Cliente can only view their own orders
        const role = sessionStorage.getItem("cxc_role") || "";
        if (role === "cliente") {
          const userName = sessionStorage.getItem("fg_user_name") || "";
          if (userName && d.client_name && d.client_name.toLowerCase() !== userName.toLowerCase()) {
            router.push("/catalogo/reebok/productos"); return;
          }
        }
        setOrder(d); setItems(d.reebok_order_items || []); setClientName(d.client_name || "");
      } else router.push("/catalogo/reebok/pedidos");
    } catch { router.push("/catalogo/reebok/pedidos"); }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // Client autocomplete
  useEffect(() => {
    if (clientName.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/catalogo/reebok/clientes-search?q=${encodeURIComponent(clientName)}`); if (r.ok) { const d = await r.json(); setSuggestions(d || []); setShowSugg((d || []).length > 0); } } catch { /* */ }
    }, 300);
    return () => clearTimeout(t);
  }, [clientName]);

  useEffect(() => {
    function h(e: MouseEvent) { if (nameRef.current && !nameRef.current.contains(e.target as Node)) setShowSugg(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  if (loading || !order) return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="h-4 shimmer w-24 mb-6" />
        <div className="h-7 shimmer w-56 mb-2" />
        <div className="h-4 shimmer w-36 mb-8" />
        <div className="space-y-0">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4 py-4 border-b border-gray-50" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="w-14 h-14 shimmer rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 shimmer" style={{ width: `${70 - i * 5}%` }} />
                <div className="h-3 shimmer" style={{ width: `${40 - i * 3}%` }} />
              </div>
              <div className="h-9 shimmer w-16 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="mt-8 pt-4 border-t border-gray-100 flex justify-between items-center">
          <div className="h-4 shimmer w-16" />
          <div className="h-8 shimmer w-32 rounded-lg" />
        </div>
      </div>
    </div>
  );

  const totalBultos = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalPiezas = totalBultos * P;
  const totalMoney = items.reduce((s, i) => s + (i.quantity || 0) * P * Number(i.unit_price || 0), 0);

  function updateItem(idx: number, field: string, value: number) { setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it)); }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  async function saveOrder() {
    setSaving(true);
    const res = await fetch(`/api/catalogo/reebok/orders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: clientName, items }),
    });
    if (res.ok) { showToast("Guardado"); load(); } else showToast("Error");
    setSaving(false);
  }

  async function fetchImageB64(url: string): Promise<string | null> {
    try { const r = await fetch(url); const b = await r.blob(); return new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result as string); rd.readAsDataURL(b); }); } catch { return null; }
  }

  async function downloadPDF() {
    if (!order) return;
    showToast("Generando PDF...");
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF("portrait");

    const imgs: Record<number, string> = {};
    for (let i = 0; i < items.length; i++) { if (items[i].image_url) { const b = await fetchImageB64(items[i].image_url); if (b) imgs[i] = b; } }

    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, 210, 18, "F");
    doc.setFontSize(12); doc.setTextColor(255); doc.setFont("helvetica", "bold");
    doc.text("REEBOK", 14, 12);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("Fashion Group · Panamá", 196, 12, { align: "right" });

    doc.setTextColor(100); doc.setFontSize(9);
    doc.text(`Cliente: ${clientName}`, 14, 26);
    doc.text(`Pedido: ${order.order_number}`, 90, 26);
    doc.text(`Fecha: ${new Date(order.created_at).toLocaleDateString("es-PA")}`, 150, 26);

    autoTable(doc, {
      startY: 32,
      head: [["", "Producto", "SKU", "Bultos", "Piezas", "Precio/u", "Subtotal"]],
      body: items.map(i => ["", i.name, i.sku || "", String(i.quantity), String(i.quantity * P), `$${fmt(i.unit_price)}`, `$${fmt(i.quantity * P * Number(i.unit_price))}`]),
      styles: { fontSize: 8, cellPadding: 2, minCellHeight: 16 },
      headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      columnStyles: { 0: { cellWidth: 18 }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "right" }, 6: { halign: "right" } },
      didDrawCell: (data: { row: { index: number; section: string }; column: { index: number }; cell: { x: number; y: number } }) => {
        if (data.column.index === 0 && data.row.section === "body" && imgs[data.row.index]) {
          try { doc.addImage(imgs[data.row.index], "JPEG", data.cell.x + 1, data.cell.y + 1, 14, 14); } catch { /* */ }
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fy = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
    doc.text(`${totalBultos} bultos · ${totalPiezas} piezas`, 14, fy);
    doc.text(`$${fmt(totalMoney)}`, 196, fy, { align: "right" });
    doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
    doc.text("Fashion Group Panama · Reebok Authorized Distributor", 14, fy + 10);

    doc.save(`${order.order_number}-${clientName.replace(/\s+/g, "-")}.pdf`);
    showToast("PDF descargado");
  }

  async function confirmOrder() {
    await saveOrder();
    setSaving(true);
    const res = await fetch("/api/catalogo/reebok/send-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
    showToast(res.ok ? "Pedido confirmado y enviado" : "Error al enviar email");
    setSaving(false);
  }

  async function deleteOrder() {
    if (!await confirmAction("¿Eliminar este pedido?")) return;
    await fetch(`/api/catalogo/reebok/orders/${id}`, { method: "DELETE" });
    router.push("/catalogo/reebok/pedidos");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mt-1" ref={nameRef}>
            <span className="text-sm font-mono text-gray-400">{order.order_number}</span>
            <div className="relative flex-1">
              <input value={clientName} onChange={e => setClientName(e.target.value)}
                onFocus={() => { if (suggestions.length) setShowSugg(true); }}
                className="text-xl font-semibold border-b border-transparent hover:border-gray-200 focus:border-black outline-none transition w-full bg-transparent" />
              {showSugg && suggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg overflow-hidden">
                  {suggestions.slice(0, 5).map((c, i) => (
                    <button key={i} onClick={() => { setClientName(c.nombre); setShowSugg(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">{c.nombre}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">{new Date(order.created_at).toLocaleDateString("es-PA")}</p>
        </div>
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 text-left text-[10px] uppercase text-gray-400 font-normal w-12"></th>
                <th className="py-2 text-left text-[10px] uppercase text-gray-400 font-normal">Producto</th>
                <th className="py-2 text-center text-[10px] uppercase text-gray-400 font-normal w-16">Bultos</th>
                <th className="py-2 text-center text-[10px] uppercase text-gray-400 font-normal w-14">Pzas</th>
                <th className="py-2 text-right text-[10px] uppercase text-gray-400 font-normal w-16">Precio</th>
                <th className="py-2 text-right text-[10px] uppercase text-gray-400 font-normal w-20">Subtotal</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-50">
                  <td className="py-2">
                    <div className="w-10 h-10 bg-gray-50 rounded overflow-hidden">
                      {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-contain" /> : null}
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="text-sm">{item.name}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{item.sku}</div>
                  </td>
                  <td className="py-2 text-center">
                    <input type="number" min={1} step={1} value={item.quantity} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                      className="w-12 text-center border-b border-gray-200 text-sm py-0.5 outline-none focus:border-black tabular-nums" />
                  </td>
                  <td className="py-2 text-center text-xs text-gray-400 tabular-nums">{item.quantity * P}</td>
                  <td className="py-2 text-right">
                    <input type="number" step={1} min={0} value={item.unit_price} onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                      className="w-14 text-right border-b border-gray-200 text-sm py-0.5 outline-none focus:border-black tabular-nums" />
                  </td>
                  <td className="py-2 text-right tabular-nums text-sm">${fmt(item.quantity * P * Number(item.unit_price))}</td>
                  <td className="py-2 text-center">
                    <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition text-xs">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

        <div className="mt-6 mb-6 text-sm text-gray-500">
          {totalBultos} bultos · {totalPiezas} piezas · <span className="text-black font-medium">${fmt(totalMoney)}</span>
        </div>

        <div className="flex flex-col gap-2">
          <Link href="/catalogo/reebok/productos" className="w-full border border-gray-300 text-black py-3 rounded text-sm font-medium hover:border-gray-500 transition text-center block">
            ← Seguir agregando productos
          </Link>
          <button onClick={saveOrder} disabled={saving} className="w-full bg-black text-white py-3 rounded text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={downloadPDF} className="border border-gray-200 text-black py-2.5 rounded text-sm hover:border-gray-400 transition">PDF</button>
            <button onClick={confirmOrder} disabled={saving || !items.length} className="bg-red-600 text-white py-2.5 rounded text-sm hover:bg-red-700 transition disabled:opacity-40">Confirmar y enviar</button>
          </div>
          <button onClick={deleteOrder} className="text-xs text-gray-400 hover:text-red-500 transition mt-2 py-1">Eliminar pedido</button>
        </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2 rounded-full text-sm z-50">{toast}</div>}
    </div>
  );
}
