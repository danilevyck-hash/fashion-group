"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Order { id: string; order_number: string; client_name: string; vendor_name: string; total: number; item_count: number; created_at: string; }

function fmt(n: number) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString("es-PA", { day: "2-digit", month: "2-digit", year: "numeric" }); }

export default function PedidosPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newClient, setNewClient] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role") || "";
    if (!role) { router.push("/"); return; }
    setActiveId(localStorage.getItem("reebok_active_order_id") || "");
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/catalogo/reebok/orders");
      if (res.ok) setOrders(await res.json());
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function activate(id: string) {
    setActiveId(id);
    localStorage.setItem("reebok_active_order_id", id);
    setToast("Pedido activado");
    setTimeout(() => setToast(null), 2000);
  }

  async function deleteOrder(id: string) {
    if (!confirm("¿Eliminar este pedido permanentemente?")) return;
    await fetch(`/api/catalogo/reebok/orders/${id}`, { method: "DELETE" });
    if (activeId === id) { setActiveId(""); localStorage.removeItem("reebok_active_order_id"); }
    load();
  }

  async function createOrder() {
    if (!newClient.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/catalogo/reebok/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: newClient.trim(), items: [] }),
      });
      if (res.ok) {
        const order = await res.json();
        localStorage.setItem("reebok_active_order_id", order.id);
        router.push(`/catalogo/reebok/pedido/${order.id}`);
      }
    } catch { /* */ }
    setCreating(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/catalogo/reebok" className="text-xs text-gray-400 hover:text-gray-700 transition">← Catálogo</Link>
          <h1 className="text-xl font-bold mt-1">Pedidos</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="bg-reebok-red text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition">
          + Nuevo Pedido
        </button>
      </div>

      {/* New order modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="font-medium mb-4">Nuevo Pedido</h2>
            <label className="text-[11px] text-gray-400 uppercase block mb-1">Nombre del cliente *</label>
            <input value={newClient} onChange={e => setNewClient(e.target.value)} autoFocus placeholder="Ej: Stevens"
              className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition mb-4"
              onKeyDown={e => { if (e.key === "Enter") createOrder(); }} />
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 border border-gray-200 rounded-full text-sm hover:border-gray-400 transition">Cancelar</button>
              <button onClick={createOrder} disabled={creating || !newClient.trim()} className="flex-1 py-2 bg-reebok-red text-white rounded-full text-sm hover:bg-red-700 transition disabled:opacity-50">
                {creating ? "Creando..." : "Crear Pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm mb-4">No hay pedidos. Crea el primero desde el catálogo.</p>
          <button onClick={() => setShowNew(true)} className="bg-reebok-red text-white px-5 py-2 rounded-lg text-sm">+ Nuevo Pedido</button>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Número</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Cliente</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Fecha</th>
                <th className="text-right px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Total</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase text-gray-400 font-normal">Items</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${activeId === o.id ? "border-l-4 border-l-green-500" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs font-medium">{o.order_number}</td>
                  <td className="px-4 py-3 font-medium">{o.client_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">${fmt(o.total)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{o.item_count} items</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Link href={`/catalogo/reebok/pedido/${o.id}`} className="text-xs text-blue-600 hover:underline">Abrir</Link>
                      <button onClick={() => deleteOrder(o.id)} className="text-xs text-gray-400 hover:text-red-500">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-full text-sm z-50 shadow-lg">{toast}</div>}
    </div>
  );
}
