"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface OrderItem { id?: string; product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; }
interface Order { id: string; order_number: string; client_name: string; vendor_name: string; comment: string; total: number; reebok_order_items: OrderItem[]; created_at: string; }
interface SearchResult { id: string; sku: string; name: string; price: number; image_url: string; }
interface DirClient { nombre: string; empresa: string; correo: string; }

const P = 12;
function fmt(n: number) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [clientName, setClientName] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Client autocomplete (FIX 1)
  const [clientSuggestions, setClientSuggestions] = useState<DirClient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);

  // Product search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalogo/reebok/orders/${id}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data);
        setItems(data.reebok_order_items || []);
        setClientName(data.client_name || "");
        setComment(data.comment || "");
        // FIX 2: Auto-set as active order
        localStorage.setItem("reebok_active_order_id", data.id);
        localStorage.setItem("reebok_active_order_number", data.order_number);
      } else router.push("/catalogo/reebok/pedidos");
    } catch { router.push("/catalogo/reebok/pedidos"); }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // FIX 1: Client name autocomplete
  useEffect(() => {
    if (clientName.length < 2) { setClientSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/reebok/clientes-search?q=${encodeURIComponent(clientName)}`);
        if (res.ok) {
          const data = await res.json();
          setClientSuggestions(data || []);
          setShowSuggestions((data || []).length > 0);
        }
      } catch { /* */ }
    }, 300);
    return () => clearTimeout(t);
  }, [clientName]);

  // Close suggestions on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Product search
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/catalogo/reebok/products?search=${encodeURIComponent(search)}&active=true`);
        if (res.ok) setResults(((await res.json()) || []).slice(0, 6));
      } catch { /* */ }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  if (loading || !order) return null;

  const totalBultos = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalPiezas = totalBultos * P;
  const totalMoney = items.reduce((s, i) => s + (i.quantity || 0) * P * Number(i.unit_price || 0), 0);

  function updateItem(idx: number, field: string, value: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  function addProduct(p: SearchResult) {
    const existing = items.findIndex(i => i.product_id === p.id);
    if (existing >= 0) {
      setItems(prev => prev.map((it, i) => i === existing ? { ...it, quantity: it.quantity + 1 } : it));
    } else {
      setItems(prev => [...prev, { product_id: p.id, sku: p.sku, name: p.name, image_url: p.image_url, quantity: 1, unit_price: p.price || 0 }]);
    }
    setSearch(""); setResults([]);
    showToast(`${p.name} agregado`);
  }

  async function saveOrder() {
    setSaving(true);
    try {
      const res = await fetch(`/api/catalogo/reebok/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: clientName, comment, items }),
      });
      if (res.ok) { showToast("Pedido guardado"); load(); }
      else showToast("Error al guardar");
    } catch { showToast("Error de conexión"); }
    setSaving(false);
  }

  // FIX 4: PDF with autoTable as function
  async function downloadPDF() {
    if (!order) return;
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = autoTableModule.default;
    const doc = new jsPDF("portrait");

    doc.setFillColor(204, 0, 0);
    doc.rect(0, 0, 210, 22, "F");
    doc.setFontSize(14); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
    doc.text("REEBOK PANAMA", 14, 10);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`${order.order_number} · ${clientName}`, 14, 17);
    doc.text(new Date(order.created_at).toLocaleDateString("es-PA"), 196, 10, { align: "right" });
    doc.text("Fashion Group", 196, 17, { align: "right" });

    const rows = items.map(i => [i.sku || "", i.name || "", String(i.quantity), String(i.quantity * P), `$${fmt(i.unit_price)}`, `$${fmt(i.quantity * P * Number(i.unit_price))}`]);
    autoTable(doc, {
      startY: 28,
      head: [["SKU", "Producto", "Bultos", "Piezas", "Precio/u", "Subtotal"]],
      body: rows,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [204, 0, 0] },
      columnStyles: { 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fy = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10); doc.setTextColor(26, 26, 26); doc.setFont("helvetica", "bold");
    doc.text(`Total: ${totalBultos} bultos (${totalPiezas} piezas)`, 14, fy);
    doc.setTextColor(204, 0, 0);
    doc.text(`$${fmt(totalMoney)}`, 196, fy, { align: "right" });
    if (comment) { doc.setFontSize(8); doc.setTextColor(100); doc.setFont("helvetica", "normal"); doc.text(`Nota: ${comment}`, 14, fy + 8); }

    doc.save(`${order.order_number}.pdf`);
  }

  async function confirmOrder() {
    await saveOrder();
    setSaving(true);
    try {
      const res = await fetch("/api/catalogo/reebok/send-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      if (res.ok) showToast("Pedido confirmado y enviado por email");
      else showToast("Pedido guardado pero error al enviar email");
    } catch { showToast("Error al enviar"); }
    setSaving(false);
  }

  async function deleteOrder() {
    if (!confirm("¿Eliminar este pedido permanentemente?")) return;
    await fetch(`/api/catalogo/reebok/orders/${id}`, { method: "DELETE" });
    localStorage.removeItem("reebok_active_order_id");
    localStorage.removeItem("reebok_active_order_number");
    router.push("/catalogo/reebok/pedidos");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <Link href="/catalogo/reebok/pedidos" className="text-xs text-gray-400 hover:text-gray-700 transition">← Pedidos</Link>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-sm font-bold text-reebok-red">{order.order_number}</span>
            {/* FIX 1: Client name with autocomplete */}
            <div className="relative flex-1" ref={clientRef}>
              <input value={clientName} onChange={e => { setClientName(e.target.value); }}
                onFocus={() => { if (clientSuggestions.length > 0) setShowSuggestions(true); }}
                className="text-xl font-bold border-b border-transparent hover:border-gray-300 focus:border-black outline-none transition py-0.5 w-full" />
              {showSuggestions && clientSuggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {clientSuggestions.slice(0, 5).map((c, i) => (
                    <button key={i} onClick={() => { setClientName(c.nombre); setShowSuggestions(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 transition text-sm border-b border-gray-50 last:border-0">
                      <span className="font-medium">{c.nombre}</span>
                      {c.empresa && <span className="text-xs text-gray-400 ml-2">{c.empresa}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">{new Date(order.created_at).toLocaleDateString("es-PA")}</p>
        </div>
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-[11px] uppercase text-gray-400 font-normal w-12">Foto</th>
                <th className="text-left px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">SKU</th>
                <th className="text-left px-3 py-2 text-[11px] uppercase text-gray-400 font-normal">Producto</th>
                <th className="text-center px-3 py-2 text-[11px] uppercase text-gray-400 font-normal w-20">Bultos</th>
                <th className="text-center px-3 py-2 text-[11px] uppercase text-gray-400 font-normal w-16">Pzs</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase text-gray-400 font-normal w-20">Precio/u</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase text-gray-400 font-normal w-24">Subtotal</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-50">
                  <td className="px-3 py-2">
                    <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden">
                      {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-[8px]">—</div>}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.sku || "—"}</td>
                  <td className="px-3 py-2 text-xs">{item.name}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                      className="w-14 text-center border border-gray-200 rounded px-1 py-1 text-xs" />
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-gray-400">{item.quantity * P}</td>
                  <td className="px-3 py-2 text-right">
                    {/* FIX 3: step=1, min=0 */}
                    <input type="number" step={1} min={0} value={item.unit_price} onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                      className="w-16 text-right border border-gray-200 rounded px-1 py-1 text-xs" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs font-medium">${fmt(item.quantity * P * Number(item.unit_price))}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FIX 2+5: Add product section */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <label className="text-[11px] text-gray-400 uppercase">Agregar producto</label>
          <Link href="/catalogo/reebok" className="text-xs text-reebok-red hover:underline">➕ Ver catálogo completo</Link>
        </div>
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por SKU o nombre..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300" />
          {searching && <span className="absolute right-3 top-3 text-xs text-gray-300">Buscando...</span>}
          {results.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {results.map(p => (
                <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 transition flex items-center gap-3 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-contain" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-gray-400">{p.sku} · ${fmt(p.price || 0)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comment */}
      <div className="mb-6">
        <label className="text-[11px] text-gray-400 uppercase block mb-1">Comentario del pedido</label>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Notas opcionales..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gray-300 resize-none" />
      </div>

      {/* Totals */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
        <span className="text-sm text-gray-500">{totalBultos} bultos · {totalPiezas} piezas</span>
        <span className="text-lg font-bold text-reebok-red">${fmt(totalMoney)}</span>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button onClick={saveOrder} disabled={saving} className="w-full bg-reebok-dark text-white py-3 rounded-lg text-sm font-medium hover:bg-black transition disabled:opacity-50">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={downloadPDF} className="border border-reebok-red text-reebok-red py-3 rounded-lg text-sm font-medium hover:bg-reebok-red hover:text-white transition">
            Descargar PDF
          </button>
          <button onClick={confirmOrder} disabled={saving || items.length === 0} className="bg-reebok-red text-white py-3 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
            Confirmar pedido
          </button>
        </div>
        <button onClick={deleteOrder} className="text-xs text-gray-400 hover:text-red-500 transition mt-2">Eliminar pedido</button>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-full text-sm z-50 shadow-lg">{toast}</div>}
    </div>
  );
}
