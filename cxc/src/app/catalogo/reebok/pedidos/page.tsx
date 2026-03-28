"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmt } from "@/lib/format";

interface Order { id: string; order_number: string; client_name: string; total: number; item_count: number; created_at: string; }

export default function PedidosPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { if (!sessionStorage.getItem("cxc_role")) router.push("/"); }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/catalogo/reebok/orders"); if (r.ok) setOrders(await r.json()); } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteOrder(id: string) {
    if (!confirm("¿Eliminar este pedido?")) return;
    await fetch(`/api/catalogo/reebok/orders/${id}`, { method: "DELETE" });
    const activeId = localStorage.getItem("reebok_active_order_id");
    if (activeId === id) { localStorage.removeItem("reebok_active_order_id"); localStorage.removeItem("reebok_active_order_number"); localStorage.removeItem("reebok_active_order_client"); }
    load();
  }

  const filtered = orders.filter(o => !search || o.client_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link href="/catalogo/reebok" className="text-xs text-gray-400 hover:text-gray-600 transition">← Catálogo</Link>
      <h1 className="text-2xl font-light mt-2 mb-6">Pedidos</h1>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente..."
        className="border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition w-64 mb-6" />

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm py-16 text-center">{search ? "Sin resultados" : "No hay pedidos. Crea uno desde el catálogo."}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 text-left text-[10px] uppercase text-gray-400 font-normal">#</th>
              <th className="py-2 text-left text-[10px] uppercase text-gray-400 font-normal">Cliente</th>
              <th className="py-2 text-left text-[10px] uppercase text-gray-400 font-normal">Fecha</th>
              <th className="py-2 text-center text-[10px] uppercase text-gray-400 font-normal">Items</th>
              <th className="py-2 text-right text-[10px] uppercase text-gray-400 font-normal">Total</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id} onClick={() => router.push(`/catalogo/reebok/pedido/${o.id}`)}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer min-h-[56px]">
                <td className="py-3 font-mono text-xs text-gray-400">{o.order_number}</td>
                <td className="py-3 font-medium">{o.client_name}</td>
                <td className="py-3 text-gray-500 text-xs">{new Date(o.created_at).toLocaleDateString("es-PA")}</td>
                <td className="py-3 text-center text-gray-400 text-xs">{o.item_count}</td>
                <td className="py-3 text-right tabular-nums">${fmt(o.total)}</td>
                <td className="py-3 text-right">
                  <button onClick={(e) => { e.stopPropagation(); deleteOrder(o.id); }} className="text-xs text-gray-300 hover:text-red-500 transition">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
