"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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

  // Debounced PATCH — batch rapid clicks into one API call
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQty = useRef<number | null>(null);
  const baseCache = useRef<string>("[]");

  function updateOrder(newQty: number) {
    const activeOrderId = localStorage.getItem("reebok_active_order_id");
    if (!activeOrderId) return;
    const effectiveQty = newQty <= 0 ? 0 : newQty;
    const isFirstInBatch = pendingQty.current === null;

    // Save base cache only on first click of a batch
    if (isFirstInBatch) baseCache.current = localStorage.getItem("reebok_order_items") || "[]";
    pendingQty.current = effectiveQty;

    // Optimistic update — immediate UI + cache
    setQty(effectiveQty);
    try {
      const cached = JSON.parse(localStorage.getItem("reebok_order_items") || "[]");
      let updated;
      if (effectiveQty <= 0) {
        updated = cached.filter((i: { product_id: string }) => i.product_id !== product.id);
      } else {
        const idx = cached.findIndex((i: { product_id: string }) => i.product_id === product.id);
        if (idx >= 0) {
          updated = cached.map((i: { product_id: string; quantity: number }, j: number) => j === idx ? { ...i, quantity: effectiveQty } : i);
        } else {
          updated = [...cached, { product_id: product.id, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: effectiveQty, unit_price: product.price || 0 }];
        }
      }
      localStorage.setItem("reebok_order_items", JSON.stringify(updated));
      if (effectiveQty > 0 && isFirstInBatch && qty === 0) window.dispatchEvent(new CustomEvent("reebok-toast", { detail: "Agregado" }));
      window.dispatchEvent(new Event("reebok-order-changed"));
    } catch { /* */ }

    // Debounce: reset timer, send only final qty after 400ms idle
    if (patchTimer.current) clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(async () => {
      const finalQty = pendingQty.current!;
      const revertCache = baseCache.current;
      pendingQty.current = null;
      try {
        const res = await fetch(`/api/catalogo/reebok/orders/${activeOrderId}/item`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: product.id, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: finalQty, unit_price: product.price || 0 }),
        });
        if (!res.ok) {
          setQty(getCachedQty(product.id));
          localStorage.setItem("reebok_order_items", revertCache);
          window.dispatchEvent(new Event("reebok-order-changed"));
        }
      } catch {
        setQty(getCachedQty(product.id));
        localStorage.setItem("reebok_order_items", revertCache);
        window.dispatchEvent(new Event("reebok-order-changed"));
      }
    }, 400);
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
            {stock > 0 ? `${stock} disponibles` : "Agotado"}
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
