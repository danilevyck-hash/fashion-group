"use client";

import { useState } from "react";
import { Product } from "@/components/reebok/supabase";
import NewOrderModal from "./NewOrderModal";

export default function ProductCard({ product, stock = 0 }: { product: Product; stock?: number }) {
  const [status, setStatus] = useState<"idle" | "adding" | "added">("idle");
  const [showNewOrder, setShowNewOrder] = useState(false);

  const genderLabel = product.gender === "male" ? "Hombre" : product.gender === "female" ? "Mujer" : product.gender === "kids" ? "Ninos" : "";

  const handleAdd = async () => {
    const activeOrderId = localStorage.getItem("reebok_active_order_id");
    if (!activeOrderId) { setShowNewOrder(true); return; }

    setStatus("adding");
    try {
      const res = await fetch(`/api/catalogo/reebok/orders/${activeOrderId}`);
      if (!res.ok) { setShowNewOrder(true); setStatus("idle"); return; }
      const order = await res.json();
      const items = order.reebok_order_items || [];
      const idx = items.findIndex((i: { product_id: string }) => i.product_id === product.id);
      const newItems = idx >= 0
        ? items.map((i: { product_id: string; quantity: number }, j: number) => j === idx ? { ...i, quantity: i.quantity + 1 } : i)
        : [...items, { product_id: product.id, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: 1, unit_price: product.price || 0 }];

      const putRes = await fetch(`/api/catalogo/reebok/orders/${activeOrderId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: newItems }),
      });
      if (putRes.ok) {
        setStatus("added");
        window.dispatchEvent(new CustomEvent("reebok-toast", { detail: "Agregado" }));
        setTimeout(() => setStatus("idle"), 1500);
      }
    } catch { setStatus("idle"); }
  };

  return (
    <>
      <div className="bg-white overflow-hidden group">
        <div className="aspect-square bg-gray-50 relative overflow-hidden">
          {product.on_sale && (
            <span className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">OFERTA</span>
          )}
          <span className={`absolute top-2 right-2 z-10 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${stock > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {stock > 0 ? "Disponible" : "Agotado"}
          </span>
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-2" />
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
          <button onClick={handleAdd} disabled={status === "adding"}
            className={`w-full mt-2 py-2 rounded text-xs font-medium uppercase tracking-wider transition ${
              status === "added" ? "bg-green-600 text-white" : status === "adding" ? "bg-gray-200 text-gray-400" : "bg-black text-white hover:bg-gray-800"
            }`}>
            {status === "added" ? "Agregado" : status === "adding" ? "..." : "Agregar"}
          </button>
        </div>
      </div>

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => { setShowNewOrder(false); handleAdd(); }}
          autoAddProduct={{ product_id: product.id, sku: product.sku || "", name: product.name, image_url: product.image_url || "", unit_price: product.price || 0 }}
        />
      )}
    </>
  );
}
