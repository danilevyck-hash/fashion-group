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
  const [products, setProducts] = useState<(Product & { _stock: number; _sizes: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState("");
  const [saleFilter, setSaleFilter] = useState<"" | "oferta" | "nuevo">("");
  const [priceFilter, setPriceFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [sortBy, setSortBy] = useState("relevancia");
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
            client_email: sessionStorage.getItem("reebok_draft_client_email") || null,
            items: cart,
          }),
        });
        if (res.ok) {
          const order = await res.json();
          // Switch sessionStorage from "new" mode to "existing" mode
          sessionStorage.removeItem("reebok_draft_client");
          sessionStorage.removeItem("reebok_draft_client_email");
          sessionStorage.removeItem("reebok_cart");
          sessionStorage.setItem("reebok_draft_id", order.id);
          router.push(`/catalogo/reebok/pedido/${order.id}`);
        } else {
          const err = await res.json().catch(() => ({}));
          setToast(err.error || "Error al crear pedido");
          setSaving(false);
        }
      } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setSaving(false); }
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

  useEffect(() => { setPage(1); }, [gender, category, saleFilter, priceFilter, colorFilter, sizeFilter, sortBy]);

  useEffect(() => {
    async function load() {
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
        setProducts(prods.map(p => ({ ...p, _stock: stockMap[p.id] || 0, _sizes: [...(sizesMap[p.id] || [])] })));
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

  // Pre-price filtered set (all filters EXCEPT price/color/size) — used for dropdown options
  const filteredBeforePrice = products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => !gender || p.gender === gender)
    .filter(p => !category || p.category === category)
    .filter(p => !saleFilter || (saleFilter === "oferta" ? p.on_sale : !p.on_sale));

  const ofertaPrices = saleFilter === "oferta"
    ? [...new Set(filteredBeforePrice.filter(p => p.price).map(p => p.price!))].sort((a, b) => a - b)
    : [];

  // Unique colors from currently filtered products (before color/size filter)
  const uniqueColors = [...new Set(filteredBeforePrice.filter(p => p.color).map(p => p.color!))].sort((a, b) => a.localeCompare(b));

  // Unique sizes from currently filtered products (before color/size filter), with stock > 0
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
      // Default: relevancia — grouped by category then gender then name
      const ca = catOrder[a.category] ?? 9, cb = catOrder[b.category] ?? 9;
      if (ca !== cb) return ca - cb;
      const ga = genOrder[a.gender || 'unisex'] ?? 9, gb = genOrder[b.gender || 'unisex'] ?? 9;
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });

  const isGrouped = sortBy === "relevancia";

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

  // ── Download catalog as PDF ──
  const [downloading, setDownloading] = useState(false);

  // ── Mini cart expand/collapse ──
  const [miniCartOpen, setMiniCartOpen] = useState(false);

  async function handleDownloadCatalog() {
    const items = filtered;
    if (!items.length || downloading) return;

    setDownloading(true);
    setToast("Generando catálogo PDF...");

    try {
      const { jsPDF } = await import("jspdf");

      // Layout constants (letter portrait in mm)
      const PW = 215.9, PH = 279.4, M = 14;
      const COLS = 3, GAP = 5;
      const CW = (PW - 2 * M - (COLS - 1) * GAP) / COLS;
      const IH = 52, TH = 18, CH = IH + TH, RGAP = 5;
      const GENDER_H = 10;

      // Load an image as base64 via canvas
      function loadImg(url: string): Promise<{ data: string; w: number; h: number }> {
        return new Promise(resolve => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext("2d")!.drawImage(img, 0, 0);
            try { resolve({ data: c.toDataURL("image/jpeg", 0.75), w: img.naturalWidth, h: img.naturalHeight }); }
            catch { resolve({ data: "", w: 0, h: 0 }); }
          };
          img.onerror = () => resolve({ data: "", w: 0, h: 0 });
          img.src = url;
        });
      }

      // Load all product images + logo in parallel
      const urls = [...new Set(items.filter(p => p.image_url).map(p => p.image_url!))];
      const imgCache: Record<string, { data: string; w: number; h: number }> = {};
      const [logoResult, ...imgResults] = await Promise.all([
        loadImg("/reebok/reebok-logo.png"),
        ...urls.map(u => loadImg(u).then(r => { imgCache[u] = r; })),
      ]);
      void imgResults;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
      let y = M;

      function needPage(h: number) {
        if (y + h > PH - M) { doc.addPage(); y = M; return true; }
        return false;
      }

      // ── Header (page 1) ──
      if (logoResult.data) {
        const logoH = 10;
        const logoW = (logoResult.w / logoResult.h) * logoH;
        doc.addImage(logoResult.data, "PNG", M, y, logoW, logoH);
      }
      // Right side info
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150);
      const dateStr = new Date().toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });
      doc.text(dateStr, PW - M, y + 4, { align: "right" });
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.setFont("helvetica", "bold");
      doc.text(`${items.length} productos`, PW - M, y + 9, { align: "right" });
      y += 14;
      // Red line
      doc.setDrawColor(204, 0, 0);
      doc.setLineWidth(0.6);
      doc.line(M, y, PW - M, y);
      y += 2;
      // Subtitle (filters)
      const filterDesc: string[] = [];
      if (gender) filterDesc.push(genLabel[gender] || gender);
      if (category) filterDesc.push(catLabel[category] || category);
      if (saleFilter === "oferta") filterDesc.push("Oferta");
      if (saleFilter === "nuevo") filterDesc.push("Nuevo");
      if (priceFilter) filterDesc.push(`$${Number(priceFilter).toFixed(0)}`);
      if (colorFilter) filterDesc.push(colorFilter);
      if (sizeFilter) filterDesc.push(`Talla ${sizeFilter}`);
      if (search) filterDesc.push(`"${search}"`);
      const subtitle = filterDesc.length > 0 ? filterDesc.join(" · ") : "Todos los productos";
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(140);
      doc.text(subtitle, M, y + 3);
      y += 7;

      // ── Group by gender ──
      const genders = [
        { key: "male", label: "Hombre" },
        { key: "female", label: "Mujer" },
        { key: "kids", label: "Niños" },
        { key: "unisex", label: "Unisex" },
      ];

      for (const g of genders) {
        const gItems = items.filter(p => (p.gender || "unisex") === g.key);
        if (!gItems.length) continue;

        // Gender section header
        needPage(GENDER_H + CH);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30);
        doc.text(g.label, M, y + 6);
        const tw = doc.getTextWidth(g.label);
        doc.setDrawColor(210);
        doc.setLineWidth(0.2);
        doc.line(M + tw + 4, y + 4, PW - M, y + 4);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(170);
        doc.text(`${gItems.length}`, PW - M, y + 6, { align: "right" });
        y += GENDER_H;

        // Render products in rows
        for (let i = 0; i < gItems.length; i += COLS) {
          needPage(CH);
          const row = gItems.slice(i, i + COLS);

          for (let j = 0; j < row.length; j++) {
            const p = row[j];
            const x = M + j * (CW + GAP);

            // Image background
            doc.setFillColor(248, 248, 248);
            doc.setDrawColor(230);
            doc.setLineWidth(0.2);
            doc.roundedRect(x, y, CW, IH, 1.5, 1.5, "FD");

            // Product image (fit inside keeping aspect ratio)
            const cached = p.image_url ? imgCache[p.image_url] : null;
            if (cached?.data) {
              const pad = 3;
              const boxW = CW - pad * 2, boxH = IH - pad * 2;
              const scale = Math.min(boxW / cached.w, boxH / cached.h);
              const dw = cached.w * scale, dh = cached.h * scale;
              const dx = x + pad + (boxW - dw) / 2;
              const dy = y + pad + (boxH - dh) / 2;
              doc.addImage(cached.data, "JPEG", dx, dy, dw, dh);
            }

            // OFERTA badge
            if (p.on_sale) {
              doc.setFillColor(204, 0, 0);
              doc.roundedRect(x + CW - 16, y + 2, 14, 4.5, 1, 1, "F");
              doc.setFontSize(6.5);
              doc.setTextColor(255, 255, 255);
              doc.setFont("helvetica", "bold");
              doc.text("OFERTA", x + CW - 15, y + 5.2);
            }

            // Product info below image
            let ty = y + IH + 4;
            doc.setTextColor(30);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            const name = p.name.length > 32 ? p.name.substring(0, 30) + "…" : p.name;
            doc.text(name, x + 2, ty);

            ty += 3.8;
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(150);
            doc.text(p.sku || "", x + 2, ty);

            if (p.color) {
              const skuW = doc.getTextWidth(p.sku || "");
              doc.setTextColor(180);
              doc.text(" · " + p.color, x + 2 + skuW, ty);
            }

            ty = y + IH + TH - 1;
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30);
            doc.text(p.price ? `$${p.price.toFixed(0)}` : "—", x + 2, ty);
          }
          y += CH + RGAP;
        }
      }

      doc.save(`catalogo-reebok-${new Date().toISOString().slice(0, 10)}.pdf`);
      setToast("Catálogo descargado");
    } catch (e) {
      console.error(e);
      setToast("Error al generar PDF");
    } finally {
      setDownloading(false);
    }
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
        {uniqueColors.length > 1 && (
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Color</label>
            <select value={colorFilter} onChange={e => setColorFilter(e.target.value)}
              className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
              <option value="">Todos</option>
              {uniqueColors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {uniqueSizes.length > 1 && (
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Talla</label>
            <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)}
              className="block border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition bg-transparent">
              <option value="">Todas</option>
              {uniqueSizes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <button onClick={() => { setSaleFilter(saleFilter === "oferta" ? "" : "oferta"); setPriceFilter(""); }}
          className={`text-sm px-4 py-2 rounded-full transition font-medium mb-0.5 ${saleFilter === "oferta" ? "bg-orange-500 text-white" : "border border-gray-200 text-gray-500 hover:border-gray-400"}`}>
          Oferta
        </button>
        <button onClick={() => { setSaleFilter(saleFilter === "nuevo" ? "" : "nuevo"); setPriceFilter(""); }}
          className={`text-sm px-4 py-2 rounded-full transition font-medium mb-0.5 ${saleFilter === "nuevo" ? "bg-emerald-600 text-white" : "border border-gray-200 text-gray-500 hover:border-gray-400"}`}>
          Nuevo
        </button>
        {saleFilter === "oferta" && ofertaPrices.length > 1 && (
          <div>
            <label className="text-[10px] text-orange-400 uppercase tracking-wider">Precio</label>
            <select value={priceFilter} onChange={e => setPriceFilter(e.target.value)}
              className="block border-b border-orange-300 py-2 text-sm outline-none focus:border-orange-500 transition bg-transparent text-orange-700">
              <option value="">Todos</option>
              {ofertaPrices.map(p => <option key={p} value={p}>${p.toFixed(0)}</option>)}
            </select>
          </div>
        )}
        {(searchInput || gender || category || saleFilter || colorFilter || sizeFilter) && (
          <button onClick={() => { setSearchInput(""); setSearch(""); setGender(""); setCategory(""); setSaleFilter(""); setPriceFilter(""); setColorFilter(""); setSizeFilter(""); setSortBy("relevancia"); }} className="text-sm text-gray-400 hover:text-black transition py-2 mb-0.5">Limpiar</button>
        )}
        <div className="flex items-center gap-2 ml-auto mb-1">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-gray-400 transition bg-transparent text-gray-500">
            <option value="relevancia">Relevancia</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
            <option value="nombre-az">Nombre A-Z</option>
          </select>
          <span className="text-xs text-gray-400">{filtered.length}</span>
          {filtered.length > 0 && (
            <button onClick={handleDownloadCatalog} disabled={downloading}
              className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-full hover:border-gray-400 hover:text-black transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {downloading ? "Generando..." : "PDF"}
            </button>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
        <div className={`fade-in ${cartCount > 0 ? "pb-24" : ""}`}>
          {isGrouped ? (
            <div className="space-y-8">
              {groups.map(g => (
                <div key={g.label}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-sm font-medium text-gray-800">{g.label}</h2>
                    <div className="flex-1 border-t border-gray-100" />
                    <span className="text-xs text-gray-300">{g.items.length}</span>
                  </div>
                  <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {g.items.map(p => (
                      <ProductCard key={p.id} product={p} stock={p._stock} qty={cartMap.get(p.id) || 0} onQtyChange={handleQtyChange} disabled={!hasContext} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {paginated.map(p => (
                <ProductCard key={p.id} product={p} stock={p._stock} qty={cartMap.get(p.id) || 0} onQtyChange={handleQtyChange} disabled={!hasContext} />
              ))}
            </div>
          )}
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

      {/* ── Floating bar + Mini cart ── */}
      {cartCount > 0 && hasContext && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          {/* Backdrop when mini cart is open */}
          {miniCartOpen && (
            <div className="fixed inset-0 bg-black/20 z-[-1]" onClick={() => setMiniCartOpen(false)} />
          )}

          {/* Mini cart summary panel */}
          <div
            className="bg-white border-t border-gray-200 overflow-hidden"
            style={{ maxHeight: miniCartOpen ? "250px" : "0px", transition: "max-height 200ms ease-out" }}
          >
            <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
              <div className="px-4 pt-3 pb-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Resumen del pedido</span>
                  <button onClick={() => setMiniCartOpen(false)} className="text-gray-400 hover:text-black transition p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
                {cart.map(item => (
                  <div key={item.product_id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700 truncate mr-3">{item.name}</span>
                    <span className="text-sm tabular-nums text-gray-500 shrink-0">{"×"}{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-2 border-t border-gray-100">
              {draftId ? (
                <Link href={`/catalogo/reebok/pedido/${draftId}`} className="text-xs text-black font-medium hover:underline">
                  Ver pedido completo {"→"}
                </Link>
              ) : (
                <button onClick={handleFloatingBarClick} className="text-xs text-black font-medium hover:underline">
                  Ver pedido completo {"→"}
                </button>
              )}
            </div>
          </div>

          {/* Floating bar */}
          <div className="p-3 bg-white border-t border-gray-100 shadow-lg flex items-center gap-2">
            {/* Expandable touch zone: bultos + total */}
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
                <polyline points="18 15 12 9 6 15"/>
              </svg>
              <span>{cartCount} bulto{cartCount !== 1 ? "s" : ""}</span>
              {cartTotal > 0 && <><span className="text-gray-400">{"·"}</span><span className="font-semibold">${fmt(cartTotal)}</span></>}
            </button>

            {/* Main action button */}
            <button onClick={handleFloatingBarClick} disabled={saving}
              className={`flex-1 py-3.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition disabled:opacity-50 ${
                draftId ? "bg-black text-white hover:bg-gray-800" : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}>
              <span className="truncate">{saving ? "Guardando..." : draftId ? `Actualizar ${draftNumber}` : draftClient ? "Crear pedido" : "Crear pedido"}</span>
              <span>{"→"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
