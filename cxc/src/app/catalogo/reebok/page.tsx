"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Product } from "@/components/reebok/supabase";
import ProductCard from "@/components/reebok/ProductCard";

export default function HomePage() {
  return <Suspense><Home /></Suspense>;
}

function Home() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState("");
  const [onlyOferta, setOnlyOferta] = useState(false);
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: Event) { setToast((e as CustomEvent).detail); setTimeout(() => setToast(null), 1500); }
    window.addEventListener("reebok-toast", handler);
    return () => window.removeEventListener("reebok-toast", handler);
  }, []);

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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
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
        {(search || gender || category || onlyOferta) && (
          <button onClick={() => { setSearch(""); setGender(""); setCategory(""); setOnlyOferta(false); }} className="text-xs text-gray-400 hover:text-black transition">Limpiar</button>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(p => <ProductCard key={p.id} product={p} stock={inventoryMap[p.id] || 0} />)}
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2 rounded-full text-sm z-50">{toast}</div>}
    </div>
  );
}
