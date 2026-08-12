"use client";

// Catálogo PÚBLICO (link compartible, sin login) — página única para todas las
// marcas, parametrizada por MARCA_THEME. Pipelines de datos por feature, igual
// que el grid vendedor. Confirmar pedido: crea el pedido público en el server
// (precios validados server-side), lo confirma y navega a /pedido-<marca>/[id].

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { resumirDesdeItems } from "@/lib/catalogo/lineas-pedido";
import { useSearchParams } from "next/navigation";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { validarNombreCliente } from "@/lib/catalogo/nombre-cliente";
import { disponibleVendible } from "@/lib/catalogos/disponible";
import {
  cumpleBultosMinimos, precioEnRango, esPrecioRango, type PrecioRango,
} from "@/lib/catalogo/filtros-extra";
import type { CatalogoCartItem, CatalogoProducto } from "./types";
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
import { precioTexto } from "@/lib/catalogo/precio";
import { opcionesConDatos } from "@/lib/catalogo/filtros-derivados";
import { leerCarrito, guardarCarrito, limpiarCarrito } from "@/lib/catalogo/carrito";

// Fotos que se piden YA (eager + fetchpriority=high) al abrir el catálogo: las
// del primer viewport. A 1440px el grid es de 5 columnas → 10 cards visibles;
// el resto va lazy y solo baja al hacer scroll (medido: la carga inicial pasa de
// cientos de fotos a ~10). Ver PR de la card unificada.
const FOTOS_PRIORITARIAS = 10;

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
  // Filtros extra (hoy solo Tommy). El valor del query es dato no confiable:
  // el rango se valida contra las opciones reales antes de entrar al estado.
  const [bultosFilter, setBultosFilter] = useState(
    theme.features.filtroBultos ? searchParams.get("bultos") === "1" : false,
  );
  const [precioRango, setPrecioRango] = useState<PrecioRango>(
    theme.features.filtroPrecio && esPrecioRango(searchParams.get("precio"))
      ? (searchParams.get("precio") as PrecioRango)
      : "",
  );
  const [sortBy, setSortBy] = useState("relevancia");
  const [toast, setToast] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CatalogoCartItem[]>([]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = resumirDesdeItems(cart, { bultoSize: theme.bulto }).total;

  // El carrito vive en la SESIÓN de la pestaña, igual que el del vendedor
  // (lib/catalogo/carrito.ts): sobrevive un refresh o irse a mirar otra cosa y
  // volver, y muere al cerrar la pestaña. Un cliente que abre el link dos
  // semanas después arranca en blanco — que es justo lo que se pidió: entrar,
  // hacer el pedido e irse. Su NOMBRE sí sigue en localStorage: no es una
  // selección que confunda, es no volver a teclear quién es.
  const cartInitialized = useRef(false);
  useEffect(() => {
    const items = leerCarrito<CatalogoCartItem>(theme.publicCartKey);
    if (items.length > 0) setCart(items);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    guardarCarrito(theme.publicCartKey, cart);
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
        // Tommy: se CONGELA en la línea. Si el estilo se re-marca de 12 a 8
        // mientras el cliente arma el pedido, lo que ya agregó sigue cotizando
        // como cuando lo vio.
        nuevo.bulto_pzas = product.bulto_pzas ?? null;
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
    if (theme.features.filtroBultos && bultosFilter) params.set("bultos", "1");
    if (theme.features.filtroPrecio && precioRango) params.set("precio", precioRango);
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, category, search, saleFilter, bultosFilter, precioRango]);

  // Load products
  // `loadError` separa "no cargó" de "no hay resultados": hasta jul-2026 el
  // catch dejaba products=[] y el cliente veía "No encontramos productos con
  // estos filtros" con CERO filtros puestos — un botón "Limpiar filtros" que
  // no arreglaba nada. En 4G panameño el fetch se cae, y ese es justo el
  // momento en que el texto tiene que decir la verdad y ofrecer reintentar.
  const [loadError, setLoadError] = useState(false);
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(`${theme.api}/public`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        // En las 3 marcas `_stock` es DISPONIBILIDAD (lo vendible = saldo −
        // apartado), no existencia: mostrarle al cliente saldo físico le
        // ofrece mercancía ya apartada para otro. Regla única en
        // lib/catalogos/disponible (cae a existencia si el sync todavía no
        // escribió la columna, para no esconder producto por un dato faltante).
        if (agrupado) {
          const prods: JoybeesProduct[] = data.products || [];
          setProducts(prods.filter(p => disponibleVendible(p) > 0 || p.is_regalia));
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
          // Reebok: `inventory.quantity` es EXISTENCIA (el sync escribe
          // quantity: existencia bajo la talla "UNICA"), así que solo sirve de
          // fallback y para las tallas; la disponibilidad correcta es la
          // agregada de la fila del producto.
          setProducts(
            prods
              .map(p => ({
                ...p,
                _stock: disponibleVendible(p, stockMap[p.id] ?? 0),
                _sizes: [...(sizesMap[p.id] || [])],
              }))
              .filter(p => (p._stock || 0) > 0 || p.badge === "proximamente")
          );
        } else {
          // Grid PLANA sin inventario por talla (Tommy): el stock vive en la
          // fila del producto (patrón Joybees) — sin /inventory.
          const prods: CatalogoProducto[] = data.products || [];
          setProducts(
            prods
              .map(p => ({ ...p, _stock: disponibleVendible(p), _sizes: [] as string[] }))
              .filter(p => (p._stock || 0) > 0 || p.badge === "proximamente")
          );
        }
      } catch {
        setProducts([]);
        setLoadError(true);
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reintento]);

  // ── Derived state — pipeline FLAT ──
  // Orden y label de categoría desde el theme (chips de la marca): Reebok
  // conserva Calzado/Ropa/Accesorios; Tommy usa sus categorías parseadas.
  const catOrder: Record<string, number> = {};
  const catLabel: Record<string, string> = {};
  theme.filtros.categoryOptions.forEach((o, i) => {
    if (o.value) { catOrder[o.value] = i; catLabel[o.value] = o.label; }
  });

  // ── Píldoras de género/categoría DERIVADAS de lo que hay ──────────────────
  // Una opción sin ni un producto detrás no se dibuja (Daniel, 12-ago-2026:
  // "veo filtro de boots, pero no veo ninguna con boots") y vuelve sola el día
  // que entre el primero, por el cron o por "Actualizar ahora". El ORDEN y las
  // etiquetas los sigue mandando el tema; los datos solo deciden la presencia.
  //
  // 🔑 Se calcula sobre el catálogo COMPLETO, nunca sobre `filtered`: atado a
  // los otros filtros, las píldoras aparecerían y desaparecerían mientras se
  // usa la pantalla, y elegir un género dejaría la categoría en una sola opción.
  const gruposParaGenero = useMemo(
    () => (agrupado ? groupByModel(products as JoybeesProduct[]) : []),
    [agrupado, products],
  );
  const generoOptions = useMemo(
    () => opcionesConDatos({
      opciones: theme.filtros.genderOptions,
      valorElegido: gender,
      hayProductos: products.length > 0,
      // Cada marca pregunta COMO FILTRA: Joybees agrupa por modelo y su género
      // es la sección del grupo; las demás lo miran producto a producto con
      // `theme.genero.match`. Escribir acá una tercera regla propia sería la
      // deriva que el módulo de temas existe para evitar — y una píldora que
      // aparece pero no filtra nada es peor que una que sobra.
      tieneAlguno: agrupado
        ? (v) => gruposParaGenero.some(g => getDisplaySection(g) === v)
        : (v) => products.some(p => theme.genero.match(p.gender, v)),
    }),
    [theme, gender, products, agrupado, gruposParaGenero],
  );
  const categoryOptions = useMemo(
    () => opcionesConDatos({
      opciones: theme.filtros.categoryOptions,
      valorElegido: category,
      hayProductos: products.length > 0,
      tieneAlguno: (v) => products.some(p => p.category === v),
    }),
    [theme, category, products],
  );

  const filtered = agrupado ? [] : products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()) || (p.color || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => theme.genero.match(p.gender, gender))
    .filter(p => !category || p.category === category)
    .filter(p => !saleFilter || p.badge === saleFilter)
    // Filtros extra (Tommy). Bultos: se mide contra la DISPONIBILIDAD (lo
    // vendible), nunca la existencia, y el tamaño de bulto sale del tema —
    // el 12 no se escribe a mano. Precio: por PIEZA, no por bulto.
    .filter(p => !bultosFilter || cumpleBultosMinimos(disponibleVendible(p), theme.bulto(p.category, p.bulto_pzas)))
    .filter(p => precioEnRango(p.price, precioRango))
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

  // Precio de catálogo, igual en las 3 marcas: sin `.00` y sin redondear.
  const fmt = precioTexto;

  function handleClearAll() {
    setSearchInput(""); setSearch(""); setGender(""); setCategory("");
    setSaleFilter(""); setBultosFilter(false); setPrecioRango("");
    setSortBy("relevancia");
  }

  const [sendingOrder, setSendingOrder] = useState(false);
  const [clientName, setClientName] = useState("");
  // short_id del pedido YA creado en el server: si la confirmación falla y el
  // cliente reintenta, se reusa (no se duplica el pedido).
  const [pendingShortId, setPendingShortId] = useState<string | null>(null);

  // Confirmar desde el catálogo hace DOS llamadas (crear + confirmar) y la
  // segunda sale a Switch: son ~5 s en los que cerrar la pestaña deja el
  // pedido a medias. La página del pedido ya avisaba y frenaba el cierre; este
  // camino —el que usa TODO el mundo— no hacía ninguna de las dos cosas.
  useEffect(() => {
    if (!sendingOrder) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sendingOrder]);

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
  }, [cart, clientName]);

  // Confirmar pedido: 1) crea el pedido en el server (precios validados
  // server-side), 2) lo CONFIRMA (auto-convierte a número interno y lo manda a
  // Switch) y 3) lleva al cliente a su página permanente
  // /pedido-<marca>/[short_id], donde ve la cantidad real disponible y puede
  // avisar por WhatsApp (opcional).
  // SIN modal de stock (25-jul-2026): si algún producto tiene menos piezas, el
  // pedido entra igual y la cantidad REAL se muestra en la página del pedido.
  async function handleConfirmarPedido() {
    if (cart.length === 0 || sendingOrder) return;
    // Nombre OBLIGATORIO — misma regla que el server (lib/catalogo/
    // nombre-cliente): la barra ya bloquea el botón y escribe el motivo; esto
    // es el cinturón por si el estado llega sucio desde localStorage.
    const nombre = validarNombreCliente(clientName);
    if (!nombre.ok) {
      setToast(nombre.error);
      return;
    }
    const trimmedName = nombre.nombre;
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
        body: "{}",
      });
      const confData = await conf.json().catch(() => null);
      if (!conf.ok || !confData?.numero) {
        setToast((confData?.error as string) || "No se pudo confirmar el pedido. Intenta de nuevo.");
        return;
      }

      // Confirmado → vaciar carrito y abrir su página permanente del pedido.
      setCart([]);
      limpiarCarrito(theme.publicCartKey);
      window.location.href = `${theme.pedidoPublicoBase}/${shortId}`;
    } catch {
      setToast("Error al enviar el pedido. Intenta de nuevo.");
    } finally {
      setSendingOrder(false);
    }
  }

  function handleClearCart() {
    setCart([]);
    limpiarCarrito(theme.publicCartKey);
  }

  // Skeleton loading
  const skeletonGrid = (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
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

  // ¿El cliente puso ALGÚN filtro? Decide cuál de los tres vacíos se muestra.
  const hayFiltros = !!(
    search || gender || category || saleFilter || bultosFilter || precioRango
  );

  // Tres estados distintos, porque las tres causas se arreglan distinto:
  //   1. no cargó (red)          → Reintentar
  //   2. cargó y no hay nada     → no es culpa del cliente, no ofrecer filtros
  //   3. cargó y los filtros cortan todo → Limpiar filtros
  const emptyState = loadError ? (
    <div className="text-center py-20" role="alert">
      <div className={theme.grid.emptyIconWrap}>{theme.grid.emptyIcon}</div>
      <p className={theme.grid.emptyText}>No pudimos cargar el catálogo</p>
      <p className={`${theme.grid.emptyText} mt-1 font-normal`}>
        Revisa tu conexión a internet y vuelve a intentar.
      </p>
      <button onClick={() => setReintento((n) => n + 1)} className={theme.grid.emptyClear}>
        Reintentar
      </button>
    </div>
  ) : !hayFiltros ? (
    <div className="text-center py-20">
      <div className={theme.grid.emptyIconWrap}>{theme.grid.emptyIcon}</div>
      <p className={theme.grid.emptyText}>Por ahora no hay productos disponibles</p>
      <p className={`${theme.grid.emptyText} mt-1 font-normal`}>
        Vuelve a entrar más tarde o escríbenos por WhatsApp.
      </p>
    </div>
  ) : (
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
            {sections.map((s, si) => (
              <div key={s.section}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className={theme.grid.sectionTitle}>{s.label}</h2>
                  <div className={theme.grid.sectionRule} />
                  <span className={theme.grid.sectionCount}>{s.items.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {s.items.map((g, i) => (
                    <CatalogoGroupedCard
                      key={g.baseSku}
                      priority={si === 0 && i < FOTOS_PRIORITARIAS}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {sortedGroups.map((gs, i) => (
              <CatalogoGroupedCard
                key={gs.group.baseSku}
                priority={i < FOTOS_PRIORITARIAS}
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
          {groups.map((g, gi) => (
            <div key={g.label}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className={theme.grid.sectionTitle}>{g.label}</h2>
                <div className={theme.grid.sectionRule} />
                <span className={theme.grid.sectionCount}>{g.items.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {g.items.map((p, i) => (
                  <CatalogoProductCard
                    key={p.id}
                    priority={gi === 0 && i < FOTOS_PRIORITARIAS}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {filtered.map((p, i) => (
            <CatalogoProductCard
              key={p.id}
              priority={i < FOTOS_PRIORITARIAS}
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
          bultosFilter={bultosFilter}
          onBultosFilterChange={theme.features.filtroBultos ? setBultosFilter : undefined}
          precioRango={precioRango}
          onPrecioRangoChange={theme.features.filtroPrecio ? setPrecioRango : undefined}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          filteredCount={filteredCount}
          onClearAll={handleClearAll}
          genderOptions={generoOptions}
          categoryOptions={categoryOptions}
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
          onSubmitOrder={() => handleConfirmarPedido()}
          clientName={clientName}
          onClientNameChange={setClientName}
          saving={sendingOrder}
          actionLabel={sendingOrder ? theme.publico.confirmingLabel : undefined}
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
