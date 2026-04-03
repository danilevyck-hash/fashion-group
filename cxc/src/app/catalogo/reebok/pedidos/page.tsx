"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal, EmptyState } from "@/components/ui";

interface Order { id: string; order_number: string; client_name: string; vendor_name: string | null; status: string; total: number; item_count: number; created_at: string; }

const STATUS_LABELS: Record<string, string> = { borrador: "Borrador", enviado: "Enviado", confirmado: "Confirmado" };
const STATUS_COLORS: Record<string, string> = {
  borrador: "bg-gray-100 text-gray-600",
  enviado: "bg-blue-100 text-blue-700",
  confirmado: "bg-green-100 text-green-700",
};

export default function PedidosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [role, setRole] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    if (r === "cliente") { router.push("/catalogo/reebok"); return; }
    setRole(r);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/catalogo/reebok/orders"); if (r.ok) setOrders(await r.json()); } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteOrder() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/catalogo/reebok/orders/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      const activeId = localStorage.getItem("reebok_active_order_id");
      if (activeId === deleteTarget.id) { localStorage.removeItem("reebok_active_order_id"); localStorage.removeItem("reebok_active_order_number"); localStorage.removeItem("reebok_active_order_client"); }
    }
    setDeleting(false);
    setDeleteTarget(null);
    load();
  }

  async function duplicateOrder(order: Order) {
    toast("Duplicando pedido...");
    try {
      const res = await fetch(`/api/catalogo/reebok/orders/${order.id}`);
      if (!res.ok) { toast("Error al cargar pedido", "error"); return; }
      const full = await res.json();
      const items = (full.reebok_order_items || []).map((i: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }) => ({
        product_id: i.product_id, sku: i.sku, name: i.name, image_url: i.image_url, quantity: i.quantity, unit_price: i.unit_price,
      }));
      const createRes = await fetch("/api/catalogo/reebok/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: order.client_name, vendor_name: typeof window !== 'undefined' ? sessionStorage.getItem('fg_user_name') || null : null, items }),
      });
      if (createRes.ok) {
        const newOrder = await createRes.json();
        toast("Pedido duplicado");
        router.push(`/catalogo/reebok/pedido/${newOrder.id}`);
      } else { toast("Error al duplicar", "error"); }
    } catch { toast("Error al duplicar", "error"); }
  }

  // Date filtering
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const canDelete = role === "admin" || role === "secretaria";
  const visibleOrders = orders;
  const filtered = visibleOrders
    .filter(o => !search || o.client_name.toLowerCase().includes(search.toLowerCase()) || o.order_number.toLowerCase().includes(search.toLowerCase()))
    .filter(o => {
      if (!dateFilter) return true;
      const d = new Date(o.created_at);
      if (dateFilter === "week") return d >= startOfWeek;
      if (dateFilter === "month") return d >= startOfMonth;
      return true;
    });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link href="/catalogo/reebok" className="text-xs text-gray-400 hover:text-gray-600 transition">← Catálogo</Link>
      <h1 className="text-2xl font-light mt-2 mb-6">Pedidos</h1>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente o #..."
          className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition w-56" />
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
          <option value="">Todos</option>
          <option value="week">Esta semana</option>
          <option value="month">Este mes</option>
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} pedidos</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState title={search || dateFilter ? "Sin resultados" : "No hay pedidos"} subtitle={search || dateFilter ? "Intenta con otros filtros" : "Los pedidos aparecerán aquí"} />
      ) : (
        <div className="space-y-2">
          {filtered.map(o => (
            <div key={o.id} onClick={() => router.push(`/catalogo/reebok/pedido/${o.id}`)}
              className="flex items-center gap-3 px-4 py-3 border border-gray-100 rounded-lg hover:border-gray-300 transition cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{o.client_name}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[o.status] || STATUS_COLORS.borrador}`}>
                    {STATUS_LABELS[o.status] || "Borrador"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400 font-mono">{o.order_number}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("es-PA")}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{o.item_count} items</span>
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums">${fmt(o.total)}</span>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => duplicateOrder(o)} className="text-xs text-gray-300 hover:text-blue-500 transition px-1" title="Duplicar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
                {canDelete && (
                  <button onClick={() => setDeleteTarget(o)} className="text-xs text-gray-300 hover:text-red-500 transition px-1" title="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title={`¿Eliminar pedido ${deleteTarget?.order_number || ""}?`}
        description={`Se eliminará el pedido de ${deleteTarget?.client_name || ""} con ${deleteTarget?.item_count || 0} items ($${fmt(deleteTarget?.total || 0)}). Esta acción no se puede deshacer.`}
        onConfirm={deleteOrder}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
