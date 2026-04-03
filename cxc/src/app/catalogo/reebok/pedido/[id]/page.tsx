"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { ConfirmDeleteModal, Toast } from "@/components/ui";

interface OrderItem { id?: string; product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; }
interface Order { id: string; order_number: string; client_name: string; comment: string; status: string; total: number; reebok_order_items: OrderItem[]; created_at: string; }
interface DirClient { nombre: string; empresa: string; }

const P = 12;

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [role, setRole] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [clientName, setClientName] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DirClient[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "dirty" | null>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalogo/reebok/orders/${id}`);
      if (res.ok) {
        const d = await res.json();
        const r = sessionStorage.getItem("cxc_role") || "";
        if (r === "cliente") {
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
      try {
        const r = await fetch(`/api/catalogo/reebok/clientes-search?q=${encodeURIComponent(clientName)}`);
        if (r.ok) { const d = await r.json(); setSuggestions(d || []); setShowSugg((d || []).length > 0); }
      } catch { /* */ }
    }, 300);
    return () => clearTimeout(t);
  }, [clientName]);

  useEffect(() => {
    function h(e: MouseEvent) { if (nameRef.current && !nameRef.current.contains(e.target as Node)) setShowSugg(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── AUTO-SAVE (2s debounce) ──
  const changeCount = useRef(0);
  useEffect(() => {
    changeCount.current++;
    if (changeCount.current <= 1 || !order || order.status === "confirmado") return;
    setAutoSaveStatus("dirty");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (!saveInFlight.current) doAutoSave();
    }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, clientName]);

  async function doAutoSave() {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setAutoSaveStatus("saving");
    try {
      await fetch(`/api/catalogo/reebok/orders/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: clientName, items }),
      });
      setAutoSaveStatus("saved");
    } catch {
      setAutoSaveStatus("dirty");
    }
    saveInFlight.current = false;
  }

  // ── CONFIRM ORDER (save + set status + send email with PDF) ──
  async function confirmOrder() {
    setConfirming(true);
    showToast("Confirmando pedido...");

    // Save first
    await fetch(`/api/catalogo/reebok/orders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: clientName, items, status: "confirmado" }),
    });

    // Send email with order summary via existing API
    try {
      const res = await fetch("/api/catalogo/reebok/send-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      if (res.ok) {
        showToast("Pedido confirmado. Se envio por email a Fashion Group.");
      } else {
        showToast("Pedido confirmado, pero el email no se pudo enviar.");
      }
    } catch {
      showToast("Pedido confirmado, pero el email fallo.");
    }

    setConfirming(false);
    load();
  }

  // ── EDIT (revert to borrador) ──
  async function editOrder() {
    setSaving(true);
    await fetch(`/api/catalogo/reebok/orders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "borrador" }),
    });
    setSaving(false);
    showToast("Pedido en modo edicion");
    load();
  }

  async function deleteOrder() {
    setDeletingOrder(true);
    await fetch(`/api/catalogo/reebok/orders/${id}`, { method: "DELETE" });
    setDeletingOrder(false);
    setShowDeleteModal(false);
    router.push("/catalogo/reebok/pedidos");
  }

  function updateItem(idx: number, field: string, value: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }
  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const canEdit = ["admin", "secretaria", "vendedor"].includes(role);
  const canDelete = ["admin", "secretaria"].includes(role);
  const isConfirmed = order?.status === "confirmado";

  // ── LOADING SKELETON ──
  if (loading || !order) return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="h-4 shimmer w-24 mb-6" />
        <div className="h-7 shimmer w-56 mb-2" />
        <div className="h-4 shimmer w-36 mb-8" />
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-4 py-4 border-b border-gray-50" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="w-14 h-14 shimmer rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 shimmer" style={{ width: `${70 - i * 5}%` }} />
              <div className="h-3 shimmer" style={{ width: `${40 - i * 3}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const totalBultos = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalPiezas = totalBultos * P;
  const totalMoney = items.reduce((s, i) => s + (i.quantity || 0) * P * Number(i.unit_price || 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3" ref={nameRef}>
          <span className="text-sm font-mono text-gray-400">{order.order_number}</span>
          <div className="relative flex-1">
            {!isConfirmed && canEdit ? (
              <>
                <input value={clientName} onChange={e => setClientName(e.target.value)}
                  onFocus={() => { if (suggestions.length) setShowSugg(true); }}
                  className="text-xl font-semibold border-b border-transparent outline-none transition w-full bg-transparent hover:border-gray-200 focus:border-black" />
                {showSugg && suggestions.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg overflow-hidden">
                    {suggestions.slice(0, 5).map((c, i) => (
                      <button key={i} onClick={() => { setClientName(c.nombre); setShowSugg(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">{c.nombre}</button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xl font-semibold">{clientName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Auto-save indicator */}
          {autoSaveStatus === "saving" && <span className="text-[11px] text-gray-400">Guardando...</span>}
          {autoSaveStatus === "saved" && <span className="text-[11px] text-green-600">Guardado</span>}
          {/* Catalog link */}
          {!isConfirmed && (
            <Link href="/catalogo/reebok/productos" className="text-xs text-gray-500 hover:text-black transition">
              Ver catalogo
            </Link>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-4">{new Date(order.created_at).toLocaleDateString("es-PA")}</p>

      {/* Items table */}
      {items.length > 0 ? (
        <div className="mb-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                <th className="py-2 text-left text-[10px] uppercase text-gray-400 font-normal w-12"></th>
                <th className="py-2 text-left text-[10px] uppercase text-gray-400 font-normal">Producto</th>
                <th className="py-2 text-center text-[10px] uppercase text-gray-400 font-normal w-16">Bultos</th>
                <th className="py-2 text-center text-[10px] uppercase text-gray-400 font-normal w-14">Pzas</th>
                <th className="py-2 text-right text-[10px] uppercase text-gray-400 font-normal w-16">Precio</th>
                <th className="py-2 text-right text-[10px] uppercase text-gray-400 font-normal w-20">Subtotal</th>
                {!isConfirmed && <th className="w-8"></th>}
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
                    {!isConfirmed ? (
                      <input type="number" min={1} step={1} value={item.quantity}
                        onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                        className="w-12 text-center border-b border-gray-200 text-sm py-0.5 outline-none focus:border-black tabular-nums" />
                    ) : (
                      <span className="tabular-nums">{item.quantity}</span>
                    )}
                  </td>
                  <td className="py-2 text-center text-xs text-gray-400 tabular-nums">{item.quantity * P}</td>
                  <td className="py-2 text-right">
                    {!isConfirmed ? (
                      <input type="number" step={1} min={0} value={item.unit_price}
                        onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                        className="w-14 text-right border-b border-gray-200 text-sm py-0.5 outline-none focus:border-black tabular-nums" />
                    ) : (
                      <span className="tabular-nums">${fmt(item.unit_price)}</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-sm">${fmt(item.quantity * P * Number(item.unit_price))}</td>
                  {!isConfirmed && (
                    <td className="py-2 text-center">
                      <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition text-xs">x</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg mb-4">
          No hay productos. <Link href="/catalogo/reebok/productos" className="text-black underline">Agregar desde el catalogo</Link>
        </div>
      )}

      {/* Totals */}
      <div className="flex items-center justify-between py-3 border-t border-gray-200 mb-6">
        <span className="text-sm text-gray-500">{totalBultos} bultos · {totalPiezas} piezas</span>
        <span className="text-lg font-semibold tabular-nums">${fmt(totalMoney)}</span>
      </div>

      {/* Actions — ONE primary button */}
      {isConfirmed ? (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-center">
            <span className="text-emerald-700 font-medium text-sm">&#10003; Pedido confirmado</span>
            <span className="text-emerald-600 text-xs block mt-0.5">Enviado por email a Fashion Group</span>
          </div>
          {canEdit && (
            <button onClick={editOrder} disabled={saving}
              className="w-full border border-gray-300 text-black py-2.5 rounded-lg text-sm hover:border-gray-500 transition disabled:opacity-40">
              Editar pedido
            </button>
          )}
        </div>
      ) : (
        <button onClick={confirmOrder} disabled={confirming || !items.length}
          className="w-full bg-emerald-600 text-white py-3.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-40">
          {confirming ? "Confirmando..." : "Confirmar pedido"}
        </button>
      )}

      {/* Delete — only draft, small text at bottom */}
      {canDelete && !isConfirmed && (
        <button onClick={() => setShowDeleteModal(true)}
          className="text-xs text-gray-400 hover:text-red-500 transition mt-6 py-1 block mx-auto">
          Eliminar pedido
        </button>
      )}

      <ConfirmDeleteModal
        open={showDeleteModal}
        title={`Eliminar pedido ${order?.order_number || ""}?`}
        description={`Se eliminara el pedido de ${clientName} con ${items.length} productos ($${fmt(totalMoney)}).`}
        onConfirm={deleteOrder}
        onCancel={() => setShowDeleteModal(false)}
        loading={deletingOrder}
      />

      <Toast message={toast} />
    </div>
  );
}
