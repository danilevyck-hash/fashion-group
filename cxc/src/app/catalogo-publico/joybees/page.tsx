"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { JoybeesProduct } from "@/components/joybees/JoybeesProductCard";
import { Toast } from "@/components/ui";
import JoybeesHeader from "@/components/joybees/JoybeesHeader";
import JoybeesFilters from "@/components/joybees/JoybeesFilters";
import JoybeesProductCard from "@/components/joybees/JoybeesProductCard";
import JoybeesStickyCartBar from "@/components/joybees/JoybeesStickyCartBar";

const BULTO_SIZE = 12;

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
}

export default function PublicJoybeesCatalogPage() {
  return <Suspense><PublicJoybeesCatalog /></Suspense>;
}

function PublicJoybeesCatalog() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<JoybeesProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [sortBy, setSortBy] = useState("relevancia");
  const [toast, setToast] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * BULTO_SIZE * Number(i.unit_price || 0), 0);

  const cartInitialized = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("joybees_public_cart");
      if (saved) setCart(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    try { localStorage.setItem("joybees_public_cart", JSON.stringify(cart)); } catch { /* */ }
  }, [cart]);

  const handleQtyChange = useCallback((productId: string, qty: number, product: JoybeesProduct) => {
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
      }];
    });
  }, []);

  // Scroll
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

  useEffect(() => { setPage(1); }, [gender, category, sortBy]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (gender) params.set("gender", gender);
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [gender, category, search]);

  // Load products
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/catalogo/joybees/public");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const prods: JoybeesProduct[] = data.products || [];
        setProducts(prods.filter(p => p.stock > 0 || p.is_regalia));
      } catch {
        setProducts([]);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Derived
  const CATEGORY_LABELS: Record<string, string> = {
    active_clog: "Active Clog", casual_flip: "Casual Flip", varsity_clog: "Varsity Clog",
    trekking_slide: "Trekking Slide", trekking_shoe: "Trekking Shoe", work_clog: "Work Clog",
    friday_flat: "Friday Flat", garden_grove_clog: "Garden Grove", lakeshore_sandal: "Lakeshore",
    riviera_sandal: "Riviera", everyday_sandal: "Everyday Sandal", varsity_flip: "Varsity Flip",
    studio_clog: "Studio Clog", popinz: "Popinz",
  };
  const GENDER_LABELS: Record<string, string> = {
    adults_m: "Adults", women: "Women", kids: "Kids", junior: "Junior",
  };

  const filtered = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
    .filter(p => !gender || p.gender === gender)
    .filter(p => !category || p.category === category)
    .sort((a, b) => {
      if (sortBy === "precio-asc") return (a.price || 0) - (b.price || 0);
      if (sortBy === "precio-desc") return (b.price || 0) - (a.price || 0);
      if (sortBy === "nombre-az") return a.name.localeCompare(b.name);
      const ca = a.category.localeCompare(b.category);
      if (ca !== 0) return ca;
      const ga = a.gender.localeCompare(b.gender);
      if (ga !== 0) return ga;
      return a.name.localeCompare(b.name);
    });

  const isGrouped = sortBy === "relevancia";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const cartMap = new Map(cart.map(i => [i.product_id, i.quantity]));

  type Group = { label: string; items: JoybeesProduct[] };
  const groups: Group[] = [];
  let lastKey = "";
  for (const p of paginated) {
    const key = `${p.category}|${p.gender}`;
    if (key !== lastKey) {
      groups.push({
        label: `${CATEGORY_LABELS[p.category] || p.category} — ${GENDER_LABELS[p.gender] || p.gender}`,
        items: [],
      });
      lastKey = key;
    }
    groups[groups.length - 1].items.push(p);
  }

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function handleClearAll() {
    setSearchInput(""); setSearch(""); setGender(""); setCategory(""); setSortBy("relevancia");
  }

  function handleClearCart() {
    setCart([]);
    try { localStorage.removeItem("joybees_public_cart"); } catch { /* */ }
  }

  const [sendingOrder, setSendingOrder] = useState(false);

  async function handleSendWhatsApp() {
    if (cart.length === 0 || sendingOrder) return;
    setSendingOrder(true);
    try {
      const total = cart.reduce((s, i) => s + i.quantity * BULTO_SIZE * i.unit_price, 0);
      const itemLines = cart.map(i => {
        return `${i.name} (${i.sku}) x${i.quantity} bulto${i.quantity !== 1 ? "s" : ""} (${i.quantity * BULTO_SIZE} pzas) — $${(i.quantity * BULTO_SIZE * i.unit_price).toFixed(2)}`;
      }).join("\n");
      const msg = `Hola, quiero hacer un pedido de Joybees:\n\n${itemLines}\n\nTotal: $${total.toFixed(2)}`;
      const url = `https://wa.me/50766745522?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");

      setCart([]);
      try { localStorage.removeItem("joybees_public_cart"); } catch { /* */ }
      setToast("Pedido enviado");
    } catch {
      setToast("Error al enviar el pedido. Intenta de nuevo.");
    } finally {
      setSendingOrder(false);
    }
  }

  // Skeleton
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

  const emptyState = (
    <div className="text-center py-20">
      <div className="w-16 h-16 rounded-full bg-[#FFE443]/20 flex items-center justify-center mx-auto mb-4 text-2xl">
        🐝
      </div>
      <p className="text-[#404041]/40 text-sm font-medium">No encontramos productos con estos filtros</p>
      <button onClick={handleClearAll} className="mt-3 text-sm text-[#404041] hover:text-black font-medium transition">
        Limpiar filtros
      </button>
    </div>
  );

  const productGrid = (
    <div className={`${cartCount > 0 ? "pb-28" : ""}`}>
      {isGrouped ? (
        <div className="space-y-8">
          {groups.map(g => (
            <div key={g.label}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#404041]">
                  {g.label}
                </h2>
                <div className="flex-1 h-px bg-[#404041]/10" />
                <span className="text-[11px] text-[#404041]/25 tabular-nums">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {g.items.map(p => (
                  <JoybeesProductCard
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
            <JoybeesProductCard
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
    <div className="min-h-screen bg-[#FFFEF5]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <JoybeesHeader variant="public" />

        <JoybeesFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          gender={gender}
          onGenderChange={setGender}
          category={category}
          onCategoryChange={setCategory}
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
              className="text-xs font-semibold uppercase tracking-wider text-[#404041] px-4 py-2.5 rounded-lg border border-[#404041]/15 hover:border-[#404041]/30 transition disabled:opacity-25 disabled:cursor-not-allowed min-h-[44px]"
            >
              &larr; Anterior
            </button>
            <span className="text-xs text-[#404041]/35 tabular-nums font-medium">{page} / {totalPages}</span>
            <button
              onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === totalPages}
              className="text-xs font-semibold uppercase tracking-wider text-[#404041] px-4 py-2.5 rounded-lg border border-[#404041]/15 hover:border-[#404041]/30 transition disabled:opacity-25 disabled:cursor-not-allowed min-h-[44px]"
            >
              Siguiente &rarr;
            </button>
          </div>
        )}

        <Toast message={toast} />

        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-24 right-4 z-30 w-10 h-10 bg-white border border-[#404041]/10 rounded-full shadow-md flex items-center justify-center text-[#404041]/40 hover:text-[#404041] transition min-w-[44px] min-h-[44px]"
          >
            &uarr;
          </button>
        )}

        <JoybeesStickyCartBar
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
