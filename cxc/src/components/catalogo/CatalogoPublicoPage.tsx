"use client";

// Catálogo PÚBLICO (link compartible, sin login) — página única para todas las
// marcas, parametrizada por MARCA_THEME. Pipelines de datos por feature, igual
// que el grid vendedor. Confirmar pedido: crea el pedido público en el server
// (precios validados server-side), lo confirma y navega a /pedido-<marca>/[id].

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import type { CatalogoCartItem, CatalogoProducto, StockLinea } from "./types";
import { Toast } from "@/components/ui";
import CatalogoHeader from "./CatalogoHeader";
import CatalogoFilters, { type SaleFilter } from "./CatalogoFilters";
import CatalogoProductCard from "./CatalogoProductCard";
import CatalogoGroupedCard from "./CatalogoGroupedCard";
import CatalogoStickyCartBar from "./CatalogoStickyCartBar";
import {
  groupByModel, getDisplaySection, type DisplaySection, SECTION_ORDER, SECTION_LABELS,
  type GroupedProduct, type JoybeesProduct,
} from "./groupByModel";

export default function CatalogoPublicoPage({ marca }: { marca: MarcaUiKey }) {
  return <Suspense><CatalogoPublico marca={marca} /></Suspense>;
}

function CatalogoPublico({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const agrupado = theme.features.agrupacionPorModelo;
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<CatalogoProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>(
    theme.features.saleFilter ? ((searchParams.get("filter") as SaleFilter) || "") : "",
  );
  const [sortBy, setSortBy] = useState("relevancia");
  const [toast, setToast] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CatalogoCartItem[]>([]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * theme.bulto(i.category) * Number(i.unit_price || 0), 0);

  // Persist cart to localStorage
  const cartInitialized = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(theme.publicCartKey);
      if (saved) setCart(JSON.parse(saved));
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    try { localStorage.setItem(theme.publicCartKey, JSON.stringify(cart)); } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

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

  // Scroll listener
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
    if (theme.features.saleFilter && saleFilter) params.set("filter", saleFilter);
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, category, search, saleFilter]);

  // Load products
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${theme.api}/public`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        if (agrupado) {
          const prods: JoybeesProduct[] = data.products || [];
          setProducts(prods.filter(p => p.stock > 0 || p.is_regalia));
        } else if (theme.features.inventarioPorTalla) {
          const prods: CatalogoProducto[] = data.products || [];
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
              .filter(p => (p._stock || 0) > 0 || p.badge === "proximamente")
          );
        } else {
          // Grid PLANA sin inventario por talla (Tommy): el stock vive en la
          // fila del producto (columna stock, patrón Joybees) — sin /inventory.
          const prods: CatalogoProducto[] = data.products || [];
          setProducts(
            prods
              .map(p => ({ ...p, _stock: p.stock ?? 0, _sizes: [] as string[] }))
              .filter(p => (p._stock || 0) > 0 || p.badge === "proximamente")
          );
        }
      } catch {
        setProducts([]);
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state — pipeline FLAT ──
  // Orden y label de categoría desde el theme (chips de la marca): Reebok
  // conserva Calzado/Ropa/Accesorios; Tommy usa sus categorías parseadas.
  const catOrder: Record<string, number> = {};
  const catLabel: Record<string, string> = {};
  theme.filtros.categoryOptions.forEach((o, i) => {
    if (o.value) { catOrder[o.value] = i; catLabel[o.value] = o.label; }
  });

  const filtered = agrupado ? [] : products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()) || (p.color || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => theme.genero.match(p.gender, gender))
    .filter(p => !category || p.category === category)
    .filter(p => !saleFilter || p.badge === saleFilter)
    .sort((a, b) => {
      if (sortBy === "precio-asc") return (a.price || 0) - (b.price || 0);
      if (sortBy === "precio-desc") return (b.price || 0) - (a.price || 0);
      if (sortBy === "nombre-az") return a.name.localeCompare(b.name);
      const ca = catOrder[a.category || ""] ?? 9, cb = catOrder[b.category || ""] ?? 9;
      if (ca !== cb) return ca - cb;
      const ga = theme.genero.groupOrder(a.gender), gb = theme.genero.groupOrder(b.gender);
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
      const key = `${p.category}|${theme.genero.groupKey(p.gender)}`;
      if (key !== lastKey) {
        groups.push({ label: `${catLabel[p.category || ""] || p.category} — ${theme.genero.groupLabel(p.gender)}`, items: [] });
        lastKey = key;
      }
      groups[groups.length - 1].items.push(p);
    }
  }

  // ── Derived state — pipeline AGRUPADO ──
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

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function handleClearAll() {
    setSearchInput(""); setSearch(""); setGender(""); setCategory("");
    setSaleFilter(""); setSortBy("relevancia");
  }

  const [sendingOrder, setSendingOrder] = useState(false);
  const [clientName, setClientName] = useState("");
  // Aviso de stock (S2): líneas con menos piezas disponibles que las pedidas,
  // devueltas por el endpoint confirmar (409).
  const [stockAviso, setStockAviso] = useState<StockLinea[] | null>(null);
  // short_id del pedido YA creado en el server: si el cliente ve el aviso de
  // stock y luego confirma de todas formas, se reusa (no se duplica el pedido).
  const [pendingShortId, setPendingShortId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(theme.publicClientNameKey);
      if (saved) setClientName(saved);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(theme.publicClientNameKey, clientName); } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName]);

  // Si el cliente cambia el carrito o su nombre, el pedido pendiente ya no
  // representa lo que ve → se creará uno nuevo al confirmar.
  useEffect(() => {
    setPendingShortId(null);
    setStockAviso(null);
  }, [cart, clientName]);

  // Confirmar pedido (flujo nuevo): 1) crea el pedido en el server (precios
  // validados server-side), 2) lo CONFIRMA (auto-convierte a número interno) y
  // 3) lleva al cliente a su página permanente /pedido-<marca>/[short_id], donde
  // puede avisar por WhatsApp (opcional). Si hay stock corto, el server responde
  // 409 y se muestra el aviso con "Confirmar de todas formas".
  async function handleConfirmarPedido(aceptarStock = false) {
    if (cart.length === 0 || sendingOrder) return;
    const trimmedName = clientName.trim();
    if (!trimmedName) {
      setToast("Escribe tu nombre antes de confirmar el pedido");
      return;
    }
    setSendingOrder(true);
    try {
      let shortId = pendingShortId;
      if (!shortId) {
        const res = await fetch(`${theme.api}/pedido-publico`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: cart, cliente_nombre: trimmedName }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.short_id) {
          setToast((data?.error as string) || "Error al enviar el pedido. Intenta de nuevo.");
          return;
        }
        shortId = data.short_id as string;
        setPendingShortId(shortId);
      }

      const conf = await fetch(`${theme.api}/pedido-publico/${shortId}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aceptar_stock: aceptarStock }),
      });
      const confData = await conf.json().catch(() => null);
      if (conf.status === 409 && confData?.lineas) {
        setStockAviso(confData.lineas as StockLinea[]);
        return;
      }
      if (!conf.ok || !confData?.numero) {
        setToast((confData?.error as string) || "No se pudo confirmar el pedido. Intenta de nuevo.");
        return;
      }

      // Confirmado → vaciar carrito y abrir su página permanente del pedido.
      setCart([]);
      try { localStorage.removeItem(theme.publicCartKey); } catch { /* */ }
      window.location.href = `${theme.pedidoPublicoBase}/${shortId}`;
    } catch {
      setToast("Error al enviar el pedido. Intenta de nuevo.");
    } finally {
      setSendingOrder(false);
    }
  }

  function handleClearCart() {
    setCart([]);
    try { localStorage.removeItem(theme.publicCartKey); } catch { /* */ }
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
      <div className={theme.grid.emptyIconWrap}>{theme.grid.emptyIcon}</div>
      <p className={theme.grid.emptyText}>No encontramos productos con estos filtros</p>
      <button onClick={handleClearAll} className={theme.grid.emptyClear}>
        Limpiar filtros
      </button>
    </div>
  );

  // Product grid
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
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={theme.grid.pageBg}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <CatalogoHeader marca={marca} variant="public" />

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

        {loading ? skeletonGrid : filteredCount === 0 ? emptyState : productGrid}

        <Toast message={toast} />

        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={theme.grid.scrollTopBtn}
          >
            &uarr;
          </button>
        )}

        <CatalogoStickyCartBar
          marca={marca}
          cart={cart}
          cartCount={cartCount}
          cartTotal={cartTotal}
          onQtyChange={handleQtyChange}
          onClearCart={handleClearCart}
          variant="public"
          onSubmitOrder={() => handleConfirmarPedido(false)}
          clientName={clientName}
          onClientNameChange={setClientName}
          saving={sendingOrder}
          actionLabel={sendingOrder ? theme.publico.confirmingLabel : undefined}
          formatTotal={fmt}
        />

        {stockAviso && stockAviso.length > 0 && (
          <div
            className={theme.stockAviso.panel}
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <p className={theme.stockAviso.title}>Algunos productos no tienen todas las piezas disponibles</p>
            <ul className="mt-1.5 mb-2 space-y-0.5 max-h-32 overflow-y-auto">
              {stockAviso.map((l) => (
                <li key={l.product_id} className={theme.stockAviso.line}>
                  <span className="font-medium">{l.name}</span> — pediste {l.pedido_pzas} pzas, hay {l.disponible_pzas}
                </li>
              ))}
            </ul>
            <p className={theme.stockAviso.note}>
              Puedes confirmarlo igual y te contactamos por la diferencia.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirmarPedido(true)}
                disabled={sendingOrder}
                className={theme.stockAviso.confirmBtn}
              >
                {sendingOrder ? "Confirmando..." : "Confirmar de todas formas"}
              </button>
              <button
                onClick={() => setStockAviso(null)}
                disabled={sendingOrder}
                className={theme.stockAviso.cancelBtn}
              >
                Cambiar mi pedido
              </button>
            </div>
          </div>
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
