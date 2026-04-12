"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Product } from "@/components/reebok/supabase";
import { getBultoSize } from "@/lib/reebok-bulto";
import NewOrderModal from "@/components/reebok/NewOrderModal";
import { Toast } from "@/components/ui";
import CatalogHeader from "@/components/reebok/CatalogHeader";
import CatalogFilters from "@/components/reebok/CatalogFilters";
import CatalogProductCard from "@/components/reebok/CatalogProductCard";
import StickyCartBar from "@/components/reebok/StickyCartBar";

interface CartItem { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; category: string; }

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
  const [saleFilter, setSaleFilter] = useState<"" | "oferta" | "nuevo">("");
  // color/size/price filters removed — kept simple
  const [sortBy, setSortBy] = useState("relevancia");
  const [toast, setToast] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const PAGE_SIZE = 24;

  // ── State: cart + draft context ──
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draftClient, setDraftClient] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState("");
  const [draftOriginalIds, setDraftOriginalIds] = useState<Set<string>>(new Set());

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * getBultoSize(i.category) * Number(i.unit_price || 0), 0);

  const [restoredDraftBanner, setRestoredDraftBanner] = useState<string | null>(null);

  // ── On mount: determine mode from sessionStorage, fallback to localStorage ──
  useEffect(() => {
    const existingDraftId = sessionStorage.getItem("reebok_draft_id");
    const newClient = sessionStorage.getItem("reebok_draft_client");

    if (existingDraftId) {
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
      setDraftClient(newClient);
      try {
        const saved = sessionStorage.getItem("reebok_cart");
        if (saved) setCart(JSON.parse(saved));
      } catch { /* corrupt data — ignore */ }
    } else {
      try {
        const lsClient = localStorage.getItem("reebok_draft_client");
        const lsCart = localStorage.getItem("reebok_cart");
        if (lsClient && lsCart) {
          const parsed = JSON.parse(lsCart);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRestoredDraftBanner(lsClient);
            return;
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

  const cartInitialized = useRef(false);
  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    sessionStorage.setItem("reebok_cart", JSON.stringify(cart));
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
      return [...prev, { product_id: productId, sku: product.sku || "", name: product.name, image_url: product.image_url || "", quantity: qty, unit_price: product.price || 0, category: product.category }];
    });
  }, []);

  // ── Floating bar action: create or update ──
  async function handleFloatingBarClick() {
    if (cart.length === 0) return;
    if (!draftId && !draftClient) { setShowNameModal(true); return; }
    setSaving(true);

    if (draftId) {
      setToast("Actualizando pedido...");
      try {
        for (const item of cart) {
          await fetch(`/api/catalogo/reebok/orders/${draftId}/item`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });
        }
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
      } catch { setToast("Sin conexion. Verifica tu internet e intenta de nuevo."); setSaving(false); }
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

  useEffect(() => { setPage(1); }, [gender, category, saleFilter, sortBy]);

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
        setProducts(prods.map(p => ({ ...p, _stock: stockMap[p.id] || 0, _sizes: [...(sizesMap[p.id] || [])] })).filter(p => p._stock > 0));
      } catch { setProducts([]); }
      setLoading(false);
    }
    load();
  }, []);

  // ── Derived state ──
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

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const hasContext = draftClient || draftId;

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
      const { jsPDF } = await import("jspdf");
      const { REEBOK_LOGO_BASE64 } = await import("@/lib/reebok-logo");

      const NAVY: [number, number, number] = [26, 38, 86];
      const RED: [number, number, number] = [228, 0, 43];
      const CREAM: [number, number, number] = [245, 240, 232];
      const GRAY_LIGHT: [number, number, number] = [160, 160, 165];
      const GRAY_MID: [number, number, number] = [120, 120, 125];
      const WHITE: [number, number, number] = [255, 255, 255];

      const PW = 215.9, PH = 279.4;
      const M = 18;
      const CONTENT_W = PW - 2 * M;
      const COLS = 3, GAP = 8;
      const CW = (CONTENT_W - (COLS - 1) * GAP) / COLS;
      const IH = 54;
      const TH = 22;
      const CH = IH + TH;
      const RGAP = 10;
      const GENDER_H = 14;
      const FOOTER_H = 10;

      function loadImg(url: string): Promise<{ data: string; w: number; h: number }> {
        return new Promise(resolve => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext("2d")!.drawImage(img, 0, 0);
            try { resolve({ data: c.toDataURL("image/jpeg", 0.82), w: img.naturalWidth, h: img.naturalHeight }); }
            catch { resolve({ data: "", w: 0, h: 0 }); }
          };
          img.onerror = () => resolve({ data: "", w: 0, h: 0 });
          img.src = url;
        });
      }

      const urls = [...new Set(items.filter(p => p.image_url).map(p => p.image_url!))];
      const imgCache: Record<string, { data: string; w: number; h: number }> = {};
      await Promise.all(urls.map(u => loadImg(u).then(r => { imgCache[u] = r; })));

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
      let y = M;
      let pageNum = 1;

      function drawFooter() {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GRAY_LIGHT);
        doc.text(`${pageNum}`, PW / 2, PH - 8, { align: "center" });
        doc.setFontSize(6);
        doc.setTextColor(...GRAY_MID);
        doc.text("Fashion Group \u2014 Panam\u00e1", PW / 2, PH - 4.5, { align: "center" });
      }

      function drawPageHeader() {
        if (REEBOK_LOGO_BASE64) {
          doc.addImage(REEBOK_LOGO_BASE64, "PNG", M, 8, 18, 5);
        }
        doc.setDrawColor(...RED);
        doc.setLineWidth(0.4);
        doc.line(M, 15, PW - M, 15);
        y = 20;
      }

      function needPage(h: number): boolean {
        if (y + h > PH - M - FOOTER_H) {
          drawFooter();
          doc.addPage();
          pageNum++;
          drawPageHeader();
          return true;
        }
        return false;
      }

      if (REEBOK_LOGO_BASE64) {
        doc.addImage(REEBOK_LOGO_BASE64, "PNG", M, y, 24, 6.7);
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text("CAT\u00c1LOGO", PW - M, y + 5.5, { align: "right" });
      y += 11;
      doc.setDrawColor(...RED);
      doc.setLineWidth(0.5);
      doc.line(M, y, PW - M, y);
      y += 6;

      const dateStr = new Date().toLocaleDateString("es-PA", {
        day: "numeric", month: "long", year: "numeric",
      });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY_MID);
      doc.text(dateStr, M, y);

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text(`${items.length} productos`, PW - M, y, { align: "right" });

      y += 5;

      const filterDesc: string[] = [];
      if (gender) filterDesc.push(genLabel[gender] || gender);
      if (category) filterDesc.push(catLabel[category] || category);
      if (saleFilter === "oferta") filterDesc.push("Oferta");
      if (saleFilter === "nuevo") filterDesc.push("Nuevo");
      if (search) filterDesc.push(`\u201c${search}\u201d`);
      const subtitle = filterDesc.length > 0 ? filterDesc.join("  \u00b7  ") : "Todos los productos";
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY_LIGHT);
      doc.text(subtitle.toUpperCase(), M, y);
      y += 8;

      const genders = [
        { key: "male", label: "HOMBRE" },
        { key: "female", label: "MUJER" },
        { key: "kids", label: "NI\u00d1OS" },
        { key: "unisex", label: "UNISEX" },
      ];

      for (const g of genders) {
        const gItems = items.filter(p => (p.gender || "unisex") === g.key);
        if (!gItems.length) continue;
        needPage(GENDER_H + CH);
        doc.setFillColor(...NAVY);
        doc.roundedRect(M, y, CONTENT_W, 8, 1, 1, "F");
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...WHITE);
        doc.text(g.label, M + 5, y + 5.8);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(200, 200, 210);
        doc.text(`${gItems.length} productos`, PW - M - 5, y + 5.8, { align: "right" });
        y += GENDER_H;

        for (let i = 0; i < gItems.length; i += COLS) {
          needPage(CH);
          const row = gItems.slice(i, i + COLS);
          for (let j = 0; j < row.length; j++) {
            const p = row[j];
            const x = M + j * (CW + GAP);
            doc.setFillColor(...CREAM);
            doc.roundedRect(x, y, CW, IH, 2, 2, "F");
            const cached = p.image_url ? imgCache[p.image_url] : null;
            if (cached?.data) {
              const pad = 4;
              const boxW = CW - pad * 2, boxH = IH - pad * 2;
              const scale = Math.min(boxW / cached.w, boxH / cached.h);
              const dw = cached.w * scale, dh = cached.h * scale;
              const dx = x + pad + (boxW - dw) / 2;
              const dy = y + pad + (boxH - dh) / 2;
              doc.addImage(cached.data, "JPEG", dx, dy, dw, dh);
            }
            if (p.on_sale) {
              doc.setFillColor(...RED);
              doc.roundedRect(x + 2, y + 2, 14, 4.5, 1, 1, "F");
              doc.setFontSize(6);
              doc.setTextColor(...WHITE);
              doc.setFont("helvetica", "bold");
              doc.text("OFERTA", x + 3.2, y + 5.2);
            } else {
              doc.setFillColor(...NAVY);
              doc.roundedRect(x + 2, y + 2, 13, 4.5, 1, 1, "F");
              doc.setFontSize(6);
              doc.setTextColor(...WHITE);
              doc.setFont("helvetica", "bold");
              doc.text("NUEVO", x + 3.2, y + 5.2);
            }
            let ty = y + IH + 5;
            doc.setTextColor(...NAVY);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            const maxNameLen = Math.floor(CW / 1.8);
            const name = p.name.length > maxNameLen
              ? p.name.substring(0, maxNameLen - 1) + "\u2026"
              : p.name;
            doc.text(name.toUpperCase(), x + 1, ty);
            ty += 4;
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...GRAY_LIGHT);
            const skuText = p.sku || "";
            const colorText = p.color ? `  \u00b7  ${p.color}` : "";
            doc.text(skuText + colorText, x + 1, ty);
            ty += 5.5;
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            if (p.on_sale) {
              doc.setTextColor(...RED);
            } else {
              doc.setTextColor(...NAVY);
            }
            doc.text(p.price ? `$${p.price.toFixed(0)}` : "\u2014", x + 1, ty);
          }
          y += CH + RGAP;
        }
      }

      drawFooter();
      doc.save(`catalogo-reebok-${new Date().toISOString().slice(0, 10)}.pdf`);
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
    <div className={`${cartCount > 0 && hasContext ? "pb-28" : ""}`}>
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
                    disabled={!hasContext}
                    showBultos
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
              disabled={!hasContext}
              showBultos
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

      {/* ── Banner: recovered draft from localStorage ── */}
      {restoredDraftBanner && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <span className="text-sm text-amber-700">Tienes un pedido sin terminar para <strong>{restoredDraftBanner}</strong>.</span>
          <div className="flex gap-2">
            <button onClick={restoreDraft} className="text-xs bg-[#1A2656] text-white px-4 py-1.5 rounded-lg hover:bg-[#0f1a3d] transition font-medium">Continuar</button>
            <button onClick={discardDraft} className="text-xs text-gray-500 hover:text-[#1A2656] transition px-2">Descartar</button>
          </div>
        </div>
      )}

      {/* ── Banner: order context ── */}
      {hasContext ? (
        <div className="flex items-center justify-between bg-white border border-[#1A2656]/10 rounded-xl px-4 py-3 mb-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            {!draftId && (
              <div className="flex items-center gap-1.5 mr-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-medium">&#10003;</span>
                <span className="w-5 h-5 rounded-full bg-[#1A2656] text-white text-[10px] flex items-center justify-center font-bold">2</span>
                <span className="text-[10px] text-[#1A2656]/30 font-medium">Paso 2 de 2</span>
              </div>
            )}
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {draftId ? (
              <>
                <span className="text-[#1A2656]/50">Editando</span>
                <span className="font-semibold text-[#1A2656]">{draftNumber}</span>
                <span className="text-[#1A2656]/30">— {draftClient}</span>
              </>
            ) : (
              <>
                <span className="text-[#1A2656]/50">Elige productos para</span>
                <span className="font-semibold text-[#1A2656]">{draftClient}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!draftId && <button onClick={() => setShowNameModal(true)} className="text-xs text-[#1A2656]/40 hover:text-[#1A2656] transition font-medium">Cambiar</button>}
            {draftId && <Link href={`/catalogo/reebok/pedido/${draftId}`} className="text-xs text-[#1A2656] font-semibold hover:underline transition">Ver pedido &rarr;</Link>}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <span className="text-sm text-amber-800">Para hacer un pedido, primero selecciona el cliente</span>
          <button onClick={() => setShowNameModal(true)} className="text-sm bg-[#1A2656] text-white px-4 py-1.5 rounded-lg hover:bg-[#0f1a3d] transition font-medium">Seleccionar cliente</button>
        </div>
      )}

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

      {/* ── Share/Download row ── */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <div className="relative" ref={shareRef}>
            <button onClick={() => setShowShareMenu(prev => !prev)}
              className="text-xs border border-[#1A2656]/10 text-[#1A2656]/40 px-3 py-1.5 rounded-lg hover:border-[#1A2656]/25 hover:text-[#1A2656]/60 transition flex items-center gap-1.5 min-h-[32px]">
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
        </div>
      )}

      {/* ── Grid ── */}
      {loading ? skeletonGrid : filtered.length === 0 ? emptyState : productGrid}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8 mb-4">
          <button onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={page === 1}
            className="text-xs font-semibold uppercase tracking-wider text-[#1A2656] px-4 py-2.5 rounded-lg border border-[#1A2656]/15 hover:border-[#1A2656]/30 transition disabled:opacity-25 disabled:cursor-not-allowed min-h-[44px]">&larr; Anterior</button>
          <span className="text-xs text-[#1A2656]/35 tabular-nums font-medium">{page} / {totalPages}</span>
          <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={page === totalPages}
            className="text-xs font-semibold uppercase tracking-wider text-[#1A2656] px-4 py-2.5 rounded-lg border border-[#1A2656]/15 hover:border-[#1A2656]/30 transition disabled:opacity-25 disabled:cursor-not-allowed min-h-[44px]">Siguiente &rarr;</button>
        </div>
      )}

      <Toast message={toast} />

      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-4 z-30 w-10 h-10 bg-white border border-[#1A2656]/10 rounded-full shadow-md flex items-center justify-center text-[#1A2656]/40 hover:text-[#1A2656] transition min-w-[44px] min-h-[44px]">&uarr;</button>
      )}

      {/* ── Name modal (when no context) ── */}
      {showNameModal && (
        <NewOrderModal onClose={() => setShowNameModal(false)} />
      )}

      {/* ── Sticky cart bar ── */}
      {cartCount > 0 && hasContext && (
        <StickyCartBar
          cart={cart}
          cartCount={cartCount}
          cartTotal={cartTotal}
          onQtyChange={handleQtyChange}
          onClearCart={handleClearCart}
          variant="vendor"
          onCreateOrder={handleFloatingBarClick}
          saving={saving}
          actionLabel={saving ? "Guardando..." : draftId ? `Actualizar ${draftNumber}` : "Crear pedido"}
          actionColor={draftId ? "bg-[#1A2656] hover:bg-[#0f1a3d]" : "bg-[#E4002B] hover:bg-[#c90025]"}
          miniCartLink={
            draftId ? (
              <Link href={`/catalogo/reebok/pedido/${draftId}`} className="text-xs text-[#1A2656] font-semibold hover:underline">
                Ver pedido &rarr;
              </Link>
            ) : undefined
          }
          formatTotal={fmt}
        />
      )}
    </div>
    </div>
  );
}
