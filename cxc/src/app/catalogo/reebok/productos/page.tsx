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
  const [products, setProducts] = useState<(Product & { _stock: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState("");
  const [onlyOferta, setOnlyOferta] = useState(false);
  const [priceFilter, setPriceFilter] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderId, setOrderId] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);

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
      try {
        const items = JSON.parse(localStorage.getItem("reebok_order_items") || "[]");
        setOrderTotal(items.reduce((s: number, i: { quantity: number; unit_price: number }) => s + (i.quantity || 0) * 12 * Number(i.unit_price || 0), 0));
      } catch { setOrderTotal(0); }
    }
    window.addEventListener("reebok-order-changed", handler);
    handler();
    return () => window.removeEventListener("reebok-order-changed", handler);
  }, []);

  // #12: Scroll to top button
  useEffect(() => {
    function onScroll() { setShowScrollTop(window.scrollY > 400); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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

        const prods: Product[] = pRes.ok ? await pRes.json() : [];
        const inv: { product_id: string; quantity: number }[] = iRes.ok ? await iRes.json() : [];

        // Build stock map
        const stockMap: Record<string, number> = {};
        inv.forEach(i => { stockMap[i.product_id] = (stockMap[i.product_id] || 0) + i.quantity });

        // Embed stock into each product — single state, no sync issues
        setProducts(prods.map(p => ({ ...p, _stock: stockMap[p.id] || 0 })));
      } catch { setProducts([]); }
      setLoading(false);
    }
    load();
  }, []);

  // Unique prices for on-sale products
  const ofertaPrices = onlyOferta
    ? [...new Set(products.filter(p => p.on_sale && p.price).map(p => p.price!))].sort((a, b) => a - b)
    : [];

  const catOrder: Record<string, number> = { footwear: 0, apparel: 1, accessories: 2 };
  const genOrder: Record<string, number> = { male: 0, female: 1, kids: 2, unisex: 3 };
  const catLabel: Record<string, string> = { footwear: 'Calzado', apparel: 'Ropa', accessories: 'Accesorios' };
  const genLabel: Record<string, string> = { male: 'Hombre', female: 'Mujer', kids: 'Niños', unisex: 'Unisex' };

  const filtered = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => !gender || p.gender === gender)
    .filter(p => !category || p.category === category)
    .filter(p => !onlyOferta || p.on_sale)
    .filter(p => !priceFilter || p.price === Number(priceFilter))
    .sort((a, b) => {
      const ca = catOrder[a.category] ?? 9, cb = catOrder[b.category] ?? 9;
      if (ca !== cb) return ca - cb;
      const ga = genOrder[a.gender || 'unisex'] ?? 9, gb = genOrder[b.gender || 'unisex'] ?? 9;
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });

  // Frequent products — products currently in the active order (shown at top when no filters)
  const noFiltersActive = !search && !gender && !category && !onlyOferta;
  const inOrderIds = new Set<string>();
  try {
    const cached = JSON.parse(localStorage.getItem("reebok_order_items") || "[]");
    cached.forEach((i: { product_id: string }) => inOrderIds.add(i.product_id));
  } catch { /* */ }
  const frequentProducts = noFiltersActive && inOrderIds.size > 0
    ? filtered.filter(p => inOrderIds.has(p.id))
    : [];

  // Group products by category + gender for section headers
  type Group = { cat: string; gen: string; label: string; items: typeof filtered };
  const groups: Group[] = [];
  let lastKey = '';
  for (const p of filtered) {
    const key = `${p.category}|${p.gender || 'unisex'}`;
    if (key !== lastKey) {
      groups.push({ cat: p.category, gen: p.gender || 'unisex', label: `${catLabel[p.category] || p.category} — ${genLabel[p.gender || 'unisex'] || p.gender}`, items: [] });
      lastKey = key;
    }
    groups[groups.length - 1].items.push(p);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-light">Catálogo Reebok</h1>
        <p className="text-sm text-gray-400">Panamá</p>
      </div>

      {/* #5: Touch-friendly filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Buscar..." aria-label="Buscar productos"
          className="border-b border-gray-200 py-2.5 text-sm outline-none focus:border-black transition w-48" />
        <select value={gender} onChange={e => setGender(e.target.value)}
          className="border-b border-gray-200 py-2.5 text-sm outline-none focus:border-black transition bg-transparent">
          <option value="">Todos</option>
          <option value="male">Hombre</option>
          <option value="female">Mujer</option>
          <option value="kids">Niños</option>
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="border-b border-gray-200 py-2.5 text-sm outline-none focus:border-black transition bg-transparent">
          <option value="">Todas</option>
          <option value="footwear">Calzado</option>
          <option value="apparel">Ropa</option>
          <option value="accessories">Accesorios</option>
        </select>
        <button onClick={() => { setOnlyOferta(!onlyOferta); setPriceFilter(""); }}
          className={`text-sm px-4 py-2 rounded-full transition font-medium ${onlyOferta ? "bg-orange-500 text-white" : "border border-gray-200 text-gray-500 hover:border-gray-400"}`}>
          Oferta
        </button>
        {onlyOferta && ofertaPrices.length > 1 && (
          <select value={priceFilter} onChange={e => setPriceFilter(e.target.value)}
            className="border-b border-orange-300 py-2.5 text-sm outline-none focus:border-orange-500 transition bg-transparent text-orange-700">
            <option value="">Todos los precios</option>
            {ofertaPrices.map(p => <option key={p} value={p}>${p.toFixed(0)}</option>)}
          </select>
        )}
        {(searchInput || gender || category || onlyOferta) && (
          <button onClick={() => { setSearchInput(""); setSearch(""); setGender(""); setCategory(""); setOnlyOferta(false); setPriceFilter(""); }} className="text-sm text-gray-400 hover:text-black transition py-2">Limpiar</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length}</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="bg-white overflow-hidden" style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}>
              <div className="aspect-square shimmer" />
              <div className="p-3 space-y-2.5">
                <div className="h-3.5 shimmer" style={{ width: "70%" }} />
                <div className="h-3 shimmer" style={{ width: "45%" }} />
                <div className="h-5 shimmer w-16 mt-1.5" />
                <div className="h-10 shimmer w-full mt-2 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-20 text-gray-400 text-sm">No se encontraron productos</p>
      ) : (
        <div className={`space-y-8 fade-in ${orderCount > 0 ? "pb-24" : ""}`}>
          {frequentProducts.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-medium text-green-700">En este pedido</h2>
                <div className="flex-1 border-t border-green-100" />
                <span className="text-xs text-green-400">{frequentProducts.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {frequentProducts.map(p => <ProductCard key={`fav-${p.id}`} product={p} stock={p._stock} />)}
              </div>
            </div>
          )}
          {groups.map(g => (
            <div key={g.label}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-medium text-gray-800">{g.label}</h2>
                <div className="flex-1 border-t border-gray-100" />
                <span className="text-xs text-gray-300">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {g.items.map(p => <ProductCard key={p.id} product={p} stock={p._stock} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2 rounded-full text-sm z-50">{toast}</div>}

      {/* #12: Scroll to top */}
      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-20 right-4 z-30 w-10 h-10 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-400 hover:text-black transition">
          ↑
        </button>
      )}

      {/* #3: Floating order bar with $ total */}
      {orderCount > 0 && orderId && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white border-t border-gray-100 shadow-lg">
          <button onClick={() => router.push(`/catalogo/reebok/pedido/${orderId}`)}
            className="w-full bg-black text-white py-3.5 rounded-lg text-sm font-medium flex items-center justify-between px-4">
            <span>Ver pedido</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{orderCount} bulto{orderCount !== 1 ? "s" : ""}</span>
              {orderTotal > 0 && <><span className="text-white/40">·</span><span className="tabular-nums font-semibold">${orderTotal.toLocaleString()}</span></>}
              <span>→</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
