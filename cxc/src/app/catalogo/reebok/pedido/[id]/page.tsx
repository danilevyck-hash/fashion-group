"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { useToast } from "@/components/ToastSystem";

interface OrderItem { id?: string; product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; }
interface Order { id: string; order_number: string; client_name: string; comment: string; status: string; total: number; reebok_order_items: OrderItem[]; created_at: string; }
interface DirClient { nombre: string; empresa: string; }

const P = 12; // piezas por bulto

export default function OrderDetailPage() {
  const router = useRouter();
  const { confirm: confirmAction } = useToast();
  const params = useParams();
  const id = params.id as string;

  const [role, setRole] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [clientName, setClientName] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [waNumber, setWaNumber] = useState("+507");
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

  useEffect(() => { setRole(sessionStorage.getItem("cxc_role") || ""); load(); }, [load]);

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

  async function generatePDFBlob(): Promise<{ blob: Blob; filename: string } | null> {
    if (!order) return null;
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
    doc.text("Fashion Group Panamá · Reebok Authorized Distributor", 14, fy + 10);

    const filename = `${order.order_number}-${clientName.replace(/\s+/g, "-")}.pdf`;
    return { blob: doc.output("blob"), filename };
  }

  async function downloadPDF() {
    showToast("Generando PDF...");
    const result = await generatePDFBlob();
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a"); a.href = url; a.download = result.filename; a.click();
    URL.revokeObjectURL(url);
    showToast("PDF descargado");
  }

  async function shareWhatsApp() {
    showToast("Generando PDF...");
    await saveOrder();
    const result = await generatePDFBlob();
    if (!result) return;
    const file = new File([result.blob], result.filename, { type: "application/pdf" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Pedido ${order!.order_number}`, text: `Pedido Reebok — ${clientName}` });
    } else {
      // Fallback: download PDF + open WhatsApp with text
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a"); a.href = url; a.download = result.filename; a.click();
      URL.revokeObjectURL(url);
      const text = `*Pedido ${order!.order_number}*\n${clientName}\n${totalBultos} bultos · $${fmt(totalMoney)}\n\n_PDF adjunto_`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
    showToast("Listo");
  }

  async function confirmOrder() {
    showToast("Confirmando pedido...");
    await saveOrder();
    const res = await fetch(`/api/catalogo/reebok/orders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmado" }),
    });
    if (!res.ok) { showToast("Error al confirmar"); return; }

    // Generate PDF and share
    const result = await generatePDFBlob();
    if (result && role !== "cliente") {
      const file = new File([result.blob], result.filename, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Pedido ${order!.order_number}`, text: `Pedido Reebok — ${clientName}` });
      } else {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a"); a.href = url; a.download = result.filename; a.click();
        URL.revokeObjectURL(url);
        if (waNumber.length > 4) {
          const phone = waNumber.replace(/[^0-9]/g, "");
          const text = `Hola, aquí está tu pedido ${order!.order_number} de Reebok Panamá. Gracias por tu compra.`;
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
        }
      }
    }
    setShowConfirmModal(false);
    showToast("Pedido confirmado");
    load();
  }

  async function deleteOrder() {
    if (!await confirmAction("¿Eliminar este pedido?")) return;
    await fetch(`/api/catalogo/reebok/orders/${id}`, { method: "DELETE" });
    router.push("/catalogo/reebok/pedidos");
  }

  const canEdit = ["admin", "secretaria", "vendedor"].includes(role);
  const canDelete = ["admin", "secretaria"].includes(role);
  const isConfirmed = order?.status === "confirmado";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mt-1" ref={nameRef}>
            <span className="text-sm font-mono text-gray-400">{order.order_number}</span>
            <div className="relative flex-1">
              <input value={clientName} onChange={e => { if (canEdit) setClientName(e.target.value); }}
                onFocus={() => { if (canEdit && suggestions.length) setShowSugg(true); }}
                readOnly={!canEdit}
                className={`text-xl font-semibold border-b border-transparent outline-none transition w-full bg-transparent ${canEdit ? "hover:border-gray-200 focus:border-black" : ""}`} />
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
          {!isConfirmed && (
            <Link href="/catalogo/reebok/productos" className="w-full border border-gray-300 text-black py-3 rounded-lg text-sm font-medium hover:border-gray-500 transition text-center block">
              ← Seguir agregando productos
            </Link>
          )}
          {canEdit && !isConfirmed && (
            <button onClick={saveOrder} disabled={saving} className="w-full bg-black text-white py-3.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
              {saving ? "Guardando..." : "Guardar pedido"}
            </button>
          )}
          {!isConfirmed && (
            <button onClick={() => setShowConfirmModal(true)} disabled={saving || !items.length}
              className="w-full bg-emerald-600 text-white py-3.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-40">
              Confirmar y enviar
            </button>
          )}
          {isConfirmed && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 text-center mb-2">
              Pedido confirmado
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={downloadPDF} className="border border-gray-200 text-black py-3 rounded-lg text-sm hover:border-gray-400 transition">Descargar PDF</button>
            <button onClick={shareWhatsApp} disabled={saving} className="bg-green-600 text-white py-3 rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-40">WhatsApp</button>
          </div>
          {canDelete && <button onClick={deleteOrder} className="text-xs text-gray-400 hover:text-red-500 transition mt-4 py-1">Eliminar pedido</button>}
        </div>

        {/* Confirm modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowConfirmModal(false)}>
            <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-medium mb-3">Confirmar pedido {order?.order_number}</h3>
              <div className="text-xs text-gray-500 space-y-1 mb-4">
                <p>Cliente: {clientName}</p>
                <p>{totalBultos} bultos · {totalPiezas} piezas · ${fmt(totalMoney)}</p>
              </div>
              {role !== "cliente" && (
                <div className="mb-4">
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">WhatsApp del cliente</label>
                  <input type="tel" value={waNumber} onChange={e => setWaNumber(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-black" placeholder="+50760001234" />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-2.5 text-sm text-gray-500 hover:text-black transition">Cancelar</button>
                <button onClick={confirmOrder} disabled={saving}
                  className="flex-1 py-2.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50">
                  {saving ? "Enviando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2 rounded-full text-sm z-50">{toast}</div>}
    </div>
  );
}
