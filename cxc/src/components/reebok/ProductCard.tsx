"use client";

import React, { useState } from "react";
import { Product } from "@/components/reebok/supabase";

interface Props {
  product: Product;
  stock?: number;
  qty: number;
  onQtyChange: (productId: string, qty: number, product: Product) => void;
  disabled?: boolean;
}

export default function ProductCard({ product, stock = 0, qty, onQtyChange, disabled }: Props) {
  const [showLightbox, setShowLightbox] = useState(false);
  const [showQtyInput, setShowQtyInput] = useState(false);
  const [qtyInputVal, setQtyInputVal] = useState("");

  function setQty(n: number) {
    onQtyChange(product.id, Math.max(0, n), product);
  }

  function openQtyInput() { setQtyInputVal(String(qty)); setShowQtyInput(true); }
  function submitQtyInput() {
    const n = parseInt(qtyInputVal);
    if (!isNaN(n) && n >= 0) setQty(n);
    setShowQtyInput(false);
  }

  const inOrder = qty > 0;

  return (
    <>
      <div className="bg-white overflow-hidden rounded-lg">
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
            {product.color && <><span className="text-[10px] text-gray-300">·</span><span className="text-[10px] text-gray-400">{product.color}</span></>}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-base font-semibold text-black">
              {product.price ? <>{`$${product.price.toFixed(0)}`}<span className="text-[11px] text-gray-400 font-normal ml-1">/unidad ({`$${(product.price * 12).toFixed(0)}`}/bulto)</span></> : "Consultar"}
            </p>
            {product.on_sale && <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">OFERTA</span>}
          </div>

          {inOrder ? (
            <div className="mt-2">
              <div className="flex items-center justify-between bg-green-50 rounded px-1">
                <button onClick={() => setQty(qty - 1)}
                  className={`h-12 flex items-center justify-center text-green-700 text-lg font-medium hover:bg-green-100 rounded transition ${qty === 1 ? "px-2 gap-1" : "w-12"}`}>
                  {qty === 1 ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      <span className="text-xs font-medium">Quitar</span>
                    </>
                  ) : "−"}
                </button>
                <button onClick={openQtyInput} className="text-center min-w-[48px] py-1">
                  <span className="text-base font-semibold text-green-700 tabular-nums">{qty}</span>
                  <span className="text-[10px] text-green-600 ml-1">bultos</span>
                </button>
                <button onClick={() => setQty(qty + 1)}
                  className="w-12 h-12 flex items-center justify-center text-green-700 text-lg font-medium hover:bg-green-100 rounded transition">+</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { if (!disabled) setQty(1); }} disabled={disabled}
              className={`w-full mt-2 py-3 rounded text-xs font-medium uppercase tracking-wider transition min-h-[48px] ${disabled ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-black text-white hover:bg-gray-800"}`}>
              Agregar
            </button>
          )}
        </div>
      </div>

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

      {showLightbox && product.image_url && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-8" onClick={() => setShowLightbox(false)}>
          <img src={product.image_url} alt={product.name} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setShowLightbox(false)} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">&times;</button>
        </div>
      )}
    </>
  );
}
