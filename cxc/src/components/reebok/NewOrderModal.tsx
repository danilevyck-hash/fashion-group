"use client";

import { useState, useEffect, useRef } from "react";

interface DirClient { nombre: string; empresa: string; }

interface Props {
  onClose: () => void;
  onCreated: (orderId: string, orderNumber: string, clientName: string) => void;
  autoAddProduct?: { product_id: string; sku: string; name: string; image_url: string; unit_price: number };
}

export default function NewOrderModal({ onClose, onCreated, autoAddProduct }: Props) {
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [suggestions, setSuggestions] = useState<DirClient[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmed || name.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/reebok/clientes-search?q=${encodeURIComponent(name)}`);
        if (res.ok) { const d = await res.json(); setSuggestions(d || []); setShowSugg((d || []).length > 0); }
      } catch { /* */ }
    }, 250);
    return () => clearTimeout(t);
  }, [name, confirmed]);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setShowSugg(false); }
    document.addEventListener("mousedown", h);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", esc); };
  }, [onClose]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const items = autoAddProduct ? [{
        product_id: autoAddProduct.product_id, sku: autoAddProduct.sku,
        name: autoAddProduct.name, image_url: autoAddProduct.image_url,
        quantity: 1, unit_price: autoAddProduct.unit_price,
      }] : [];
      const res = await fetch("/api/catalogo/reebok/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: name.trim(), items }),
      });
      if (res.ok) {
        const order = await res.json();
        localStorage.setItem("reebok_active_order_id", order.id);
        localStorage.setItem("reebok_active_order_number", order.order_number);
        localStorage.setItem("reebok_active_order_client", name.trim());
        if (items.length > 0) {
          localStorage.setItem("reebok_order_items", JSON.stringify(items));
        }
        onCreated(order.id, order.order_number, name.trim());
      }
    } catch { /* */ }
    setCreating(false);
  }

  const canCreate = confirmed || name.trim().length > 2;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-medium mb-4">Nuevo Pedido</h2>
        <div className="relative" ref={ref}>
          {confirmed ? (
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm font-medium">{name}</span>
              <button onClick={() => { setConfirmed(false); setName(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cambiar</button>
            </div>
          ) : (
            <>
              <input value={name} onChange={e => setName(e.target.value)}
                onFocus={() => { if (suggestions.length) setShowSugg(true); }}
                onKeyDown={e => { if (e.key === "Enter" && canCreate) create(); }}
                placeholder="Nombre del cliente" autoFocus
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              {showSugg && suggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {suggestions.slice(0, 5).map((c, i) => (
                    <button key={i} onClick={() => { setName(c.nombre); setShowSugg(false); setConfirmed(true); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      {c.nombre}{c.empresa && <span className="text-xs text-gray-400 ml-2">{c.empresa}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <button onClick={create} disabled={creating || !canCreate}
          className="w-full mt-4 bg-black text-white py-2.5 rounded text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
          {creating ? "Creando..." : "Crear pedido"}
        </button>
        <button onClick={onClose} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-1">Cancelar</button>
      </div>
    </div>
  );
}
