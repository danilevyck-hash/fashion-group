"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Product } from "@/components/reebok/supabase";
import ProductCard from "@/components/reebok/ProductCard";

function getOrderCount(): number {
  try {
    const items = JSON.parse(localStorage.getItem("reebok_order_items") || "[]");
    return items.reduce((s: number, i: { quantity: number }) => s + (i.quantity || 0), 0);
  } catch { return 0; }
}

export default function ProductosPage() {
  return <Suspense><Productos /></Suspense>;
}

function Productos() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState("");
  const [onlyOferta, setOnlyOferta] = useState(false);
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    function handler(e: Event) { setToast((e as CustomEvent).detail); setTimeout(() => setToast(null), 1500); }
    window.addEventListener("reebok-toast", handler);
    return () => window.removeEventListener("reebok-toast", handler);
  }, []);

  // Load order state on mount
  useEffect(() => {
    const id = localStorage.getItem("reebok_active_order_id") || "";
    setOrderId(id);
    if (id) {
      setOrderCount(getOrderCount());
      // Also fetch from API to sync cache
      fetch(`/api/catalogo/reebok/orders/${id}`).then(r => r.ok ? r.json() : null).then(order => {
        if (order) {
          const items = order.reebok_order_items || [];
          localStorage.setItem("reebok_order_items", JSON.stringify(items));
          setOrderCount(items.reduce((s: number, i: { quantity: number }) => s + (i.quantity || 0), 0));
        }
      }).catch(() => {});
    }
  }, []);

  // Listen for order changes
  useEffect(() => {
    function handler() {
      setOrderId(localStorage.getItem("reebok_active_order_id") || "");
      setOrderCount(getOrderCount());
    }
    window.addEventListener("reebok-order-changed", handler);
    return () => window.removeEventListener("reebok-order-changed", handler);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [pRes, iRes] = await Promise.all([
          fetch("/api/catalogo/reebok/products?active=true"),
          fetch("/api/catalogo/reebok/inventory"),
        ]);
        if (pRes.ok) setProducts(await pRes.json());
        if (iRes.ok) {
          const inv = await iRes.json();
          const map: Record<string, number> = {};
          (inv || []).forEach((i: { product_id: string; quantity: number }) => {
            map[i.product_id] = (map[i.product_id] || 0) + i.quantity;
          });
          setInventoryMap(map);
        }
      } catch { /* */ }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => !gender || p.gender === gender)
    .filter(p => !category || p.category === category)
    .filter(p => !onlyOferta || p.on_sale)
    .sort((a, b) => (a.category === "footwear" ? 0 : 1) - (b.category === "footwear" ? 0 : 1));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-light">Catálogo Reebok</h1>
        <p className="text-sm text-gray-400">Panama</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Buscar..."
          className="border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition w-48" />
        <select value={gender} onChange={e => setGender(e.target.value)}
          className="border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition bg-transparent">
          <option value="">Todos</option>
          <option value="male">Hombre</option>
          <option value="female">Mujer</option>
          <option value="kids">Ninos</option>
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition bg-transparent">
          <option value="">Todas</option>
          <option value="footwear">Calzado</option>
          <option value="apparel">Ropa</option>
          <option value="accessories">Accesorios</option>
        </select>
        <button onClick={() => setOnlyOferta(!onlyOferta)}
          className={`text-xs px-3 py-1.5 rounded-full transition font-medium ${onlyOferta ? "bg-orange-500 text-white" : "border border-gray-200 text-gray-500 hover:border-gray-400"}`}>
          Oferta
        </button>
        {(searchInput || gender || category || onlyOferta) && (
          <button onClick={() => { setSearchInput(""); setSearch(""); setGender(""); setCategory(""); setOnlyOferta(false); }} className="text-xs text-gray-400 hover:text-black transition">Limpiar</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} productos</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="aspect-square bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-20 text-gray-400 text-sm">No se encontraron productos</p>
      ) : (
        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 ${orderCount > 0 ? "pb-24" : ""}`}>
          {filtered.map(p => <ProductCard key={p.id} product={p} stock={inventoryMap[p.id] || 0} />)}
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2 rounded-full text-sm z-50">{toast}</div>}

      {/* Floating order bar */}
      {orderCount > 0 && orderId && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-white border-t border-gray-100 shadow-lg">
          <button onClick={() => router.push(`/catalogo/reebok/pedido/${orderId}`)}
            className="w-full bg-black text-white py-3.5 rounded text-sm font-medium flex items-center justify-between px-4">
            <span>Ver pedido</span>
            <span>{orderCount} bulto{orderCount !== 1 ? "s" : ""} →</span>
          </button>
        </div>
      )}
    </div>
  );
}
