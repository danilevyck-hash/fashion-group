"use client";

// Grid del catálogo VENDEDOR (con sesión) — página única para todas las marcas,
// parametrizada por MARCA_THEME. Pipelines de datos por feature:
//   · flat (Reebok): products + inventory por talla, secciones categoría+género.
//   · agrupado (Joybees): groupByModel + secciones por género (SECTION_ORDER).
// El carrito vive en storage (keys históricas por marca) y el pedido nace en
// el CHECKOUT (rediseño 5-jul) — cero llamadas en vivo a Switch desde aquí.

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import type { CatalogoCartItem, CatalogoProducto } from "./types";
import { matchesGenderFilter, genderGroupKey, genderGroupLabel, genderGroupOrder, genderFilterLabel } from "@/lib/reebok-gender";
import { Toast } from "@/components/ui";
import CatalogoHeader from "./CatalogoHeader";
import CatalogoSyncNow from "@/components/shared/CatalogoSyncNow";
import CatalogoFilters, { type SaleFilter } from "./CatalogoFilters";
import CatalogoProductCard from "./CatalogoProductCard";
import CatalogoGroupedCard from "./CatalogoGroupedCard";
import CatalogoStickyCartBar from "./CatalogoStickyCartBar";
import {
  groupByModel, getDisplaySection, type DisplaySection, SECTION_ORDER, SECTION_LABELS,
  type GroupedProduct, type JoybeesProduct,
} from "./groupByModel";

export default function CatalogoVendedorPage({ marca }: { marca: MarcaUiKey }) {
  return <Suspense><CatalogoVendedor marca={marca} /></Suspense>;
}

