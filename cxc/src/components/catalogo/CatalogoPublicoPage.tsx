"use client";

// Catálogo PÚBLICO (link compartible, sin login) — página única para todas las
// marcas, parametrizada por MARCA_THEME. Pipelines de datos por feature, igual
// que el grid vendedor. Confirmar pedido: crea el pedido público en el server
// (precios validados server-side), lo confirma y navega a /pedido-<marca>/[id].

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { resumirDesdeItems } from "@/lib/catalogo/lineas-pedido";
import { useRouter, useSearchParams } from "next/navigation";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { rutaRevisarPublico } from "@/lib/catalogo/rutas-publicas";
import { WHATSAPP_CONTACTOS } from "@/lib/catalogo/whatsapp-msg";
import { useDescargarCatalogoPdf } from "./useDescargarCatalogoPdf";
import { disponibleVendible } from "@/lib/catalogos/disponible";
import { compararCodigos } from "@/lib/catalogos/orden-codigo";
import {
  cumpleBultosMinimos, precioEnFiltro, precioDeUrl, preciosDelCatalogo,
  PRECIO_VACIO, type FiltroPrecio,
} from "@/lib/catalogo/filtros-extra";
import type { CatalogoCartItem, CatalogoProducto } from "./types";
import { Toast } from "@/components/ui";
import CatalogoHeader from "./CatalogoHeader";
import CatalogoFilters from "./CatalogoFilters";
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
  const router = useRouter();
  // 🔴 EL ESPACIO DE ABAJO SALE DE LA MEDIDA DE LA BARRA, no de un número
  // escrito a mano (7-sep-2026). Era `pb-28` (112 px) fijo. La barra la MIDE
  // `CatalogoStickyCartBar` con un ResizeObserver y avisa acá — cambia sola con
  // el mini-carrito abierto y con el `env(safe-area-inset-bottom)` del iPhone.
  // Es el MISMO mecanismo que ya usa el catálogo del vendedor.
  const [altoBarra, setAltoBarra] = useState(0);
  const [products, setProducts] = useState<CatalogoProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  // Filtros extra (Tommy y Calvin). El valor del query es dato no confiable:
  // los dos precios se validan como número antes de entrar al estado.
  const [bultosFilter, setBultosFilter] = useState(
    theme.features.filtroBultos ? searchParams.get("bultos") === "1" : false,
  );
  const [precio, setPrecio] = useState<FiltroPrecio>(() =>
    theme.features.filtroPrecio
      ? {
        desde: precioDeUrl(searchParams.get("precio_desde")),
        hasta: precioDeUrl(searchParams.get("precio_hasta")),
      }
      : PRECIO_VACIO,
  );
  const [sortBy, setSortBy] = useState("relevancia");
  // El aviso lleva su TIPO: un error se lee 8 s y un éxito 3 s, y los dos se
  // van solos y se pueden cerrar (regla de la casa; antes el único aviso de
  // esta pantalla se quedaba pegado para siempre encima de la barra).
  const [toast, setToast] = useState<{ texto: string; tipo: "success" | "error" } | null>(null);
  const avisar = useCallback((texto: string, tipo: "success" | "error" = "success") => {
    setToast({ texto, tipo });
  }, []);
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
        // ⚠️ LA PREVENTA CUELGA DE `badge`, Y SE QUEDA — ver el comentario
        // largo en CatalogoVendedorPage: se retiró el FILTRO, no la etiqueta.
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
    if (theme.features.filtroBultos && bultosFilter) params.set("bultos", "1");
    if (theme.features.filtroPrecio && precio.desde.trim()) params.set("precio_desde", precio.desde.trim());
    if (theme.features.filtroPrecio && precio.hasta.trim()) params.set("precio_hasta", precio.hasta.trim());
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, category, search, bultosFilter, precio.desde, precio.hasta]);

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

  // Los precios que EXISTEN en este catálogo. Se DERIVAN de los productos que
  // ya están en memoria: ninguna consulta nueva, y los precios los sigue
  // mandando Switch (esta pantalla solo filtra lo que ya tiene).
  const preciosDisponibles = useMemo(
    () => (theme.features.filtroPrecio ? preciosDelCatalogo(products.map(p => p.price)) : []),
    [theme, products],
  );

  const filtered = agrupado ? [] : products
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()) || (p.color || "").toLowerCase().includes(search.toLowerCase()))
    .filter(p => theme.genero.match(p.gender, gender))
    .filter(p => !category || p.category === category)
    // Filtros extra (Tommy). Bultos: se mide contra la DISPONIBILIDAD (lo
    // vendible), nunca la existencia, y el tamaño de bulto sale del tema —
    // el 12 no se escribe a mano. Precio: por PIEZA, no por bulto.
    .filter(p => !bultosFilter || cumpleBultosMinimos(disponibleVendible(p), theme.bulto(p.category, p.bulto_pzas)))
    .filter(p => precioEnFiltro(p.price, precio.desde, precio.hasta))
    // 🔑 El CÓDIGO desempata SIEMPRE, al final de todo (ver `orden-codigo.ts`).
    // ⚠️ Este orden es —a propósito— el MISMO byte a byte que el de
    // `CatalogoVendedorPage`: el cliente que abre el link compartido tiene que
    // ver el catálogo en el mismo orden que el vendedor que se lo mandó.
    .sort((a, b) => {
      if (sortBy === "precio-asc") return (a.price || 0) - (b.price || 0) || compararCodigos(a.sku, b.sku);
      if (sortBy === "precio-desc") return (b.price || 0) - (a.price || 0) || compararCodigos(a.sku, b.sku);
      if (sortBy === "nombre-az") return a.name.localeCompare(b.name) || compararCodigos(a.sku, b.sku);
      const ca = catOrder[a.category || ""] ?? 9, cb = catOrder[b.category || ""] ?? 9;
      if (ca !== cb) return ca - cb;
      const ga = theme.genero.groupOrder(a.gender), gb = theme.genero.groupOrder(b.gender);
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name) || compararCodigos(a.sku, b.sku);
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
      // Misma regla de precio que la lista plana. Hoy es un no-op (Joybees es
      // la única marca agrupada y no lleva `filtroPrecio`), pero si un día se
      // le enciende, el filtro tiene que cortar acá también: dos pipelines con
      // dos comportamientos de precio es el bug que nadie mira hasta que pasa.
      .filter(p => precioEnFiltro(p.price, precio.desde, precio.hasta))
  ) : [];
  const groupsWithSection = allGrouped.map(g => ({ group: g, section: getDisplaySection(g) }));
  const filteredGroups = groupsWithSection.filter(gs => !gender || gs.section === gender);
  // Mismo desempate por código que la lista plana, acá sobre el `baseSku`.
  const sortedGroups = [...filteredGroups].sort((a, b) => {
    if (sortBy === "precio-asc") return (a.group.price || 0) - (b.group.price || 0) || compararCodigos(a.group.baseSku, b.group.baseSku);
    if (sortBy === "precio-desc") return (b.group.price || 0) - (a.group.price || 0) || compararCodigos(a.group.baseSku, b.group.baseSku);
    if (sortBy === "nombre-az") return a.group.name.localeCompare(b.group.name) || compararCodigos(a.group.baseSku, b.group.baseSku);
    const sa = (SECTION_ORDER[a.section] ?? 99) - (SECTION_ORDER[b.section] ?? 99);
    if (sa !== 0) return sa;
    return a.group.name.localeCompare(b.group.name) || compararCodigos(a.group.baseSku, b.group.baseSku);
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

  // 🔴 EL CLIENTE TAMBIÉN DESCARGA EL CATÁLOGO EN PDF (7-sep-2026). Es
  // EXACTAMENTE el mismo archivo que Daniel manda a mano por WhatsApp: lo arma
  // el hook COMPARTIDO con el catálogo del vendedor (`useDescargarCatalogoPdf`),
  // no una segunda copia. El verbo es «Descargar» en los dos lados.
  //
  // ⚠️ El PDF sí respeta los filtros de quien lo pide —es la foto de lo que
  // estás mirando— y los escribe en su subtítulo. El ENLACE compartido, en
  // cambio, sale pelado (ver `handleCopyLink` del vendedor).
  const { descargando: descargandoPdf, descargar: descargarPdf } = useDescargarCatalogoPdf();
  function handleDescargarPdf() {
    return descargarPdf({
      marca, theme, agrupado, filtered, sortedGroups, filteredCount,
      gender, category, search, bultosFilter, precio, catLabel,
      avisar,
    });
  }

  function handleClearAll() {
    setSearchInput(""); setSearch(""); setGender(""); setCategory("");
    setBultosFilter(false); setPrecio(PRECIO_VACIO);
    setSortBy("relevancia");
  }

  // 🔴 CONFIRMAR YA NO OCURRE ACÁ (7-sep-2026). El cliente aterrizaba en su
  // pedido ya confirmado, de un toque; ahora pasa por «Revisar tu pedido»
  // —`/catalogo-publico/<marca>/revisar`—, donde ve lo que va a pedir, cambia
  // cantidades, quita líneas y recién ahí confirma. Es el mismo paso que el
  // vendedor da en su checkout. Daniel: *«así puede agregar, quitar o editar»*.
  //
  // Todo lo que estaba acá (crear + confirmar + el aviso de «no cierres esta
  // pantalla») se MUDÓ a `RevisarPedidoPublico`, no se copió.
  function handleRevisarPedido() {
    router.push(rutaRevisarPublico(marca));
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
    search || gender || category || bultosFilter || precio.desde.trim() || precio.hasta.trim()
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
      {/* 🩸 El texto decía «escríbenos por WhatsApp» y en esta pantalla NO
          había ningún WhatsApp: los números existían, pero solo salían en el
          pedido ya confirmado — o sea, después de comprar. Son los MISMOS dos
          contactos de siempre (`WHATSAPP_CONTACTOS`), con nombre y número a la
          vista para que el cliente sepa a quién le escribe. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {WHATSAPP_CONTACTOS.map((c) => (
          <a
            key={c.telefono}
            href={`https://wa.me/${c.telefono}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 min-h-[44px] text-sm font-bold text-white active:scale-[0.98] transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            {c.nombre} · {c.telefonoLabel}
          </a>
        ))}
      </div>
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

  // Con el carrito vacío la barra no existe y no se reserva nada (+16 px de
  // aire para que el último «Agregar» no quede pegado a la barra).
  const reservaAbajo = cartCount > 0 && altoBarra > 0 ? altoBarra + 16 : 0;

  // Product grid
  const productGrid = (
    <div style={{ paddingBottom: reservaAbajo || undefined }}>
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

        {/* «Descargar PDF» — el MISMO archivo que ofrece el vendedor. Solo se
            dibuja si hay algo que bajar: un botón que descarga un PDF vacío no
            se ofrece. */}
        {filteredCount > 0 && (
          <div className="-mt-3 mb-4 flex justify-end">
            <button
              onClick={handleDescargarPdf}
              disabled={descargandoPdf}
              className={`${theme.vendorShare.btn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width={theme.vendorShare.iconSize} height={theme.vendorShare.iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {descargandoPdf ? "Generando..." : "Descargar PDF"}
            </button>
          </div>
        )}

        <CatalogoFilters
          marca={marca}
          searchInput={searchInput}
          onSearchChange={setSearchInput}
          gender={gender}
          onGenderChange={setGender}
          category={category}
          onCategoryChange={setCategory}
          bultosFilter={bultosFilter}
          onBultosFilterChange={theme.features.filtroBultos ? setBultosFilter : undefined}
          precio={precio}
          onPrecioChange={theme.features.filtroPrecio ? setPrecio : undefined}
          preciosDisponibles={preciosDisponibles}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          filteredCount={filteredCount}
          onClearAll={handleClearAll}
          genderOptions={generoOptions}
          categoryOptions={categoryOptions}
        />

        {loading ? skeletonGrid : filteredCount === 0 ? emptyState : productGrid}

        <Toast message={toast?.texto ?? null} type={toast?.tipo} onDismiss={() => setToast(null)} />

        {showScrollTop && (
          /* El botón de subir vive `bottom-24` (96 px) en el tema. Con la barra
             del carrito arriba se escondía detrás: el `bottom` en línea lo
             levanta por encima del alto REAL de la barra y, sin carrito, se
             queda con el del tema. Mismo arreglo que en el catálogo del
             vendedor. */
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={reservaAbajo ? { bottom: reservaAbajo } : undefined}
            className={theme.grid.scrollTopBtn}
          >
            &uarr;
          </button>
        )}

        {/* La barra lleva a REVISAR. El nombre del cliente y «Confirmar
            pedido» viven en esa pantalla, en esta MISMA barra: acá no se pide
            nada todavía, así que la barra queda corta y no tapa el «Agregar»
            de la última fila. */}
        <CatalogoStickyCartBar
          marca={marca}
          cart={cart}
          cartCount={cartCount}
          cartTotal={cartTotal}
          onQtyChange={handleQtyChange}
          onClearCart={handleClearCart}
          variant="public"
          onSubmitOrder={handleRevisarPedido}
          actionLabel="Revisar pedido"
          onAltoChange={setAltoBarra}
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
