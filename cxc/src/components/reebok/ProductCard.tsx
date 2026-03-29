"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Product } from "@/components/reebok/supabase";
import NewOrderModal from "./NewOrderModal";

function getCachedQty(productId: string): number {
  try {
    const cached = JSON.parse(localStorage.getItem("reebok_order_items") || "[]");
    const item = cached.find((i: { product_id: string }) => i.product_id === productId);
    return item ? item.quantity : 0;
  } catch { return 0; }
}

export default React.memo(function ProductCard({ product, stock = 0 }: { product: Product; stock?: number }) {
  const [qty, setQty] = useState(() => getCachedQty(product.id));
  const [busy, setBusy] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const genderLabel = product.gender === "male" ? "Hombre" : product.gender === "female" ? "Mujer" : product.gender === "kids" ? "Ninos" : "";

  // Check if product is in active order on mount
  const checkOrder = useCallback(async () => {
    const id = localStorage.getItem("reebok_active_order_id");
    if (!id) { setQty(0); return; }
    try {
      const res = await fetch(`/api/catalogo/reebok/orders/${id}`);
      if (!res.ok) { setQty(0); return; }
      const order = await res.json();
      const items = order.reebok_order_items || [];
      localStorage.setItem("reebok_order_items", JSON.stringify(items));
      const item = items.find((i: { product_id: string }) => i.product_id === product.id);
      setQty(item ? item.quantity : 0);
    } catch { setQty(0); }
  }, [product.id]);

  useEffect(() => { checkOrder(); }, [checkOrder]);

  // Listen for order changes — read from localStorage cache (no API call)
  useEffect(() => {
    function handler() {
      setQty(getCachedQty(product.id));
    }
    window.addEventListener("reebok-order-changed", handler);
    return () => window.removeEventListener("reebok-order-changed", handler);
  }, [product.id]);

  async function updateOrder(newQty: number) {
    const activeOrderId = localStorage.getItem("reebok_active_order_id");
    if (!activeOrderId) return;
    // Optimistic update — show new qty immediately
    const prevQty = qty;
    setQty(newQty <= 0 ? 0 : newQty);
    setBusy(true);
    try {
      const res = await fetch(`/api/catalogo/reebok/orders/${activeOrderId}`);
      if (!res.ok) { setQty(prevQty); setBusy(false); return; }
      const order = await res.json();
      const items = (order.reebok_order_items || []) as { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }[];
      const idx = items.findIndex(i => i.product_id === product.id);

      let newItems;
      if (newQty <= 0) {
        newItems = items.filter(i => i.product_id !== product.id);
      } else if (idx >= 0) {
        newItems = items.map((i, j) => j === idx ? { ...i, quantity: newQty } : i);
      } else {
        newItems = [...items, { product_id: product.id, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: newQty, unit_price: product.price || 0 }];
      }

      const putRes = await fetch(`/api/catalogo/reebok/orders/${activeOrderId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: newItems }),
      });
      if (putRes.ok) {
        localStorage.setItem("reebok_order_items", JSON.stringify(newItems));
        if (newQty > 0 && idx < 0) window.dispatchEvent(new CustomEvent("reebok-toast", { detail: "Agregado" }));
        window.dispatchEvent(new Event("reebok-order-changed"));
      } else {
        // Revert on API failure
        setQty(prevQty);
      }
    } catch {
      // Revert on network error
      setQty(prevQty);
    }
    setBusy(false);
  }

  function handleAdd() {
    const activeOrderId = localStorage.getItem("reebok_active_order_id");
    if (!activeOrderId) { setShowNewOrder(true); return; }
    updateOrder(qty + 1);
  }

  const inOrder = qty > 0;

  return (
    <>
      <div className="bg-white overflow-hidden">
        <div className="aspect-square bg-gray-50 relative overflow-hidden">
          {product.on_sale && (
            <span className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">OFERTA</span>
          )}
          <span className={`absolute top-2 right-2 z-10 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${stock > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {stock > 0 ? "Disponible" : "Agotado"}
          </span>
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-2" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">{product.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            {product.sku && <span className="text-[10px] text-gray-400 font-mono">{product.sku}</span>}
            {genderLabel && <span className="text-[10px] text-gray-400">{genderLabel}</span>}
          </div>
          <p className="text-base font-semibold text-black mt-1.5">
            {product.price ? `$${product.price.toFixed(0)}` : "Consultar"}
          </p>

          {inOrder ? (
            <div className="mt-2">
              <div className="flex items-center justify-between bg-green-50 rounded px-1">
                <button onClick={() => updateOrder(qty - 1)} disabled={busy}
                  className="w-11 h-11 flex items-center justify-center text-green-700 text-lg font-medium hover:bg-green-100 rounded transition disabled:opacity-40">
                  {qty === 1 ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  ) : "−"}
                </button>
                <div className="text-center">
                  <span className="text-sm font-semibold text-green-700 tabular-nums">{qty}</span>
                  <span className="text-[9px] text-green-600 ml-1">bultos</span>
                </div>
                <button onClick={() => updateOrder(qty + 1)} disabled={busy}
                  className="w-11 h-11 flex items-center justify-center text-green-700 text-lg font-medium hover:bg-green-100 rounded transition disabled:opacity-40">+</button>
              </div>
            </div>
          ) : (
            <button onClick={handleAdd} disabled={busy}
              className="w-full mt-2 py-2.5 rounded text-xs font-medium uppercase tracking-wider transition bg-black text-white hover:bg-gray-800 disabled:opacity-40 min-h-[44px]">
              {busy ? "..." : "Agregar"}
            </button>
          )}
        </div>
      </div>

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => { setShowNewOrder(false); setTimeout(() => updateOrder(1), 300); }}
          autoAddProduct={{ product_id: product.id, sku: product.sku || "", name: product.name, image_url: product.image_url || "", unit_price: product.price || 0 }}
        />
      )}
    </>
  );
});
