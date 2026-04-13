"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { JoybeesProduct } from "@/components/joybees/JoybeesProductCard";
import { Toast } from "@/components/ui";
import JoybeesHeader from "@/components/joybees/JoybeesHeader";
import JoybeesFilters from "@/components/joybees/JoybeesFilters";
import JoybeesGroupedCard from "@/components/joybees/JoybeesGroupedCard";
import JoybeesStickyCartBar from "@/components/joybees/JoybeesStickyCartBar";
import { groupByModel, getDisplaySection, DisplaySection, SECTION_ORDER, SECTION_LABELS, GroupedProduct } from "@/components/joybees/groupByModel";

const BULTO_SIZE = 12;

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
}

export default function JoybeesCatalogPage() {
  return <Suspense><JoybeesCatalog /></Suspense>;
}

function JoybeesCatalog() {
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

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * BULTO_SIZE * Number(i.unit_price || 0), 0);

  const cartInitialized = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("joybees_cart");
      if (saved) setCart(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    try { localStorage.setItem("joybees_cart", JSON.stringify(cart)); } catch { /* */ }
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
    const t = setTimeout(() => { setSearch(searchInput); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

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
        const res = await fetch("/api/catalogo/joybees/products?active=true");
        if (!res.ok) throw new Error("fetch failed");
        const data: JoybeesProduct[] = await res.json();
        setProducts(data.filter(p => p.stock > 0 || p.is_regalia));
      } catch {
        setProducts([]);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Share
  const [showShareMenu, setShowShareMenu] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    }
    if (showShareMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showShareMenu]);

  function handleCopyLink() {
    const params = new URLSearchParams();
    if (gender) params.set("gender", gender);
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    const qs = params.toString();
    const url = `https://www.fashiongr.com/catalogo-publico/joybees${qs ? `?${qs}` : ""}`;
    navigator.clipboard.writeText(url).then(() => {
      setToast("Link copiado");
    }).catch(() => {
      setToast("No se pudo copiar el link");
    });
    setShowShareMenu(false);
  }

  // Derived: group by model first, then assign display sections
  const allGrouped = groupByModel(
    products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
      .filter(p => !category || p.category === category)
  );

  // Assign display section to each group
  const groupsWithSection = allGrouped.map(g => ({
    group: g,
    section: getDisplaySection(g),
  }));

  // Filter by selected gender (which is now a display section value)
  const filteredGroups = groupsWithSection.filter(gs => !gender || gs.section === gender);

  // Sort groups
  const sortedGroups = [...filteredGroups].sort((a, b) => {
    if (sortBy === "precio-asc") return (a.group.price || 0) - (b.group.price || 0);
    if (sortBy === "precio-desc") return (b.group.price || 0) - (a.group.price || 0);
    if (sortBy === "nombre-az") return a.group.name.localeCompare(b.group.name);
    // Default: section order, then name
    const sa = (SECTION_ORDER[a.section] ?? 99) - (SECTION_ORDER[b.section] ?? 99);
    if (sa !== 0) return sa;
    return a.group.name.localeCompare(b.group.name);
  });

  const isGrouped = sortBy === "relevancia";
  const cartMap = new Map(cart.map(i => [i.product_id, i.quantity]));

  // Build sections for grouped display
  type SectionGroup = { label: string; section: DisplaySection; items: GroupedProduct[] };
  const sections: SectionGroup[] = [];
  if (isGrouped) {
    for (const gs of sortedGroups) {
      const last = sections[sections.length - 1];
      if (last && last.section === gs.section) {
        last.items.push(gs.group);
      } else {
        sections.push({
          label: SECTION_LABELS[gs.section],
          section: gs.section,
          items: [gs.group],
        });
      }
    }
  }

  // Flat count for display
  const filteredCount = sortedGroups.length;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function handleClearAll() {
    setSearchInput(""); setSearch(""); setGender(""); setCategory(""); setSortBy("relevancia");
  }

  function handleClearCart() {
    setCart([]);
    try { localStorage.removeItem("joybees_cart"); } catch { /* */ }
  }

  // WhatsApp
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
      try { localStorage.removeItem("joybees_cart"); } catch { /* */ }
      setToast("Pedido enviado por WhatsApp");
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
          {sections.map(s => (
            <div key={s.section}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#404041]">
                  {s.label}
                </h2>
                <div className="flex-1 h-px bg-[#404041]/10" />
                <span className="text-[11px] text-[#404041]/25 tabular-nums">{s.items.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {s.items.map(g => (
                  <JoybeesGroupedCard
                    key={g.baseSku}
                    group={g}
                    cartMap={cartMap}
                    onQtyChange={handleQtyChange}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {sortedGroups.map(gs => (
            <JoybeesGroupedCard
              key={gs.group.baseSku}
              group={gs.group}
              cartMap={cartMap}
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
        {/* Header + Share */}
        <div className="flex items-start justify-between">
          <JoybeesHeader variant="vendor" />
          <div className="relative" ref={shareRef}>
            <button
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="flex items-center gap-1.5 text-xs text-[#404041]/50 hover:text-[#404041] transition px-3 py-2 rounded-lg border border-[#404041]/10 hover:border-[#404041]/20"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Compartir
            </button>
            {showShareMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-48 z-50">
                <button onClick={handleCopyLink} className="w-full text-left px-4 py-2.5 text-sm text-[#404041] hover:bg-gray-50 transition flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  Copiar link publico
                </button>
              </div>
            )}
          </div>
        </div>

        <JoybeesFilters
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          gender={gender}
          onGenderChange={setGender}
          category={category}
          onCategoryChange={setCategory}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          filteredCount={filteredCount}
          onClearAll={handleClearAll}
        />

        {loading ? skeletonGrid : filteredCount === 0 ? emptyState : productGrid}

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
          variant="vendor"
          onSendWhatsApp={handleSendWhatsApp}
          saving={sendingOrder}
          actionLabel={sendingOrder ? "Enviando..." : "Enviar por WhatsApp"}
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
