"use client";

// Grid del catálogo VENDEDOR (con sesión) — página única para todas las marcas,
// parametrizada por MARCA_THEME. Pipelines de datos por feature:
//   · flat (Reebok): products + inventory por talla, secciones categoría+género.
//   · agrupado (Joybees): groupByModel + secciones por género (SECTION_ORDER).
// El carrito vive en la SESIÓN de la pestaña (lib/catalogo/carrito.ts) y el
// pedido nace en el CHECKOUT (rediseño 5-jul) — cero llamadas en vivo a Switch
// desde aquí.
//
// MODO PEDIDO (`?agregarA=<id>`, 12-ago-2026): la MISMA pantalla, con una barra
// arriba que dice a qué pedido se está agregando y con cada "Agregar" —y cada
// +/− y cada cantidad tecleada— escribiendo en ESE pedido vía PATCH /item. El
// carrito NO se lee ni se escribe mientras el modo está vivo, así que lo que el
// vendedor tuviera armado aparte queda intacto. Ver lib/catalogo/modo-pedido.ts.

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { resumirDesdeItems } from "@/lib/catalogo/lineas-pedido";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { disponibleVendible } from "@/lib/catalogos/disponible";
import { compararCodigos } from "@/lib/catalogos/orden-codigo";
import {
  cumpleBultosMinimos, precioEnRango, esPrecioRango, type PrecioRango,
} from "@/lib/catalogo/filtros-extra";
import type { CatalogoCartItem, CatalogoProducto } from "./types";
import { Toast } from "@/components/ui";
import CatalogoHeader from "./CatalogoHeader";
import CatalogoSyncNow from "@/components/shared/CatalogoSyncNow";
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
import { idAgregarA, querySinPerderModo, tituloPedido } from "@/lib/catalogo/modo-pedido";
import { useModoPedido } from "@/lib/hooks/useModoPedido";
import BarraModoPedido from "./BarraModoPedido";

