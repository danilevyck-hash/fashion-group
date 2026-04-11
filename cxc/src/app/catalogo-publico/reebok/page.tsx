"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { Product } from "@/components/reebok/supabase";
import { getBultoSize } from "@/lib/reebok-bulto";
import { Toast } from "@/components/ui";
import CatalogHeader from "@/components/reebok/CatalogHeader";
import CatalogFilters from "@/components/reebok/CatalogFilters";
import CatalogProductCard from "@/components/reebok/CatalogProductCard";
import StickyCartBar from "@/components/reebok/StickyCartBar";

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  category: string;
}

export default function PublicCatalogPage() {
  return <Suspense><PublicCatalog /></Suspense>;
}

function PublicCatalog() {
  const [products, setProducts] = useState<(Product & { _stock: number; _sizes: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("");
  const [category, setCategory] = useState("");
  const [saleFilter, setSaleFilter] = useState<"" | "oferta" | "nuevo">("");
  // color/size/price filters removed — kept simple
  const [sortBy, setSortBy] = useState("relevancia");
  const [toast, setToast] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * getBultoSize(i.category) * Number(i.unit_price || 0), 0);

  // Persist cart to localStorage
  const cartInitialized = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("reebok_public_cart");
      if (saved) setCart(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    try { localStorage.setItem("reebok_public_cart", JSON.stringify(cart)); } catch { /* */ }
  }, [cart]);

  const handleQtyChange = useCallback((productId: string, qty: number, product: Product) => {
    setCart(prev => {
      if (qty <= 0) return prev.filter(i => i.product_id !== productId);
      const idx = prev.findIndex(i => i.product_id === productId);
      if (idx >= 0) return prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item);
      return [...prev, {
        product_id: productId,
        sku: product.sku || "",
        name: product.name,
        image_url: product.image_url || "",
        quantity: qty,
        unit_price: product.price || 0,
        category: product.category,
      }];
    });
  }, []);

  // Scroll listener
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

  useEffect(() => { setPage(1); }, [gender, category, saleFilter, sortBy]);

  // Load products
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/catalogo/reebok/public");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const prods: Product[] = data.products || [];
        const inv: { product_id: string; size: string; quantity: number }[] = data.inventory || [];
        const stockMap: Record<string, number> = {};
        const sizesMap: Record<string, Set<string>> = {};
        inv.forEach(i => {
          stockMap[i.product_id] = (stockMap[i.product_id] || 0) + i.quantity;
          if (i.quantity > 0 && i.size) {
            if (!sizesMap[i.product_id]) sizesMap[i.product_id] = new Set();
            sizesMap[i.product_id].add(i.size);
          }
        });
        setProducts(
          prods
            .map(p => ({ ...p, _stock: stockMap[p.id] || 0, _sizes: [...(sizesMap[p.id] || [])] }))
            .filter(p => p._stock > 0)
        );
      } catch {
        setProducts([]);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Derived state
  const catOrder: Record<string, number> = { footwear: 0, apparel: 1, accessories: 2 };
  const genOrder: Record<string, number> = { male: 0, female: 1, kids: 2, unisex: 3 };
  const catLabel: Record<string, string> = { footwear: "Calzado", apparel: "Ropa", accessories: "Accesorios" };
  const genLabel: Record<string, string> = { male: "Hombre", female: "Mujer", kids: "Ninos", unisex: "Unisex" };

  const filtered = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()) || (p.color || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => !gender || p.gender === gender)
    .filter(p => !category || p.category === category)
    .filter(p => !saleFilter || (saleFilter === "oferta" ? p.on_sale : !p.on_sale))
    .sort((a, b) => {
      if (sortBy === "precio-asc") return (a.price || 0) - (b.price || 0);
      if (sortBy === "precio-desc") return (b.price || 0) - (a.price || 0);
      if (sortBy === "nombre-az") return a.name.localeCompare(b.name);
      const ca = catOrder[a.category] ?? 9, cb = catOrder[b.category] ?? 9;
      if (ca !== cb) return ca - cb;
      const ga = genOrder[a.gender || "unisex"] ?? 9, gb = genOrder[b.gender || "unisex"] ?? 9;
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });

  const isGrouped = sortBy === "relevancia";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const cartMap = new Map(cart.map(i => [i.product_id, i.quantity]));

  type Group = { label: string; items: typeof filtered };
  const groups: Group[] = [];
  let lastKey = "";
  for (const p of paginated) {
    const key = `${p.category}|${p.gender || "unisex"}`;
    if (key !== lastKey) {
      groups.push({ label: `${catLabel[p.category] || p.category} — ${genLabel[p.gender || "unisex"] || p.gender}`, items: [] });
      lastKey = key;
    }
    groups[groups.length - 1].items.push(p);
  }

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function handleClearAll() {
    setSearchInput(""); setSearch(""); setGender(""); setCategory("");
    setSaleFilter(""); setSortBy("relevancia");
  }

  const [sendingOrder, setSendingOrder] = useState(false);

  // WhatsApp send with shareable link
  async function handleSendWhatsApp() {
    if (cart.length === 0 || sendingOrder) return;
    setSendingOrder(true);
    try {
      const res = await fetch("/api/catalogo/reebok/pedido-publico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart }),
      });
      if (!res.ok) throw new Error("save failed");
      const { short_id } = await res.json();

      const total = cart.reduce((s, i) => s + i.quantity * getBultoSize(i.category) * i.unit_price, 0);
      const itemLines = cart.map(i => {
        const bs = getBultoSize(i.category);
        return `${i.name} x${i.quantity} bulto${i.quantity !== 1 ? "s" : ""} (${i.quantity * bs} pzas) — $${(i.quantity * bs * i.unit_price).toFixed(2)}`;
      }).join("\n");
      const link = `https://www.fashiongr.com/pedido-reebok/${short_id}`;
      const msg = `Hola, quiero hacer un pedido de Reebok:\n\n${itemLines}\n\nTotal: $${total.toFixed(2)}\n\n${link}`;
      const url = `https://wa.me/50766745522?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");

      setCart([]);
      try { localStorage.removeItem("reebok_public_cart"); } catch { /* */ }
      setToast("Pedido enviado");
    } catch {
      setToast("Error al enviar el pedido. Intenta de nuevo.");
    } finally {
      setSendingOrder(false);
    }
  }

  function handleClearCart() {
    setCart([]);
    try { localStorage.removeItem("reebok_public_cart"); } catch { /* */ }
  }

  // Skeleton loading
  const skeletonGrid = (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {[...Array(12)].map((_, i) => (
        <div key={i} className="bg-white overflow-hidden rounded-xl">
          <div className="aspect-square shimmer" />
          <div className="p-3 space-y-2.5">
            <div className="h-4 shimmer rounded" style={{ width: "75%" }} />
            <div className="h-3 shimmer rounded" style={{ width: "40%" }} />
            <div className="h-3 shimmer rounded" style={{ width: "55%" }} />
            <div className="h-6 shimmer w-20 mt-1.5 rounded" />
            <div className="h-11 shimmer w-full mt-2 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );

  // Empty state
  const emptyState = (
    <div className="text-center py-20">
      <div className="w-16 h-16 rounded-full bg-[#1A2656]/5 flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-[#1A2656]/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p className="text-[#1A2656]/40 text-sm font-medium">No encontramos productos con estos filtros</p>
      <button
        onClick={handleClearAll}
        className="mt-3 text-sm text-[#E4002B] hover:text-[#c90025] font-medium transition"
      >
        Limpiar filtros
      </button>
    </div>
  );

  // Product grid
  const productGrid = (
    <div className={`${cartCount > 0 ? "pb-28" : ""}`}>
      {isGrouped ? (
        <div className="space-y-8">
          {groups.map(g => (
            <div key={g.label}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A2656]">
                  {g.label}
                </h2>
                <div className="flex-1 h-px bg-[#1A2656]/10" />
                <span className="text-[11px] text-[#1A2656]/25 tabular-nums">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {g.items.map(p => (
                  <CatalogProductCard
                    key={p.id}
                    product={p}
                    qty={cartMap.get(p.id) || 0}
                    onQtyChange={handleQtyChange}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {paginated.map(p => (
            <CatalogProductCard
              key={p.id}
              product={p}
              qty={cartMap.get(p.id) || 0}
              onQtyChange={handleQtyChange}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <CatalogHeader variant="public" />

        <CatalogFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          gender={gender}
          onGenderChange={setGender}
          category={category}
          onCategoryChange={setCategory}
          saleFilter={saleFilter}
          onSaleFilterChange={setSaleFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          filteredCount={filtered.length}
          onClearAll={handleClearAll}
        />

        {loading ? skeletonGrid : filtered.length === 0 ? emptyState : productGrid}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8 mb-4">
            <button
              onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === 1}
              className="text-xs font-semibold uppercase tracking-wider text-[#1A2656] px-4 py-2.5 rounded-lg border border-[#1A2656]/15 hover:border-[#1A2656]/30 transition disabled:opacity-25 disabled:cursor-not-allowed min-h-[44px]"
            >
              &larr; Anterior
            </button>
            <span className="text-xs text-[#1A2656]/35 tabular-nums font-medium">{page} / {totalPages}</span>
            <button
              onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === totalPages}
              className="text-xs font-semibold uppercase tracking-wider text-[#1A2656] px-4 py-2.5 rounded-lg border border-[#1A2656]/15 hover:border-[#1A2656]/30 transition disabled:opacity-25 disabled:cursor-not-allowed min-h-[44px]"
            >
              Siguiente &rarr;
            </button>
          </div>
        )}

        <Toast message={toast} />

        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-24 right-4 z-30 w-10 h-10 bg-white border border-[#1A2656]/10 rounded-full shadow-md flex items-center justify-center text-[#1A2656]/40 hover:text-[#1A2656] transition min-w-[44px] min-h-[44px]"
          >
            &uarr;
          </button>
        )}

        <StickyCartBar
          cart={cart}
          cartCount={cartCount}
          cartTotal={cartTotal}
          onQtyChange={handleQtyChange}
          onClearCart={handleClearCart}
          variant="public"
          onSendWhatsApp={handleSendWhatsApp}
          saving={sendingOrder}
          actionLabel={sendingOrder ? "Enviando..." : undefined}
          formatTotal={fmt}
        />
      </div>

      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes checkFade {
          0% { opacity: 0; transform: scale(0.5); }
          40% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
