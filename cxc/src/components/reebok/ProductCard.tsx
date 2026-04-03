"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Product } from "@/components/reebok/supabase";

function getCachedQty(productId: string): number {
  try {
    const cached = JSON.parse(localStorage.getItem("reebok_order_items") || "[]");
    const item = cached.find((i: { product_id: string }) => i.product_id === productId);
    return item ? item.quantity : 0;
  } catch { return 0; }
}

export default function ProductCard({ product, stock = 0 }: { product: Product; stock?: number }) {
  const [qty, setQty] = useState(() => getCachedQty(product.id));
  const [busy, setBusy] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showQtyInput, setShowQtyInput] = useState(false);
  const [qtyInputVal, setQtyInputVal] = useState("");

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

  useEffect(() => {
    function handler() { setQty(getCachedQty(product.id)); }
    window.addEventListener("reebok-order-changed", handler);
    return () => window.removeEventListener("reebok-order-changed", handler);
  }, [product.id]);

  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQty = useRef<number | null>(null);
  useEffect(() => { return () => { if (patchTimer.current) clearTimeout(patchTimer.current) } }, []);
  const baseCache = useRef<string>("[]");

  function updateLocalCart(effectiveQty: number) {
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
    } catch { /* */ }
  }

  function updateOrder(newQty: number) {
    const activeOrderId = localStorage.getItem("reebok_active_order_id");
    const effectiveQty = newQty <= 0 ? 0 : newQty;
    const isFirstInBatch = pendingQty.current === null;
    if (isFirstInBatch) baseCache.current = localStorage.getItem("reebok_order_items") || "[]";
    pendingQty.current = effectiveQty;
    setQty(effectiveQty);

    updateLocalCart(effectiveQty);
    if (effectiveQty > 0 && isFirstInBatch && qty === 0) window.dispatchEvent(new CustomEvent("reebok-toast", { detail: "Agregado" }));
    window.dispatchEvent(new Event("reebok-order-changed"));

    // If no order yet (cart mode), just update localStorage — no API call
    if (!activeOrderId) { setBusy(false); return; }

    if (patchTimer.current) clearTimeout(patchTimer.current);
    setBusy(true);
    patchTimer.current = setTimeout(async () => {
      const finalQty = pendingQty.current!;
      const revertCache = baseCache.current;
      pendingQty.current = null;
      try {
        const res = await fetch(`/api/catalogo/reebok/orders/${activeOrderId}/item`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: product.id, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: finalQty, unit_price: product.price || 0 }),
        });
        if (!res.ok) { setQty(getCachedQty(product.id)); localStorage.setItem("reebok_order_items", revertCache); window.dispatchEvent(new Event("reebok-order-changed")); }
      } catch { setQty(getCachedQty(product.id)); localStorage.setItem("reebok_order_items", revertCache); window.dispatchEvent(new Event("reebok-order-changed")); }
      setBusy(false);
    }, 400);
  }

  function handleAdd() {
    // #6: Always add — no need to create order first
    updateOrder(qty + 1);
  }

  // #2: Tap qty → direct input
  function openQtyInput() { setQtyInputVal(String(qty)); setShowQtyInput(true); }
  function submitQtyInput() {
    const n = parseInt(qtyInputVal);
    if (!isNaN(n) && n >= 0) updateOrder(n);
    setShowQtyInput(false);
  }

  const inOrder = qty > 0;

  return (
    <>
      <div className="bg-white overflow-hidden rounded-lg">
        {/* Image — tap to zoom (#7) */}
        <div className="aspect-square bg-gray-50 relative overflow-hidden cursor-pointer" onClick={() => { if (product.image_url) setShowLightbox(true); }}>
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
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {product.sku && <span className="text-[10px] text-gray-400 font-mono">{product.sku}</span>}
            {product.sku && product.sub_category && <span className="text-[10px] text-gray-300">·</span>}
            {product.sub_category && <span className="text-[10px] text-gray-500 capitalize">{product.sub_category}</span>}
            {/* #8: Color */}
            {product.color && <><span className="text-[10px] text-gray-300">·</span><span className="text-[10px] text-gray-400">{product.color}</span></>}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-base font-semibold text-black" title={product.price ? `$${product.price.toFixed(2)} × 12 pzas = $${(product.price * 12).toFixed(0)}/bulto` : ""}>
              {product.price ? `$${product.price.toFixed(0)}` : "Consultar"}
            </p>
            {/* #13: Bigger badge */}
            {product.on_sale && <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">OFERTA</span>}
          </div>

          {inOrder ? (
            <div className="mt-2">
              <div className="flex items-center justify-between bg-green-50 rounded px-1">
                <button onClick={() => updateOrder(qty - 1)} disabled={busy}
                  className="w-12 h-12 flex items-center justify-center text-green-700 text-lg font-medium hover:bg-green-100 rounded transition disabled:opacity-40">
                  {qty === 1 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  ) : "−"}
                </button>
                {/* #2: Tap qty to edit directly */}
                <button onClick={openQtyInput} className="text-center min-w-[48px] py-1">
                  <span className="text-base font-semibold text-green-700 tabular-nums">{qty}</span>
                  <span className="text-[10px] text-green-600 ml-1">bultos</span>
                </button>
                <button onClick={() => updateOrder(qty + 1)} disabled={busy}
                  className="w-12 h-12 flex items-center justify-center text-green-700 text-lg font-medium hover:bg-green-100 rounded transition disabled:opacity-40">+</button>
              </div>
            </div>
          ) : (
            <button onClick={handleAdd} disabled={busy}
              className="w-full mt-2 py-3 rounded text-xs font-medium uppercase tracking-wider transition bg-black text-white hover:bg-gray-800 disabled:opacity-40 min-h-[48px]">
              {busy ? "..." : "Agregar"}
            </button>
          )}
        </div>
      </div>

      {/* #2: Qty input modal */}
      {showQtyInput && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setShowQtyInput(false)}>
          <div className="bg-white rounded-lg p-5 w-56 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-600 mb-3">Cantidad de bultos</p>
            <input type="number" min={0} autoFocus value={qtyInputVal} onChange={e => setQtyInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitQtyInput(); }}
              className="w-full border-b-2 border-black text-2xl text-center font-semibold py-2 outline-none tabular-nums" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowQtyInput(false)} className="flex-1 py-2 text-sm text-gray-500 hover:text-black transition">Cancelar</button>
              <button onClick={submitQtyInput} className="flex-1 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* #7: Lightbox */}
      {showLightbox && product.image_url && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-8" onClick={() => setShowLightbox(false)}>
          <img src={product.image_url} alt={product.name} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setShowLightbox(false)} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">&times;</button>
        </div>
      )}

    </>
  );
}