// Fotos que se piden YA (eager + fetchpriority=high) al abrir el catálogo: las
// del primer viewport. A 1440px el grid es de 5 columnas → 10 cards visibles;
// el resto va lazy y solo baja al hacer scroll (medido: la carga inicial pasa de
// cientos de fotos a ~10). Ver PR de la card unificada.
const FOTOS_PRIORITARIAS = 10;

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

  // ── State: cart ──
  const [cart, setCart] = useState<CatalogoCartItem[]>([]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = resumirDesdeItems(cart, { bultoSize: theme.bulto }).total;

  // ── On mount: hidratar el carrito de la SESIÓN (y migrar el viejo una vez). ──
  useEffect(() => {
    const items = leerCarrito<CatalogoCartItem>(theme.cartKey);
    if (items.length > 0) setCart(items);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cartInitialized = useRef(false);
  useEffect(() => {
    if (!cartInitialized.current) { cartInitialized.current = true; return; }
    guardarCarrito(theme.cartKey, cart);
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
        // Tommy: se CONGELA en la línea. Si el estilo se re-marca de 12 a 8
        // mientras el cliente arma el pedido, lo que ya agregó sigue cotizando
        // como cuando lo vio.
        nuevo.bulto_pzas = product.bulto_pzas ?? null;
        // ⚠️ LA PREVENTA CUELGA DE `badge`, Y SE QUEDA — decisión NO tomada.
        // Al retirarse los chips de Oferta/Nuevo/Próximamente (14-ago-2026) se
        // fue el FILTRO, no la etiqueta: `badge` sigue en la base y el admin la
        // sigue escribiendo (ProductosTarjetas / ProductosBatch). O sea que un
        // producto marcado "Próximamente" en el admin SIGUE entrando al carrito
        // como pre-orden, exactamente igual que antes de este cambio.
        // Hoy no hay ninguno: medido contra producción, `badge` está en NULL en
        // los 944 productos de las 4 marcas, así que la preventa está viva pero
        // sin uso. Retirarla es una decisión de negocio de Daniel, aparte.
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

  // ── MODO PEDIDO (`?agregarA=<id>`) ──
  // El rol sale de la sesión igual que en el resto del catálogo. Quien no puede
  // editar el pedido (bodega, el 'cliente' legacy de Reebok) ve el catálogo
  // NORMAL: el modo ni se enciende, en vez de ofrecer un botón que el server
  // rechazaría.
  const [role, setRole] = useState("");
  useEffect(() => { setRole(sessionStorage.getItem("cxc_role") || ""); }, []);
  const agregarA = idAgregarA(searchParams);
  const avisar = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  }, []);
  const modo = useModoPedido({ marca, theme, role, orderId: agregarA, onAviso: avisar });

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
    if (theme.features.filtroBultos && bultosFilter) params.set("bultos", "1");
    if (theme.features.filtroPrecio && precioRango) params.set("precio", precioRango);
    // El modo pedido viaja en la URL y esta línea la reescribe entera: sin
    // conservarlo, tocar un filtro apagaba el modo y el "Agregar" siguiente se
    // iba al carrito — un pedido perdido sin que nadie se entere.
    const qs = querySinPerderModo(params, agregarA);
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, category, search, bultosFilter, precioRango, agregarA]);

  // loadProducts también lo reusa el botón "Actualizar ahora" (CatalogoSyncNow)
  // para refrescar la vista tras un sync manual exitoso.
  const loadProducts = useCallback(async () => {
    setLoading(true);
    // En las 3 marcas `_stock` es DISPONIBILIDAD (lo vendible = saldo −
    // apartado), igual que en el catálogo público (26-jul-2026): antes esta
    // página decidía por EXISTENCIA (la columna `stock`, espejo del saldo
    // físico) y vendedor y cliente podían ver catálogos distintos —distinta
    // visibilidad y distinto orden— en los productos donde ambos números
    // difieren. Regla única en lib/catalogos/disponible (cae a existencia si el
    // sync todavía no escribió la columna, para no esconder producto por un
    // dato faltante).
    if (agrupado) {
      try {
        const res = await fetch(`${theme.api}/products?active=true`);
        if (!res.ok) throw new Error("fetch failed");
        const data: JoybeesProduct[] = await res.json();
        setProducts(data.filter(p => disponibleVendible(p) > 0 || p.is_regalia));
      } catch {
        setProducts([]);
      }
    } else if (theme.features.inventarioPorTalla) {
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
        // Reebok: `inventory.quantity` es EXISTENCIA (el sync escribe
        // quantity: existencia bajo la talla "UNICA"), así que solo sirve de
        // fallback y para las tallas; la disponibilidad correcta es la agregada
        // de la fila del producto.
        setProducts(
          prods
            .map(p => ({
              ...p,
              _stock: disponibleVendible(p, stockMap[p.id] ?? 0),
              _sizes: [...(sizesMap[p.id] || [])],
            }))
            .filter(p => (p._stock || 0) > 0 || p.badge === "proximamente")
        );
      } catch { setProducts([]); }
    } else {
      // Grid PLANA sin inventario por talla (Tommy): el stock vive en la fila
      // del producto (patrón Joybees) — sin endpoint /inventory.
      try {
        const res = await fetch(`${theme.api}/products?active=true`);
        if (!res.ok) throw new Error("fetch failed");
        const prods: CatalogoProducto[] = await res.json();
        setProducts(
          prods
            .map(p => ({ ...p, _stock: disponibleVendible(p), _sizes: [] as string[] }))
            .filter(p => (p._stock || 0) > 0 || p.badge === "proximamente")
        );
      } catch { setProducts([]); }
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agrupado]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ── Derived state — pipeline FLAT (categoría + género) ──
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
    // Filtros extra (Tommy). Bultos: se mide contra la DISPONIBILIDAD (lo
    // vendible), nunca la existencia, y el tamaño de bulto sale del tema —
    // el 12 no se escribe a mano. Precio: por PIEZA, no por bulto.
    .filter(p => !bultosFilter || cumpleBultosMinimos(disponibleVendible(p), theme.bulto(p.category, p.bulto_pzas)))
    .filter(p => precioEnRango(p.price, precioRango))
    // 🔑 El CÓDIGO desempata SIEMPRE, al final de todo (ver `orden-codigo.ts`):
    // el nombre no distingue —Calvin: 81 productos, 5 nombres— y sin este último
    // criterio los cuatro `KCMEENA…` quedaban desperdigados entre los `HW0HW…` y
    // los `KCTO…` en el orden en que viniera la base. Va DESPUÉS de categoría,
    // género y nombre, así que no mueve nada que hoy no empate.
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
  // En modo pedido las tarjetas muestran lo que tiene EL PEDIDO y el +/− escribe
  // ahí; el carrito queda intacto y fuera de la pantalla.
  const cartMap = modo.activo ? modo.enPedido : new Map(cart.map(i => [i.product_id, i.quantity]));
  const onQtyChange = modo.activo ? modo.setQty : handleQtyChange;

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

  // ── Derived state — pipeline AGRUPADO (groupByModel + secciones) ──
  const allGrouped = agrupado ? groupByModel(
    (products as JoybeesProduct[])
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
      .filter(p => !category || p.category === category)
  ) : [];

  const groupsWithSection = allGrouped.map(g => ({ group: g, section: getDisplaySection(g) }));
  const filteredGroups = groupsWithSection.filter(gs => !gender || gs.section === gender);
  // Mismo desempate por código que la lista plana, acá sobre el `baseSku` del
  // grupo — son DOS pipelines y tocar uno solo dejaba la vista agrupada
  // (Joybees) igual de desordenada.
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
    // Los filtros extra viajan en el link: si el vendedor comparte "2 bultos o
    // más", el cliente abre el catálogo ya filtrado igual que él.
    if (theme.features.filtroBultos && bultosFilter) params.set("bultos", "1");
    if (theme.features.filtroPrecio && precioRango) params.set("precio", precioRango);
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
        if (gender) filterDesc.push(theme.genero.filterLabel(gender));
        if (category) filterDesc.push(catLabel[category] || category);
        if (search) filterDesc.push(`“${search}”`);
      }
      // Sin filtros el subtítulo va VACÍO (poda, 12-ago-2026): decía "Todos los
      // productos" sobre un PDF que ya anuncia "{n} productos" en la portada —
      // no distinguía nada de nada. Con filtros puestos sí informa ("HOMBRE ·
      // CALZADO"), y ahí se conserva tal cual.
      const subtitle = filterDesc.length > 0 ? filterDesc.join("  ·  ") : "";

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
        // Agrupación canónica de la marca (theme.genero.pdfSections): Reebok
        // Hombre/Mujer/Niños/Unisex, Tommy Women/Men/Boys/Girls. "otros" cierra
        // el catch-all para que ningún producto con género no contemplado se
        // caiga del PDF en silencio.
        pdfSections = theme.genero.pdfSections.map(g => ({
          label: g.label,
          items: filtered.filter(p => theme.genero.groupKey(p.gender) === g.key).map(p => ({
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
    setBultosFilter(false); setPrecioRango("");
    setSortBy("relevancia");
  }

  function handleClearCart() {
    setCart([]);
    limpiarCarrito(theme.cartKey);
  }

  // Skeleton
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
                      onQtyChange={onQtyChange}
                      showBultos
                      showStock
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
                onQtyChange={onQtyChange}
                showBultos
                showStock
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
                    onQtyChange={onQtyChange}
                    showBultos
                    showStock
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
              onQtyChange={onQtyChange}
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

  // "Pedidos" — a la MISMA altura que Compartir (12-ago-2026). Los dos son
  // acciones del catálogo; tenerlos en dos filas distintas era el pedido de
  // Daniel. Mismo gate de rol que tenía en la navbar (gestores; bodega y el
  // 'cliente' legacy de Reebok no lo ven) y `role` ya vive en esta pantalla.
  //
  // NO se esconde en modo pedido: es la salida a la lista, no compite con
  // "Listo, volver al pedido" (que vive en la barra pegajosa de arriba).
  const puedeVerPedidos = role === "admin" || role === "vendedor" || role === "secretaria";
  const pedidosBtn = puedeVerPedidos ? (
    <Link href={theme.pedidosHref} className={theme.vendorShare.pedidosBtn}>Pedidos</Link>
  ) : null;

  return (
    <div className={theme.grid.pageBg}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Barra del modo pedido — pegada arriba, con la salida adentro. */}
        {modo.activo && (
          <BarraModoPedido
            titulo={tituloPedido(modo.pedido)}
            totalBultos={modo.totalBultos}
            hrefVolver={modo.hrefVolver}
            estado={modo.estado}
          />
        )}
        {theme.vendorShare.enHeader ? (
          /* Layout heredado Joybees: header + [Ver pedido | Pedidos | Compartir].
             `flex-wrap` + `justify-end`: a 390 px el logo de Tommy es ancho y
             tres botones no entran en la misma línea — el grupo baja ENTERO a
             la línea de abajo en vez de aplastarse (que es lo que hacía antes
             de que hubiera un botón más). Los dos siguen a la misma altura. */
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CatalogoHeader marca={marca} variant="vendor" />
            <div data-medir="acciones-catalogo" className="flex flex-wrap items-center justify-end gap-2 ml-auto">
              {!modo.activo && cartCount > 0 && (
                <button onClick={goCheckout} className={theme.vendorShare.verPedidoBtn!}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  Ver pedido
                </button>
              )}
              {pedidosBtn}
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

        {/* ── Sync + Share/Download row ── */}
        <div className="flex items-center justify-between gap-2 mb-4">
          {/* "Actualizar ahora" del catálogo (solo con sesión admin/secretaria/
              vendedor — el catálogo público jamás lo ve). */}
          <CatalogoSyncNow catalogo={marca} onSuccess={loadProducts} />
          {/* Reebok: Compartir vive acá, así que "Pedidos" viene con él. Ojo,
              Compartir se esconde sin resultados y "Pedidos" NO: llegar a la
              lista de pedidos no depende de que el filtro tenga productos. */}
          {!theme.vendorShare.enHeader && (
            <div data-medir="acciones-catalogo" className="flex flex-wrap items-center justify-end gap-2 ml-auto">
              {pedidosBtn}
              {filteredCount > 0 && shareMenu}
            </div>
          )}
        </div>

        {/* ── Grid ── */}
        {loading ? skeletonGrid : filteredCount === 0 ? emptyState : productGrid}

        <Toast message={toast} />

        {showScrollTop && (
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={theme.grid.scrollTopBtn}>&uarr;</button>
        )}

        {/* ── Sticky cart bar ── (jamás en modo pedido: ahí no hay carrito) */}
        {!modo.activo && cartCount > 0 && (
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
