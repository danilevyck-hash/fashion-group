"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Product } from "@/components/reebok/supabase";
import ProductCard from "@/components/reebok/ProductCard";
import NewOrderModal from "@/components/reebok/NewOrderModal";
import { Toast } from "@/components/ui";

interface CartItem { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; }

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
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  // Cart lives ONLY in React state — ephemeral, not persisted
  const [cart, setCart] = useState<CartItem[]>([]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * 12 * Number(i.unit_price || 0), 0);

  const handleQtyChange = useCallback((productId: string, qty: number, product: Product) => {
    setCart(prev => {
      if (qty <= 0) return prev.filter(i => i.product_id !== productId);
      const idx = prev.findIndex(i => i.product_id === productId);
      if (idx >= 0) return prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item);
      return [...prev, { product_id: productId, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: qty, unit_price: product.price || 0 }];
    });
  }, []);

  // Scroll to top button
  useEffect(() => {
    function onScroll() { setShowScrollTop(window.scrollY > 400); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [gender, category, onlyOferta, priceFilter]);

  // Load products
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
        const stockMap: Record<string, number> = {};
        inv.forEach(i => { stockMap[i.product_id] = (stockMap[i.product_id] || 0) + i.quantity });
        setProducts(prods.map(p => ({ ...p, _stock: stockMap[p.id] || 0 })));
      } catch { setProducts([]); }
      setLoading(false);
    }
    load();
  }, []);

  // Unique prices for on-sale filter
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Cart lookup
  const cartMap = new Map(cart.map(i => [i.product_id, i.quantity]));

  // Group by category + gender
  type Group = { cat: string; gen: string; label: string; items: typeof filtered };
  const groups: Group[] = [];
  let lastKey = '';
  for (const p of paginated) {
    const key = `${p.category}|${p.gender || 'unisex'}`;
    if (key !== lastKey) {
      groups.push({ cat: p.category, gen: p.gender || 'unisex', label: `${catLabel[p.category] || p.category} — ${genLabel[p.gender || 'unisex'] || p.gender}`, items: [] });
      lastKey = key;
    }
    groups[groups.length - 1].items.push(p);
  }

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-light">Catálogo Reebok</h1>
        <p className="text-sm text-gray-400">Panamá</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">Buscar</label>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Nombre o SKU"
            className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition w-44" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">Género</label>
          <select value={gender} onChange={e => setGender(e.target.value)}
            className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
            <option value="">Todos</option><option value="male">Hombre</option><option value="female">Mujer</option><option value="kids">Niños</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">Categoría</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
            <option value="">Todas</option><option value="footwear">Calzado</option><option value="apparel">Ropa</option><option value="accessories">Accesorios</option>
          </select>
        </div>
        <button onClick={() => { setOnlyOferta(!onlyOferta); setPriceFilter(""); }}
          className={`text-sm px-4 py-2 rounded-full transition font-medium mb-0.5 ${onlyOferta ? "bg-orange-500 text-white" : "border border-gray-200 text-gray-500 hover:border-gray-400"}`}>
          Oferta
        </button>
        {onlyOferta && ofertaPrices.length > 1 && (
          <div>
            <label className="text-[10px] text-orange-400 uppercase tracking-wider">Precio</label>
            <select value={priceFilter} onChange={e => setPriceFilter(e.target.value)}
              className="block border-b border-orange-300 py-2 text-sm outline-none focus:border-orange-500 transition bg-transparent text-orange-700">
              <option value="">Todos</option>
              {ofertaPrices.map(p => <option key={p} value={p}>${p.toFixed(0)}</option>)}
            </select>
          </div>
        )}
        {(searchInput || gender || category || onlyOferta) && (
          <button onClick={() => { setSearchInput(""); setSearch(""); setGender(""); setCategory(""); setOnlyOferta(false); setPriceFilter(""); }} className="text-sm text-gray-400 hover:text-black transition py-2 mb-0.5">Limpiar</button>
        )}
        <span className="text-xs text-gray-400 ml-auto mb-1">{filtered.length}</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="bg-white overflow-hidden">
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
        <div className={`space-y-8 fade-in ${cartCount > 0 ? "pb-24" : ""}`}>
          {groups.map(g => (
            <div key={g.label}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-medium text-gray-800">{g.label}</h2>
                <div className="flex-1 border-t border-gray-100" />
                <span className="text-xs text-gray-300">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {g.items.map(p => (
                  <ProductCard key={p.id} product={p} stock={p._stock} qty={cartMap.get(p.id) || 0} onQtyChange={handleQtyChange} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8 mb-4">
          <button onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={page === 1}
            className="text-sm border border-gray-200 px-4 py-2 rounded-full hover:border-gray-400 transition disabled:opacity-30 disabled:cursor-not-allowed">← Anterior</button>
          <span className="text-xs text-gray-400">Página {page} de {totalPages}</span>
          <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={page === totalPages}
            className="text-sm border border-gray-200 px-4 py-2 rounded-full hover:border-gray-400 transition disabled:opacity-30 disabled:cursor-not-allowed">Siguiente →</button>
        </div>
      )}

      <Toast message={toast} />

      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-20 right-4 z-30 w-10 h-10 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-400 hover:text-black transition">↑</button>
      )}

      {/* Floating bar — only when cart has items */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white border-t border-gray-100 shadow-lg">
          <button onClick={() => setShowNewOrder(true)}
            className="w-full bg-emerald-600 text-white py-3.5 rounded-lg text-sm font-medium flex items-center justify-between px-4 hover:bg-emerald-700 transition">
            <span>Crear pedido</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{cartCount} bulto{cartCount !== 1 ? "s" : ""}</span>
              {cartTotal > 0 && <><span className="text-white/40">·</span><span className="tabular-nums font-semibold">${fmt(cartTotal)}</span></>}
              <span>→</span>
            </span>
          </button>
        </div>
      )}

      {showNewOrder && (
        <NewOrderModal
          items={cart}
          onClose={() => setShowNewOrder(false)}
          onCreated={(id) => {
            setShowNewOrder(false);
            setCart([]);
            router.push(`/catalogo/reebok/pedido/${id}`);
          }}
        />
      )}
    </div>
  );
}
