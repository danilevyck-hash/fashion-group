"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Product } from "@/components/reebok/supabase";
import { getBultoSize } from "@/lib/reebok-bulto";
import { matchesGenderFilter, genderGroupKey, genderGroupLabel, genderGroupOrder, genderFilterLabel } from "@/lib/reebok-gender";
import { Toast } from "@/components/ui";
import CatalogHeader from "@/components/reebok/CatalogHeader";
import CatalogoSyncNow from "@/components/shared/CatalogoSyncNow";
import CatalogFilters, { SaleFilter } from "@/components/reebok/CatalogFilters";
import CatalogProductCard from "@/components/reebok/CatalogProductCard";
import StickyCartBar from "@/components/reebok/StickyCartBar";

interface CartItem { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; category: string; is_preorder?: boolean; }

export default function ProductosPage() {
  return <Suspense><Productos /></Suspense>;
}

function Productos() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<(Product & { _stock: number; _sizes: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("");
  // color/size/price filters removed — kept simple
  const [sortBy, setSortBy] = useState("relevancia");
  const [toast, setToast] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // ── State: cart + draft context ──
  const [cart, setCart] = useState<CartItem[]>([]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * getBultoSize(i.category) * Number(i.unit_price || 0), 0);

  // ── On mount: hidratar el carrito (session → localStorage). El cliente y el
  // pedido nacen en el CHECKOUT (rediseño 5-jul) — ya no hay borrador en DB
  // desde el catálogo.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("reebok_cart") || localStorage.getItem("reebok_cart");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.length > 0) setCart(parsed);
    } catch { /* data corrupta — carrito vacío */ }
  }, []);

  const cartInitialized = useRef(false);
  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    sessionStorage.setItem("reebok_cart", JSON.stringify(cart));
    try {
      localStorage.setItem("reebok_cart", JSON.stringify(cart));
    } catch { /* */ }
  }, [cart]);

  // Stock: el del sync nocturno (<24h) — decisión de Daniel 5-jul: CERO
  // llamadas en vivo a Switch desde el catálogo.
  const handleQtyChange = useCallback((productId: string, qty: number, product: Product) => {
    setCart(prev => {
      if (qty <= 0) return prev.filter(i => i.product_id !== productId);
      const idx = prev.findIndex(i => i.product_id === productId);
      if (idx >= 0) return prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item);
      return [...prev, { product_id: productId, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: qty, unit_price: product.price || 0, category: product.category, is_preorder: product.badge === "proximamente" }];
    });
  }, []);

  // ── Barra: al checkout (el pedido se crea y envía a Switch allá) ──
  function handleFloatingBarClick() {
    if (cart.length === 0) return;
    router.push("/catalogo/reebok/checkout");
  }

  // ── Scroll, search, filters ──
  useEffect(() => {
    function onScroll() { setShowScrollTop(window.scrollY > 400); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  // loadProducts también lo reusa el botón "Actualizar ahora" (CatalogoSyncNow)
  // para refrescar la vista tras un sync manual exitoso.
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, iRes] = await Promise.all([
        fetch("/api/catalogo/reebok/products?active=true"),
        fetch("/api/catalogo/reebok/inventory"),
      ]);
      const prods: Product[] = pRes.ok ? await pRes.json() : [];
      const inv: { product_id: string; size: string; quantity: number }[] = iRes.ok ? await iRes.json() : [];
      const stockMap: Record<string, number> = {};
      const sizesMap: Record<string, Set<string>> = {};
      inv.forEach(i => {
        stockMap[i.product_id] = (stockMap[i.product_id] || 0) + i.quantity;
        if (i.quantity > 0 && i.size) {
          if (!sizesMap[i.product_id]) sizesMap[i.product_id] = new Set();
          sizesMap[i.product_id].add(i.size);
        }
      });
      setProducts(prods.map(p => ({ ...p, _stock: stockMap[p.id] || 0, _sizes: [...(sizesMap[p.id] || [])] })).filter(p => p._stock > 0 || p.badge === "proximamente"));
    } catch { setProducts([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ── Derived state ──
  const catOrder: Record<string, number> = { footwear: 0, apparel: 1, accessories: 2 };
  const catLabel: Record<string, string> = { footwear: "Calzado", apparel: "Ropa", accessories: "Accesorios" };

  const filtered = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()) || (p.color || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => matchesGenderFilter(p.gender, gender))
    .filter(p => !category || p.category === category)
    .filter(p => !saleFilter || p.badge === saleFilter)
    .sort((a, b) => {
      if (sortBy === "precio-asc") return (a.price || 0) - (b.price || 0);
      if (sortBy === "precio-desc") return (b.price || 0) - (a.price || 0);
      if (sortBy === "nombre-az") return a.name.localeCompare(b.name);
      const ca = catOrder[a.category] ?? 9, cb = catOrder[b.category] ?? 9;
      if (ca !== cb) return ca - cb;
      const ga = genderGroupOrder(a.gender), gb = genderGroupOrder(b.gender);
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });

  const isGrouped = sortBy === "relevancia";
  const cartMap = new Map(cart.map(i => [i.product_id, i.quantity]));

  type Group = { label: string; items: typeof filtered };
  const groups: Group[] = [];
  let lastKey = "";
  for (const p of filtered) {
    const key = `${p.category}|${genderGroupKey(p.gender)}`;
    if (key !== lastKey) {
      groups.push({ label: `${catLabel[p.category] || p.category} — ${genderGroupLabel(p.gender)}`, items: [] });
      lastKey = key;
    }
    groups[groups.length - 1].items.push(p);
  }

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // ── Download catalog as PDF ──
  const [downloading, setDownloading] = useState(false);

  // ── Share dropdown ──
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
    if (saleFilter) params.set("filter", saleFilter);
    const qs = params.toString();
    const url = `https://www.fashiongr.com/catalogo-publico/reebok${qs ? `?${qs}` : ""}`;
    navigator.clipboard.writeText(url).then(() => {
      setToast("Link copiado");
    }).catch(() => {
      setToast("No se pudo copiar el link");
    });
    setShowShareMenu(false);
  }

  async function handleDownloadCatalog() {
    const items = filtered;
    if (!items.length || downloading) return;

    setDownloading(true);
    setToast("Generando catalogo PDF...");

    try {
      // Lib compartida Reebok/Joybees (src/lib/catalogo/catalog-pdf.ts).
      const { downloadCatalogPdf } = await import("@/lib/catalogo/catalog-pdf");

      const filterDesc: string[] = [];
      if (gender) filterDesc.push(genderFilterLabel(gender));
      if (category) filterDesc.push(catLabel[category] || category);
      if (saleFilter === "oferta") filterDesc.push("Oferta");
      if (saleFilter === "nuevo") filterDesc.push("Nuevo");
      if (search) filterDesc.push(`\u201c${search}\u201d`);
      const subtitle = filterDesc.length > 0 ? filterDesc.join("  \u00b7  ") : "Todos los productos";

      // Agrupaci\u00f3n can\u00f3nica (women+female \u2192 Mujer; unisex propio). "otros" cierra
      // el catch-all para que ning\u00fan producto con g\u00e9nero no contemplado se caiga
      // del PDF en silencio.
      const genders = [
        { key: "hombre", label: "HOMBRE" },
        { key: "mujer", label: "MUJER" },
        { key: "ninos", label: "NI\u00d1OS" },
        { key: "unisex", label: "UNISEX" },
        { key: "otros", label: "OTROS" },
      ];
      const sections = genders.map(g => ({
        label: g.label,
        items: items.filter(p => genderGroupKey(p.gender) === g.key).map(p => ({
          name: p.name, sku: p.sku || "", color: p.color, price: p.price,
          image_url: p.image_url || null, badge: p.badge,
        })),
      }));

      await downloadCatalogPdf({
        marca: "reebok",
        sections,
        subtitle,
        totalCount: items.length,
        filename: `catalogo-reebok-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      setToast("Catalogo descargado");
    } catch (e) {
      console.error(e);
      setToast("Error al generar PDF");
    } finally {
      setDownloading(false);
    }
  }

  function handleClearAll() {
    setSearchInput(""); setSearch(""); setGender(""); setCategory("");
    setSaleFilter(""); setSortBy("relevancia");
  }

  function handleClearCart() {
    setCart([]);
    sessionStorage.removeItem("reebok_cart");
    try { localStorage.removeItem("reebok_cart"); } catch { /* */ }
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

  // Empty
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

  // Grid
  const productGrid = (
    <div className={`${cartCount > 0 ? "pb-28" : ""}`}>
      {isGrouped ? (
        <div className="space-y-8">
          {groups.map(g => (
            <div key={g.label}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-bold uppercase tracking-wide text-[#1A2656]">
                  {g.label}
                </h2>
                <div className="flex-1 h-px bg-[#1A2656]/10" />
                <span className="text-xs text-[#1A2656]/25 tabular-nums">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {g.items.map(p => (
                  <CatalogProductCard
                    key={p.id}
                    product={p}
                    qty={cartMap.get(p.id) || 0}
                    onQtyChange={handleQtyChange}
                    showBultos
                    showStock
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map(p => (
            <CatalogProductCard
              key={p.id}
              product={p}
              qty={cartMap.get(p.id) || 0}
              onQtyChange={handleQtyChange}
              showBultos
              showStock
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
    <div className="max-w-7xl mx-auto px-4 py-6">
      <CatalogHeader variant="vendor" />

      {/* ── Filters ── */}
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

      {/* ── Sync + Share/Download row ── */}
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* "Actualizar ahora" del catálogo (solo con sesión admin/secretaria/
            vendedor — el catálogo público jamás lo ve). */}
        <CatalogoSyncNow catalogo="reebok" onSuccess={loadProducts} />
        {filtered.length > 0 && (
          <div className="relative" ref={shareRef}>
            <button onClick={() => setShowShareMenu(prev => !prev)}
              className="text-xs border border-[#1A2656]/10 text-[#1A2656]/40 px-3 py-1.5 rounded-lg hover:border-[#1A2656]/25 hover:text-[#1A2656]/60 transition flex items-center gap-1.5 min-h-[44px]">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Compartir
            </button>
            {showShareMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 w-48 z-50">
                <button onClick={handleCopyLink}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar link
                </button>
                <button onClick={() => { setShowShareMenu(false); handleDownloadCatalog(); }} disabled={downloading}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {downloading ? "Generando..." : "Descargar PDF"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      {loading ? skeletonGrid : filtered.length === 0 ? emptyState : productGrid}


      <Toast message={toast} />

      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-4 z-30 w-10 h-10 bg-white border border-[#1A2656]/10 rounded-full shadow-md flex items-center justify-center text-[#1A2656]/40 hover:text-[#1A2656] transition min-w-[44px] min-h-[44px]">&uarr;</button>
      )}

      {/* ── Sticky cart bar ── */}
      {cartCount > 0 && (
        <StickyCartBar
          cart={cart}
          cartCount={cartCount}
          cartTotal={cartTotal}
          onQtyChange={handleQtyChange}
          onClearCart={handleClearCart}
          variant="vendor"
          onCreateOrder={handleFloatingBarClick}
          saving={false}
          actionLabel="Ver pedido"
          actionColor="bg-[#E4002B] hover:bg-[#c90025]"
          formatTotal={fmt}
        />
      )}
    </div>
    </div>
  );
}
