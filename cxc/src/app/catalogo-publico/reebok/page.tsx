"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { Product } from "@/components/reebok/supabase";
import { Toast } from "@/components/ui";

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
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
  const [priceFilter, setPriceFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [sortBy, setSortBy] = useState("relevancia");
  const [toast, setToast] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * Number(i.unit_price || 0), 0);

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

  useEffect(() => { setPage(1); }, [gender, category, saleFilter, priceFilter, colorFilter, sizeFilter, sortBy]);

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

  const filteredBeforePrice = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => !gender || p.gender === gender)
    .filter(p => !category || p.category === category)
    .filter(p => !saleFilter || (saleFilter === "oferta" ? p.on_sale : !p.on_sale));

  const ofertaPrices = saleFilter === "oferta"
    ? [...new Set(filteredBeforePrice.filter(p => p.price).map(p => p.price!))].sort((a, b) => a - b)
    : [];

  const uniqueColors = [...new Set(filteredBeforePrice.filter(p => p.color).map(p => p.color!))].sort((a, b) => a.localeCompare(b));
  const uniqueSizes = [...new Set(filteredBeforePrice.flatMap(p => p._sizes))].sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const filtered = filteredBeforePrice
    .filter(p => !priceFilter || p.price === Number(priceFilter))
    .filter(p => !colorFilter || p.color === colorFilter)
    .filter(p => !sizeFilter || p._sizes.includes(sizeFilter))
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

  // WhatsApp send
  function handleSendWhatsApp() {
    if (cart.length === 0) return;
    const lines = cart.map(item =>
      `- ${item.name} x${item.quantity} — $${(item.unit_price * item.quantity).toFixed(2)}`
    );
    const total = cart.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const msg = `Hola, quiero hacer un pedido:\n\n${lines.join("\n")}\n\nTotal: $${total.toFixed(2)}`;
    const url = `https://wa.me/50766745522?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    setCart([]);
    try { localStorage.removeItem("reebok_public_cart"); } catch { /* */ }
    setToast("Pedido enviado por WhatsApp");
    setMiniCartOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wider text-[#1A2656]">
              Catalogo Reebok
            </h1>
            <p className="text-xs text-[#1A2656]/50 uppercase tracking-widest mt-0.5">
              Panama
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-5 bg-[#E4002B]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#1A2656]">
              Fashion Group
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="text-[10px] text-[#1A2656]/60 uppercase tracking-wider font-medium">
              Buscar
            </label>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Nombre o SKU"
              className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition w-44 bg-transparent"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#1A2656]/60 uppercase tracking-wider font-medium">
              Genero
            </label>
            <select
              value={gender}
              onChange={e => setGender(e.target.value)}
              className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent"
            >
              <option value="">Todos</option>
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
              <option value="kids">Ninos</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#1A2656]/60 uppercase tracking-wider font-medium">
              Categoria
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent"
            >
              <option value="">Todas</option>
              <option value="footwear">Calzado</option>
              <option value="apparel">Ropa</option>
              <option value="accessories">Accesorios</option>
            </select>
          </div>
          {uniqueColors.length > 1 && (
            <div>
              <label className="text-[10px] text-[#1A2656]/60 uppercase tracking-wider font-medium">
                Color
              </label>
              <select
                value={colorFilter}
                onChange={e => setColorFilter(e.target.value)}
                className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent"
              >
                <option value="">Todos</option>
                {uniqueColors.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          {uniqueSizes.length > 1 && (
            <div>
              <label className="text-[10px] text-[#1A2656]/60 uppercase tracking-wider font-medium">
                Talla
              </label>
              <select
                value={sizeFilter}
                onChange={e => setSizeFilter(e.target.value)}
                className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent"
              >
                <option value="">Todas</option>
                {uniqueSizes.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => { setSaleFilter(saleFilter === "oferta" ? "" : "oferta"); setPriceFilter(""); }}
            className={`text-xs px-4 py-2 rounded-sm transition font-medium uppercase tracking-wider mb-0.5 ${
              saleFilter === "oferta"
                ? "bg-[#E4002B] text-white"
                : "border border-[#1A2656]/20 text-[#1A2656]/60 hover:border-[#E4002B] hover:text-[#E4002B]"
            }`}
          >
            Oferta
          </button>
          <button
            onClick={() => { setSaleFilter(saleFilter === "nuevo" ? "" : "nuevo"); setPriceFilter(""); }}
            className={`text-xs px-4 py-2 rounded-sm transition font-medium uppercase tracking-wider mb-0.5 ${
              saleFilter === "nuevo"
                ? "bg-[#1A2656] text-white"
                : "border border-[#1A2656]/20 text-[#1A2656]/60 hover:border-[#1A2656] hover:text-[#1A2656]"
            }`}
          >
            Nuevo
          </button>
          {saleFilter === "oferta" && ofertaPrices.length > 1 && (
            <div>
              <label className="text-[10px] text-orange-400 uppercase tracking-wider">Precio</label>
              <select
                value={priceFilter}
                onChange={e => setPriceFilter(e.target.value)}
                className="block border-b border-orange-300 py-2 text-sm outline-none focus:border-orange-500 transition bg-transparent text-orange-700"
              >
                <option value="">Todos</option>
                {ofertaPrices.map(p => (
                  <option key={p} value={p}>${p.toFixed(0)}</option>
                ))}
              </select>
            </div>
          )}
          {(searchInput || gender || category || saleFilter || colorFilter || sizeFilter) && (
            <button
              onClick={() => {
                setSearchInput(""); setSearch(""); setGender(""); setCategory("");
                setSaleFilter(""); setPriceFilter(""); setColorFilter(""); setSizeFilter("");
                setSortBy("relevancia");
              }}
              className="text-sm text-gray-400 hover:text-black transition py-2 mb-0.5"
            >
              Limpiar
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto mb-1">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-gray-400 transition bg-transparent text-gray-500"
            >
              <option value="relevancia">Relevancia</option>
              <option value="precio-asc">Precio: menor a mayor</option>
              <option value="precio-desc">Precio: mayor a menor</option>
              <option value="nombre-az">Nombre A-Z</option>
            </select>
            <span className="text-xs text-gray-400">{filtered.length}</span>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="bg-white overflow-hidden rounded-lg">
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
          <p className="text-center py-20 text-[#1A2656]/40 text-sm">
            No se encontraron productos
          </p>
        ) : (
          <div className={`fade-in ${cartCount > 0 ? "pb-24" : ""}`}>
            {isGrouped ? (
              <div className="space-y-8">
                {groups.map(g => (
                  <div key={g.label}>
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A2656]">
                        {g.label}
                      </h2>
                      <div className="flex-1 border-t border-[#1A2656]/10" />
                      <span className="text-xs text-[#1A2656]/30">{g.items.length}</span>
                    </div>
                    <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {g.items.map(p => (
                        <PublicProductCard
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
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {paginated.map(p => (
                  <PublicProductCard
                    key={p.id}
                    product={p}
                    qty={cartMap.get(p.id) || 0}
                    onQtyChange={handleQtyChange}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8 mb-4">
            <button
              onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === 1}
              className="text-xs font-medium uppercase tracking-wider border border-[#1A2656]/20 text-[#1A2656] px-4 py-2 rounded-sm hover:border-[#1A2656] transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {"<-"} Anterior
            </button>
            <span className="text-xs text-[#1A2656]/40">{page} / {totalPages}</span>
            <button
              onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === totalPages}
              className="text-xs font-medium uppercase tracking-wider border border-[#1A2656]/20 text-[#1A2656] px-4 py-2 rounded-sm hover:border-[#1A2656] transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Siguiente {"->"}
            </button>
          </div>
        )}

        <Toast message={toast} />

        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-20 right-4 z-30 w-10 h-10 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-400 hover:text-black transition"
          >
            {"^"}
          </button>
        )}

        {/* Floating cart bar */}
        {cartCount > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40">
            {miniCartOpen && (
              <div className="fixed inset-0 bg-black/20 z-[-1]" onClick={() => setMiniCartOpen(false)} />
            )}

            {/* Mini cart panel */}
            <div
              className="bg-white border-t border-gray-200 overflow-hidden"
              style={{ maxHeight: miniCartOpen ? "300px" : "0px", transition: "max-height 200ms ease-out" }}
            >
              <div className="overflow-y-auto" style={{ maxHeight: "250px" }}>
                <div className="px-4 pt-3 pb-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tu pedido
                    </span>
                    <button
                      onClick={() => setMiniCartOpen(false)}
                      className="text-gray-400 hover:text-black transition p-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                  {cart.map(item => (
                    <div key={item.product_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700 truncate mr-3 flex-1">{item.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleQtyChange(item.product_id, item.quantity - 1, { id: item.product_id, name: item.name, sku: item.sku, price: item.unit_price, image_url: item.image_url } as Product)}
                            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded transition text-sm"
                          >
                            -
                          </button>
                          <span className="text-sm tabular-nums text-gray-700 w-6 text-center font-medium">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleQtyChange(item.product_id, item.quantity + 1, { id: item.product_id, name: item.name, sku: item.sku, price: item.unit_price, image_url: item.image_url } as Product)}
                            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded transition text-sm"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-sm tabular-nums text-gray-500 w-16 text-right">
                          ${(item.unit_price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">
                  Total: ${fmt(cartTotal)}
                </span>
                <button
                  onClick={() => { setCart([]); try { localStorage.removeItem("reebok_public_cart"); } catch { /* */ } setMiniCartOpen(false); }}
                  className="text-xs text-gray-400 hover:text-red-500 transition"
                >
                  Vaciar carrito
                </button>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="p-3 bg-white border-t border-gray-100 shadow-lg flex items-center gap-2">
              <button
                onClick={() => setMiniCartOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-3.5 rounded-lg bg-gray-100 text-gray-700 text-sm tabular-nums shrink-0 hover:bg-gray-200 transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="transition-transform duration-200"
                  style={{ transform: miniCartOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
                <span>{cartCount} producto{cartCount !== 1 ? "s" : ""}</span>
                {cartTotal > 0 && (
                  <>
                    <span className="text-gray-400">{"*"}</span>
                    <span className="font-semibold">${fmt(cartTotal)}</span>
                  </>
                )}
              </button>

              <button
                onClick={handleSendWhatsApp}
                className="flex-1 py-3.5 rounded-sm text-xs font-medium uppercase tracking-wider flex items-center justify-center gap-2 transition bg-[#25D366] text-white hover:bg-[#1fb855]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span>Enviar pedido</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline product card (simplified, no lightbox, no admin features) ──

function PublicProductCard({
  product,
  qty,
  onQtyChange,
}: {
  product: Product & { _stock: number; _sizes: string[] };
  qty: number;
  onQtyChange: (productId: string, qty: number, product: Product) => void;
}) {
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [justAdded, setJustAdded] = useState(false);
  const prevQtyRef = useRef(qty);
  const [showLightbox, setShowLightbox] = useState(false);

  useEffect(() => {
    if (prevQtyRef.current === 0 && qty === 1) {
      setJustAdded(true);
      const t = setTimeout(() => setJustAdded(false), 600);
      return () => clearTimeout(t);
    }
    prevQtyRef.current = qty;
  }, [qty]);

  function setQty(n: number) {
    onQtyChange(product.id, Math.max(0, n), product);
  }

  const inOrder = qty > 0;

  return (
    <>
      <div
        className={`bg-white overflow-hidden rounded-lg relative transition-all duration-300 ${
          justAdded ? "ring-2 ring-emerald-400 scale-[1.02]" : ""
        }`}
      >
        {justAdded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none" style={{ animation: "checkFade 0.6s ease-out forwards" }}>
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        )}
        <div
          className="aspect-square bg-[#F5F0E8] relative overflow-hidden cursor-pointer"
          onClick={() => { if (product.image_url) setShowLightbox(true); }}
        >
          {!product.on_sale && (
            <div className="absolute top-2.5 left-0 z-[5]">
              <span className="inline-block bg-[#1A2656] text-white text-[9px] font-bold uppercase tracking-[0.15em] pl-2.5 pr-2 py-[3px]">
                Nuevo
              </span>
            </div>
          )}
          {product.image_url ? (
            <>
              {imageStatus === "loading" && <div className="absolute inset-0 shimmer" />}
              {imageStatus === "error" ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <button
                    onClick={(e) => { e.stopPropagation(); setImageStatus("loading"); }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <Image
                  key={imageStatus}
                  src={product.image_url}
                  alt={product.name}
                  width={300}
                  height={300}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-contain p-2"
                  onLoad={() => setImageStatus("loaded")}
                  onError={() => setImageStatus("error")}
                />
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
            {product.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {product.sub_category && (
              <span className="text-[10px] text-gray-500 capitalize">{product.sub_category}</span>
            )}
            {product.color && (
              <>
                <span className="text-[10px] text-gray-300">*</span>
                <span className="text-[10px] text-gray-400">{product.color}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-base font-semibold text-black">
              {product.price ? `$${product.price.toFixed(0)}` : "Consultar"}
            </p>
            {product.on_sale && (
              <span className="text-[10px] font-bold text-[#E4002B] bg-red-50 px-2 py-0.5 uppercase tracking-wider">
                OFERTA
              </span>
            )}
          </div>

          {inOrder ? (
            <div className="mt-2">
              <div className="flex items-center justify-between bg-green-50 rounded px-1">
                <button
                  onClick={() => setQty(qty - 1)}
                  className={`h-12 flex items-center justify-center text-green-700 text-lg font-medium hover:bg-green-100 rounded transition ${
                    qty === 1 ? "px-2 gap-1" : "w-12"
                  }`}
                >
                  {qty === 1 ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      <span className="text-xs font-medium">Quitar</span>
                    </>
                  ) : (
                    "-"
                  )}
                </button>
                <span className="text-center min-w-[48px] py-1">
                  <span className="text-base font-semibold text-green-700 tabular-nums">{qty}</span>
                </span>
                <button
                  onClick={() => setQty(qty + 1)}
                  className="w-12 h-12 flex items-center justify-center text-green-700 text-lg font-medium hover:bg-green-100 rounded transition"
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setQty(1)}
              className="w-full mt-2 py-3 rounded-sm text-xs font-medium uppercase tracking-[0.12em] transition min-h-[48px] bg-[#E4002B] text-white hover:bg-[#c90025]"
            >
              Agregar
            </button>
          )}
        </div>
      </div>

      {showLightbox && product.image_url && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-8"
          onClick={() => setShowLightbox(false)}
        >
          <img src={product.image_url} alt={product.name} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setShowLightbox(false)} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">
            &times;
          </button>
        </div>
      )}
    </>
  );
}