function CatalogoVendedor({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const agrupado = theme.features.agrupacionPorModelo;
  const searchParams = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<CatalogoProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("");
  const [sortBy, setSortBy] = useState("relevancia");
  const [toast, setToast] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // ── State: cart ──
  const [cart, setCart] = useState<CatalogoCartItem[]>([]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * theme.bulto(i.category) * Number(i.unit_price || 0), 0);

  // ── On mount: hidratar el carrito (session → localStorage según marca). ──
  useEffect(() => {
    try {
      const raw =
        (theme.cartKeySession ? sessionStorage.getItem(theme.cartKeySession) : null) ||
        localStorage.getItem(theme.cartKeyLocal);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.length > 0) setCart(parsed);
    } catch { /* data corrupta — carrito vacío */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cartInitialized = useRef(false);
  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    if (theme.cartKeySession) sessionStorage.setItem(theme.cartKeySession, JSON.stringify(cart));
    try {
      localStorage.setItem(theme.cartKeyLocal, JSON.stringify(cart));
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  // Stock: el del sync nocturno (<24h) — decisión de Daniel 5-jul: CERO
  // llamadas en vivo a Switch desde el catálogo.
  const handleQtyChange = useCallback((productId: string, qty: number, product: CatalogoProducto) => {
    setCart(prev => {
      if (qty <= 0) return prev.filter(i => i.product_id !== productId);
      const idx = prev.findIndex(i => i.product_id === productId);
      if (idx >= 0) return prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item);
      const nuevo: CatalogoCartItem = {
        product_id: productId,
        sku: product.sku || "",
        name: product.name,
        image_url: product.image_url || "",
        quantity: qty,
        unit_price: product.price || 0,
      };
      if (!agrupado) {
        nuevo.category = product.category;
        if (theme.features.preorder) nuevo.is_preorder = product.badge === "proximamente";
      }
      return [...prev, nuevo];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agrupado]);

  // ── Barra: al checkout (el pedido se crea y envía a Switch allá) ──
  function goCheckout() {
    if (cart.length === 0) return;
    router.push(theme.checkoutHref);
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
    if (agrupado) {
      try {
        const res = await fetch(`${theme.api}/products?active=true`);
        if (!res.ok) throw new Error("fetch failed");
        const data: JoybeesProduct[] = await res.json();
        setProducts(data.filter(p => p.stock > 0 || p.is_regalia));
      } catch {
        setProducts([]);
      }
    } else {
      try {
        const [pRes, iRes] = await Promise.all([
          fetch(`${theme.api}/products?active=true`),
          fetch(`${theme.api}/inventory`),
        ]);
        const prods: CatalogoProducto[] = pRes.ok ? await pRes.json() : [];
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
        setProducts(prods.map(p => ({ ...p, _stock: stockMap[p.id] || 0, _sizes: [...(sizesMap[p.id] || [])] })).filter(p => (p._stock || 0) > 0 || p.badge === "proximamente"));
      } catch { setProducts([]); }
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agrupado]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ── Derived state — pipeline FLAT (categoría + género) ──
  const catOrder: Record<string, number> = { footwear: 0, apparel: 1, accessories: 2 };
  const catLabel: Record<string, string> = { footwear: "Calzado", apparel: "Ropa", accessories: "Accesorios" };

  const filtered = agrupado ? [] : products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()) || (p.color || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => matchesGenderFilter(p.gender, gender))
    .filter(p => !category || p.category === category)
    .filter(p => !saleFilter || p.badge === saleFilter)
    .sort((a, b) => {
      if (sortBy === "precio-asc") return (a.price || 0) - (b.price || 0);
      if (sortBy === "precio-desc") return (b.price || 0) - (a.price || 0);
      if (sortBy === "nombre-az") return a.name.localeCompare(b.name);
      const ca = catOrder[a.category || ""] ?? 9, cb = catOrder[b.category || ""] ?? 9;
      if (ca !== cb) return ca - cb;
      const ga = genderGroupOrder(a.gender), gb = genderGroupOrder(b.gender);
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });

  const isGrouped = sortBy === "relevancia";
  const cartMap = new Map(cart.map(i => [i.product_id, i.quantity]));

  type Group = { label: string; items: typeof filtered };
  const groups: Group[] = [];
  if (!agrupado) {
    let lastKey = "";
    for (const p of filtered) {
      const key = `${p.category}|${genderGroupKey(p.gender)}`;
      if (key !== lastKey) {
        groups.push({ label: `${catLabel[p.category || ""] || p.category} — ${genderGroupLabel(p.gender)}`, items: [] });
        lastKey = key;
      }
      groups[groups.length - 1].items.push(p);
    }
  }

  // ── Derived state — pipeline AGRUPADO (groupByModel + secciones) ──
  const allGrouped = agrupado ? groupByModel(
    (products as JoybeesProduct[])
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
      .filter(p => !category || p.category === category)
  ) : [];

  const groupsWithSection = allGrouped.map(g => ({ group: g, section: getDisplaySection(g) }));
  const filteredGroups = groupsWithSection.filter(gs => !gender || gs.section === gender);
  const sortedGroups = [...filteredGroups].sort((a, b) => {
    if (sortBy === "precio-asc") return (a.group.price || 0) - (b.group.price || 0);
    if (sortBy === "precio-desc") return (b.group.price || 0) - (a.group.price || 0);
    if (sortBy === "nombre-az") return a.group.name.localeCompare(b.group.name);
    const sa = (SECTION_ORDER[a.section] ?? 99) - (SECTION_ORDER[b.section] ?? 99);
    if (sa !== 0) return sa;
    return a.group.name.localeCompare(b.group.name);
  });

  type SectionGroup = { label: string; section: DisplaySection; items: GroupedProduct[] };
  const sections: SectionGroup[] = [];
  if (agrupado && isGrouped) {
    for (const gs of sortedGroups) {
      const last = sections[sections.length - 1];
      if (last && last.section === gs.section) {
        last.items.push(gs.group);
      } else {
        sections.push({ label: SECTION_LABELS[gs.section], section: gs.section, items: [gs.group] });
      }
    }
  }

  const filteredCount = agrupado ? sortedGroups.length : filtered.length;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: theme.vendorFmtDecimals, maximumFractionDigits: theme.vendorFmtDecimals });

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
    if (theme.features.saleFilter && saleFilter) params.set("filter", saleFilter);
    const qs = params.toString();
    const url = `${theme.publicoShareUrl}${qs ? `?${qs}` : ""}`;
    navigator.clipboard.writeText(url).then(() => {
      setToast("Link copiado");
    }).catch(() => {
      setToast("No se pudo copiar el link");
    });
    setShowShareMenu(false);
  }

  async function handleDownloadCatalog() {
    if ((agrupado ? !sortedGroups.length : !filtered.length) || downloading) return;

    setDownloading(true);
    setToast("Generando catalogo PDF...");

    try {
      // Lib compartida de todas las marcas (src/lib/catalogo/catalog-pdf.ts).
      const { downloadCatalogPdf } = await import("@/lib/catalogo/catalog-pdf");

      const filterDesc: string[] = [];
      if (agrupado) {
        if (gender) filterDesc.push(SECTION_LABELS[gender as DisplaySection] || gender);
        if (category) filterDesc.push(category);
        if (search) filterDesc.push(`“${search}”`);
      } else {
        if (gender) filterDesc.push(genderFilterLabel(gender));
        if (category) filterDesc.push(catLabel[category] || category);
        if (saleFilter === "oferta") filterDesc.push("Oferta");
        if (saleFilter === "nuevo") filterDesc.push("Nuevo");
        if (search) filterDesc.push(`“${search}”`);
      }
      const subtitle = filterDesc.length > 0 ? filterDesc.join("  ·  ") : "Todos los productos";

      let pdfSections: { label: string; items: { name: string; sku: string; color?: string | null; price: number | null; image_url: string | null; badge: string | null }[] }[];
      if (agrupado) {
        // Secciones canónicas por SECTION_ORDER (mismo orden que la vista).
        const bySection = new Map<DisplaySection, GroupedProduct[]>();
        for (const gs of sortedGroups) {
          if (!bySection.has(gs.section)) bySection.set(gs.section, []);
          bySection.get(gs.section)!.push(gs.group);
        }
        pdfSections = [...bySection.entries()]
          .sort((a, b) => (SECTION_ORDER[a[0]] ?? 99) - (SECTION_ORDER[b[0]] ?? 99))
          .map(([section, groups]) => ({
            label: SECTION_LABELS[section] || section,
            items: groups.map(g => ({
              name: g.name, sku: g.baseSku, price: g.price,
              image_url: g.image_url, badge: null,
            })),
          }));
      } else {
        // Agrupación canónica (women+female → Mujer; unisex propio). "otros" cierra
        // el catch-all para que ningún producto con género no contemplado se caiga
        // del PDF en silencio.
        const genders = [
          { key: "hombre", label: "HOMBRE" },
          { key: "mujer", label: "MUJER" },
          { key: "ninos", label: "NIÑOS" },
          { key: "unisex", label: "UNISEX" },
          { key: "otros", label: "OTROS" },
        ];
        pdfSections = genders.map(g => ({
          label: g.label,
          items: filtered.filter(p => genderGroupKey(p.gender) === g.key).map(p => ({
            name: p.name, sku: p.sku || "", color: p.color, price: p.price,
            image_url: p.image_url || null, badge: p.badge ?? null,
          })),
        }));
      }

      await downloadCatalogPdf({
        marca,
        sections: pdfSections,
        subtitle,
        totalCount: filteredCount,
        filename: `catalogo-${marca}-${new Date().toISOString().slice(0, 10)}.pdf`,
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
    if (theme.cartKeySession) sessionStorage.removeItem(theme.cartKeySession);
    try { localStorage.removeItem(theme.cartKeyLocal); } catch { /* */ }
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
      <div className={theme.grid.emptyIconWrap}>{theme.grid.emptyIcon}</div>
      <p className={theme.grid.emptyText}>No encontramos productos con estos filtros</p>
      <button onClick={handleClearAll} className={theme.grid.emptyClear}>
        Limpiar filtros
      </button>
    </div>
  );

  // Grid
  const productGrid = (
    <div className={`${cartCount > 0 ? "pb-28" : ""}`}>
      {agrupado ? (
        isGrouped ? (
          <div className="space-y-8">
            {sections.map(s => (
              <div key={s.section}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className={theme.grid.sectionTitle}>{s.label}</h2>
                  <div className={theme.grid.sectionRule} />
                  <span className={theme.grid.sectionCount}>{s.items.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {s.items.map(g => (
                    <CatalogoGroupedCard
                      key={g.baseSku}
                      marca={marca}
                      group={g}
                      cartMap={cartMap}
                      onQtyChange={handleQtyChange}
                      showBultos
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {sortedGroups.map(gs => (
              <CatalogoGroupedCard
                key={gs.group.baseSku}
                marca={marca}
                group={gs.group}
                cartMap={cartMap}
                onQtyChange={handleQtyChange}
              />
            ))}
          </div>
        )
      ) : isGrouped ? (
        <div className="space-y-8">
          {groups.map(g => (
            <div key={g.label}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className={theme.grid.sectionTitle}>{g.label}</h2>
                <div className={theme.grid.sectionRule} />
                <span className={theme.grid.sectionCount}>{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {g.items.map(p => (
                  <CatalogoProductCard
                    key={p.id}
                    marca={marca}
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
            <CatalogoProductCard
              key={p.id}
              marca={marca}
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

  // Menú compartir (mismo dropdown, clases por tema — ver theme.vendorShare).
  const shareMenu = (
    <div className="relative" ref={shareRef}>
      <button onClick={() => setShowShareMenu(prev => !prev)} className={theme.vendorShare.btn}>
        <svg xmlns="http://www.w3.org/2000/svg" width={theme.vendorShare.iconSize} height={theme.vendorShare.iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Compartir
      </button>
      {showShareMenu && (
        <div className={theme.vendorShare.panel}>
          <button onClick={handleCopyLink} className={theme.vendorShare.item}>
            <svg xmlns="http://www.w3.org/2000/svg" width={theme.vendorShare.iconSize} height={theme.vendorShare.iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {theme.vendorShare.copyLabel}
          </button>
          <button onClick={() => { setShowShareMenu(false); handleDownloadCatalog(); }} disabled={downloading}
            className={`${theme.vendorShare.item} disabled:opacity-40 disabled:cursor-not-allowed`}>
            <svg xmlns="http://www.w3.org/2000/svg" width={theme.vendorShare.iconSize} height={theme.vendorShare.iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {downloading ? "Generando..." : "Descargar PDF"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={theme.grid.pageBg}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {theme.vendorShare.enHeader ? (
          /* Layout heredado Joybees: header + [Ver pedido | Compartir] arriba */
          <div className="flex items-start justify-between">
            <CatalogoHeader marca={marca} variant="vendor" />
            <div className="flex items-center gap-2">
              {cartCount > 0 && (
                <button onClick={goCheckout} className={theme.vendorShare.verPedidoBtn!}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  Ver pedido
                </button>
              )}
              {shareMenu}
            </div>
          </div>
        ) : (
          <CatalogoHeader marca={marca} variant="vendor" />
        )}

        {/* ── Filters ── */}
        <CatalogoFilters
          marca={marca}
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          gender={gender}
          onGenderChange={setGender}
          category={category}
          onCategoryChange={setCategory}
          saleFilter={saleFilter}
          onSaleFilterChange={theme.features.saleFilter ? setSaleFilter : undefined}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          filteredCount={filteredCount}
          onClearAll={handleClearAll}
        />

        {/* ── Sync + Share/Download row ── */}
        <div className="flex items-center justify-between gap-2 mb-4">
          {/* "Actualizar ahora" del catálogo (solo con sesión admin/secretaria/
              vendedor — el catálogo público jamás lo ve). */}
          <CatalogoSyncNow catalogo={marca} onSuccess={loadProducts} />
          {!theme.vendorShare.enHeader && filteredCount > 0 && shareMenu}
        </div>

        {/* ── Grid ── */}
        {loading ? skeletonGrid : filteredCount === 0 ? emptyState : productGrid}

        <Toast message={toast} />

        {showScrollTop && (
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={theme.grid.scrollTopBtn}>&uarr;</button>
        )}

        {/* ── Sticky cart bar ── */}
        {cartCount > 0 && (
          <CatalogoStickyCartBar
            marca={marca}
            cart={cart}
            cartCount={cartCount}
            cartTotal={cartTotal}
            onQtyChange={handleQtyChange}
            onClearCart={handleClearCart}
            variant="vendor"
            onCreateOrder={goCheckout}
            saving={false}
            actionLabel="Ver pedido"
            actionColor={theme.vendorShare.stickyActionColor ?? undefined}
            formatTotal={fmt}
          />
        )}
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
