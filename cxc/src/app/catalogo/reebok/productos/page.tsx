"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const PAGE_SIZE = 24;

  // ── State: cart + draft context ──
  const [cart, setCart] = useState<CartItem[]>([]);
  // Mode A: new order (client name in sessionStorage, no DB order yet)
  const [draftClient, setDraftClient] = useState("");
  // Mode B: existing order (draft ID in sessionStorage, order in DB)
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState("");
  const [draftOriginalIds, setDraftOriginalIds] = useState<Set<string>>(new Set());

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * 12 * Number(i.unit_price || 0), 0);

  const [restoredDraftBanner, setRestoredDraftBanner] = useState<string | null>(null);

  // ── On mount: determine mode from sessionStorage, fallback to localStorage ──
  useEffect(() => {
    const existingDraftId = sessionStorage.getItem("reebok_draft_id");
    const newClient = sessionStorage.getItem("reebok_draft_client");

    if (existingDraftId) {
      // Mode B: returning from an existing draft order — load its items
      fetch(`/api/catalogo/reebok/orders/${existingDraftId}`).then(r => r.ok ? r.json() : null).then(order => {
        if (order && order.status === "borrador") {
          setDraftId(order.id);
          setDraftNumber(order.order_number);
          setDraftClient(order.client_name || "");
          const items: CartItem[] = (order.reebok_order_items || []).map((i: CartItem) => ({
            product_id: i.product_id, sku: i.sku || "", name: i.name || "",
            image_url: i.image_url || "", quantity: i.quantity, unit_price: i.unit_price,
          }));
          setCart(items);
          setDraftOriginalIds(new Set(items.map(i => i.product_id)));
        } else {
          sessionStorage.removeItem("reebok_draft_id");
        }
      }).catch(() => { sessionStorage.removeItem("reebok_draft_id"); });
    } else if (newClient) {
      // Mode A: client set, restore cart from sessionStorage
      setDraftClient(newClient);
      try {
        const saved = sessionStorage.getItem("reebok_cart");
        if (saved) setCart(JSON.parse(saved));
      } catch { /* corrupt data — ignore */ }
    } else {
      // No sessionStorage context — check localStorage for recovered draft
      try {
        const lsClient = localStorage.getItem("reebok_draft_client");
        const lsCart = localStorage.getItem("reebok_cart");
        if (lsClient && lsCart) {
          const parsed = JSON.parse(lsCart);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRestoredDraftBanner(lsClient);
            return; // Don't clean — wait for user decision
          }
        }
      } catch { /* */ }
      sessionStorage.removeItem("reebok_cart");
    }
  }, []);

  function restoreDraft() {
    try {
      const lsClient = localStorage.getItem("reebok_draft_client") || "";
      const lsCart = localStorage.getItem("reebok_cart");
      sessionStorage.setItem("reebok_draft_client", lsClient);
      setDraftClient(lsClient);
      if (lsCart) { setCart(JSON.parse(lsCart)); sessionStorage.setItem("reebok_cart", lsCart); }
    } catch { /* */ }
    setRestoredDraftBanner(null);
  }

  function discardDraft() {
    localStorage.removeItem("reebok_draft_client");
    localStorage.removeItem("reebok_cart");
    sessionStorage.removeItem("reebok_cart");
    setRestoredDraftBanner(null);
  }

  // Persist cart to sessionStorage + localStorage on every change (skip initial empty)
  const cartInitialized = useRef(false);
  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    sessionStorage.setItem("reebok_cart", JSON.stringify(cart));
    // Also persist to localStorage for recovery
    try {
      localStorage.setItem("reebok_cart", JSON.stringify(cart));
      if (draftClient) localStorage.setItem("reebok_draft_client", draftClient);
    } catch { /* */ }
  }, [cart, draftClient]);

  const handleQtyChange = useCallback((productId: string, qty: number, product: Product) => {
    setCart(prev => {
      if (qty <= 0) return prev.filter(i => i.product_id !== productId);
      const idx = prev.findIndex(i => i.product_id === productId);
      if (idx >= 0) return prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item);
      return [...prev, { product_id: productId, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: qty, unit_price: product.price || 0 }];
    });
  }, []);

  // ── Floating bar action: create or update ──
  async function handleFloatingBarClick() {
    if (cart.length === 0) return;
    // No context yet — ask for client name first
    if (!draftId && !draftClient) { setShowNameModal(true); return; }
    setSaving(true);

    if (draftId) {
      // Mode B: update existing order
      setToast("Actualizando pedido...");
      try {
        for (const item of cart) {
          await fetch(`/api/catalogo/reebok/orders/${draftId}/item`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });
        }
        // Delete removed items
        for (const pid of draftOriginalIds) {
          if (!cart.find(i => i.product_id === pid)) {
            await fetch(`/api/catalogo/reebok/orders/${draftId}/item`, {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ product_id: pid, quantity: 0 }),
            });
          }
        }
        router.push(`/catalogo/reebok/pedido/${draftId}`);
      } catch { setToast("Error al actualizar pedido"); setSaving(false); }
    } else {
      // Mode A: create new order
      setToast("Creando pedido...");
      try {
        const res = await fetch("/api/catalogo/reebok/orders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: draftClient,
            vendor_name: sessionStorage.getItem("fg_user_name") || null,
            items: cart,
          }),
        });
        if (res.ok) {
          const order = await res.json();
          // Switch sessionStorage from "new" mode to "existing" mode
          sessionStorage.removeItem("reebok_draft_client");
          sessionStorage.removeItem("reebok_cart");
          sessionStorage.setItem("reebok_draft_id", order.id);
          router.push(`/catalogo/reebok/pedido/${order.id}`);
        } else {
          const err = await res.json().catch(() => ({}));
          setToast(err.error || "Error al crear pedido");
          setSaving(false);
        }
      } catch { setToast("Error de conexion"); setSaving(false); }
    }
  }

  // ── Scroll, search, filters ──
  useEffect(() => {
    function onScroll() { setShowScrollTop(window.scrollY > 400); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [gender, category, onlyOferta, priceFilter]);

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

  // ── Derived state ──
  const catOrder: Record<string, number> = { footwear: 0, apparel: 1, accessories: 2 };
  const genOrder: Record<string, number> = { male: 0, female: 1, kids: 2, unisex: 3 };
  const catLabel: Record<string, string> = { footwear: 'Calzado', apparel: 'Ropa', accessories: 'Accesorios' };
  const genLabel: Record<string, string> = { male: 'Hombre', female: 'Mujer', kids: 'Niños', unisex: 'Unisex' };

  // Pre-price filtered set (all filters EXCEPT price) — used for price dropdown options
  const filteredBeforePrice = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => !gender || p.gender === gender)
    .filter(p => !category || p.category === category)
    .filter(p => !onlyOferta || p.on_sale);

  const ofertaPrices = onlyOferta
    ? [...new Set(filteredBeforePrice.filter(p => p.price).map(p => p.price!))].sort((a, b) => a - b)
    : [];

  const filtered = filteredBeforePrice
    .filter(p => !priceFilter || p.price === Number(priceFilter))
    .sort((a, b) => {
      const ca = catOrder[a.category] ?? 9, cb = catOrder[b.category] ?? 9;
      if (ca !== cb) return ca - cb;
      const ga = genOrder[a.gender || 'unisex'] ?? 9, gb = genOrder[b.gender || 'unisex'] ?? 9;
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const cartMap = new Map(cart.map(i => [i.product_id, i.quantity]));

  type Group = { label: string; items: typeof filtered };
  const groups: Group[] = [];
  let lastKey = '';
  for (const p of paginated) {
    const key = `${p.category}|${p.gender || 'unisex'}`;
    if (key !== lastKey) {
      groups.push({ label: `${catLabel[p.category] || p.category} — ${genLabel[p.gender || 'unisex'] || p.gender}`, items: [] });
      lastKey = key;
    }
    groups[groups.length - 1].items.push(p);
  }

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const hasContext = draftClient || draftId; // user is in an order flow

  // ── Download catalog as printable page ──
  function handleDownloadCatalog() {
    const items = filtered;
    if (items.length === 0) return;

    const filterDesc: string[] = [];
    if (gender) filterDesc.push(genLabel[gender] || gender);
    if (category) filterDesc.push(catLabel[category] || category);
    if (onlyOferta) filterDesc.push("Oferta");
    if (priceFilter) filterDesc.push(`$${Number(priceFilter).toFixed(0)}`);
    if (search) filterDesc.push(`"${search}"`);
    const subtitle = filterDesc.length > 0 ? filterDesc.join(" · ") : "Todos los productos";

    const w = window.open("", "_blank");
    if (!w) return;

    const logoUrl = window.location.origin + "/reebok/reebok-logo.png";
    const COLS = 5;
    const ROWS_FIRST = 4; // first page has header
    const ROWS_REST = 5;
    const perFirst = COLS * ROWS_FIRST;
    const perRest = COLS * ROWS_REST;

    function card(p: typeof items[0]) {
      const imgSrc = p.image_url || "";
      const priceUnit = p.price ? `$${p.price.toFixed(0)}` : "—";
      return `<div class="product">
        <div class="img-wrap">
          ${imgSrc ? `<img src="${imgSrc}" alt="${p.name}" />` : `<div class="no-img">Sin foto</div>`}
          ${p.on_sale ? `<span class="badge-sale">OFERTA</span>` : ""}
        </div>
        <div class="info">
          <div class="name">${p.name}</div>
          <div class="sku">${p.sku || ""}</div>
          ${p.color ? `<div class="color">${p.color}</div>` : ""}
          <div class="price">${priceUnit}</div>
        </div>
      </div>`;
    }

    // Build pages
    const pages: string[] = [];
    let idx = 0;

    // Page 1 with header
    const firstItems = items.slice(0, perFirst);
    idx = perFirst;
    pages.push(`<div class="page">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="Reebok" />
          <div class="subtitle">${subtitle}</div>
        </div>
        <div class="header-right">
          <div class="count">${items.length} productos</div>
          <div>${new Date().toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
      </div>
      <div class="grid grid-${ROWS_FIRST}">${firstItems.map(card).join("")}</div>
    </div>`);

    // Remaining pages
    while (idx < items.length) {
      const chunk = items.slice(idx, idx + perRest);
      idx += perRest;
      pages.push(`<div class="page">
        <div class="grid grid-${ROWS_REST}">${chunk.map(card).join("")}</div>
      </div>`);
    }

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Catálogo Reebok — ${subtitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: letter portrait; margin: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 216mm; height: 279mm; padding: 8mm; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; }
    .page:last-child { page-break-after: auto; }
    .header { padding: 0 0 8px; border-bottom: 2px solid #cc0000; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-shrink: 0; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-left img { height: 28px; }
    .header-left .subtitle { font-size: 11px; color: #888; }
    .header-right { text-align: right; font-size: 10px; color: #999; }
    .header-right .count { font-size: 14px; font-weight: 600; color: #1a1a1a; }
    .grid { display: grid; grid-template-columns: repeat(${COLS}, 1fr); gap: 6px; flex: 1; align-content: start; }
    .product { border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; }
    .img-wrap { position: relative; aspect-ratio: 1; background: #f8f8f8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .img-wrap img { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
    .no-img { color: #ccc; font-size: 9px; }
    .badge-sale { position: absolute; top: 3px; right: 3px; background: #cc0000; color: white; font-size: 7px; font-weight: 700; padding: 1px 5px; border-radius: 2px; }
    .info { padding: 5px 6px; }
    .name { font-size: 8.5px; font-weight: 600; line-height: 1.2; margin-bottom: 1px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .sku { font-size: 7.5px; color: #999; font-family: 'SF Mono', 'Consolas', monospace; }
    .color { font-size: 7.5px; color: #666; }
    .price { font-size: 11px; font-weight: 700; margin-top: 2px; }
  </style>
</head>
<body>
${pages.join("\n")}
<script>
  const imgs = document.querySelectorAll('img');
  let loaded = 0;
  const total = imgs.length;
  if (total === 0) { setTimeout(() => window.print(), 100); }
  else {
    imgs.forEach(img => {
      if (img.complete) { loaded++; if (loaded >= total) setTimeout(() => window.print(), 300); }
      else { img.onload = img.onerror = () => { loaded++; if (loaded >= total) setTimeout(() => window.print(), 300); }; }
    });
  }
</script>
</body>
</html>`);
    w.document.close();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-light">Catálogo Reebok</h1>
        <p className="text-sm text-gray-400">Panamá</p>
      </div>

      {/* ── Banner: recovered draft from localStorage ── */}
      {restoredDraftBanner && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
          <span className="text-sm text-amber-700">Tienes un pedido sin terminar para <strong>{restoredDraftBanner}</strong>.</span>
          <div className="flex gap-2">
            <button onClick={restoreDraft} className="text-xs bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition">Continuar</button>
            <button onClick={discardDraft} className="text-xs text-gray-500 hover:text-black transition px-2">Descartar</button>
          </div>
        </div>
      )}

      {/* ── Banner: order context ── */}
      {hasContext ? (
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {draftId ? (
              <>
                <span className="text-gray-600">Editando</span>
                <span className="font-medium">{draftNumber}</span>
                <span className="text-gray-400">— {draftClient}</span>
              </>
            ) : (
              <>
                <span className="text-gray-600">Pedido para</span>
                <span className="font-medium">{draftClient}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!draftId && <button onClick={() => setShowNameModal(true)} className="text-xs text-gray-400 hover:text-black transition">Cambiar</button>}
            {draftId && <Link href={`/catalogo/reebok/pedido/${draftId}`} className="text-xs text-black hover:underline transition">Ver pedido →</Link>}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
          <span className="text-sm text-amber-800">Para hacer un pedido, primero selecciona el cliente</span>
          <button onClick={() => setShowNameModal(true)} className="text-sm bg-black text-white px-4 py-1.5 rounded-md hover:bg-gray-800 transition">Seleccionar cliente</button>
        </div>
      )}

      {/* ── Filters ── */}
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
        <div className="flex items-center gap-2 ml-auto mb-1">
          <span className="text-xs text-gray-400">{filtered.length}</span>
          {filtered.length > 0 && (
            <button onClick={handleDownloadCatalog}
              className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-full hover:border-gray-400 hover:text-black transition flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Catálogo
            </button>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
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
                  <ProductCard key={p.id} product={p} stock={p._stock} qty={cartMap.get(p.id) || 0} onQtyChange={handleQtyChange} disabled={!hasContext} />
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

      {/* ── Name modal (when no context) ── */}
      {showNameModal && (
        <NewOrderModal onClose={() => setShowNameModal(false)} />
      )}

      {/* ── Floating bar ── */}
      {cartCount > 0 && hasContext && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white border-t border-gray-100 shadow-lg">
          <button onClick={handleFloatingBarClick} disabled={saving}
            className={`w-full py-3.5 rounded-lg text-sm font-medium flex items-center justify-between px-4 transition disabled:opacity-50 ${
              draftId ? "bg-black text-white hover:bg-gray-800" : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}>
            <span>{saving ? "Guardando..." : draftId ? `Actualizar pedido ${draftNumber}` : draftClient ? `Crear pedido para ${draftClient}` : "Crear pedido"}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{cartCount} bulto{cartCount !== 1 ? "s" : ""}</span>
              {cartTotal > 0 && <><span className="text-white/40">·</span><span className="tabular-nums font-semibold">${fmt(cartTotal)}</span></>}
              <span>→</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
