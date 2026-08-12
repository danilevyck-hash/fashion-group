// ─────────────────────────────────────────────────────────────────────────────
// MARCA_THEME — tema de UI por marca del motor de catálogos (PR-2).
// CLIENT-SAFE: vive junto a MARCAS_CONFIG (marcas.ts, server-only) pero este
// módulo NO importa clients ni env de servidor — solo labels, clases Tailwind,
// flags de features y helpers puros (bulto/totales/orden). Los componentes de
// components/catalogo/* y las páginas [marca] leen TODO de aquí: agregar una
// marca nueva (Tommy) = agregar una entrada a este record + MARCAS_CONFIG.
//
// IMPORTANTE (Tailwind JIT): las clases viven aquí como strings LITERALES
// completos — nunca componer `text-[${color}]` en runtime, el purge no las ve.
// tailwind.config content ya escanea ./src/**/*.{ts,tsx} (incluye este archivo).
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @next/next/no-img-element */

import type { ReactNode } from "react";
import { getBultoSize as reebokBulto } from "@/lib/reebok-bulto";
import { getBultoSize as joybeesBulto } from "@/lib/joybees-bulto";
import { getBultoSize as tommyBulto } from "@/lib/tommy-bulto";
import { getBultoSize as calvinBulto } from "@/lib/calvin-bulto";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";
import { calculateTommyOrderTotal } from "@/lib/tommy-order-total";
import { calculateCalvinOrderTotal } from "@/lib/calvin-order-total";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";
import { TOMMY_CATEGORIA_LABEL, TOMMY_GENERO_LABEL } from "@/lib/tommy-nombres";
import { CALVIN_CATEGORIA_LABEL, CALVIN_GENERO_LABEL } from "@/lib/calvin-nombres";
import {
  matchesGenderFilter as reebokMatchesGenderFilter,
  genderGroupKey as reebokGenderGroupKey,
  genderGroupLabel as reebokGenderGroupLabel,
  genderGroupOrder as reebokGenderGroupOrder,
  genderFilterLabel as reebokGenderFilterLabel,
} from "@/lib/reebok-gender";
import {
  matchesTommyGenderFilter,
  tommyGenderGroupKey,
  tommyGenderGroupLabel,
  tommyGenderGroupOrder,
  tommyGenderFilterLabel,
  TOMMY_PDF_GENDER_SECTIONS,
} from "@/lib/tommy-gender";
import {
  matchesCalvinGenderFilter,
  calvinGenderGroupKey,
  calvinGenderGroupLabel,
  calvinGenderGroupOrder,
  calvinGenderFilterLabel,
  CALVIN_PDF_GENDER_SECTIONS,
} from "@/lib/calvin-gender";

export type MarcaUiKey = "reebok" | "joybees" | "tommy" | "calvin";

/** Producto tal como lo ve el ADMIN de catálogos (superset de las marcas). */
export interface AdminProducto {
  id: string;
  sku: string | null;
  name: string;
  price?: number | null;
  category?: string;
  gender?: string | null;
  sub_category?: string | null;
  description?: string | null;
  image_url: string | null;
  active?: boolean;
  on_sale?: boolean;
  badge?: string | null;
  stock?: number;
  existencia?: number | null;
  disponibilidad?: number | null;
  created_at?: string;
  /** Toggle "Ocultar del catálogo" — puede faltar pre-migración. */
  oculto_manual?: boolean | null;
  /** Tommy: true = nombre editado a mano (el sync no lo pisa). */
  nombre_manual?: boolean | null;
  /** Tommy: piezas por bulto del estilo. Vacío = 12. Puede faltar pre-migración. */
  bulto_pzas?: number | null;
}

function tieneFotoAdmin(p: AdminProducto): boolean {
  return !!(p.image_url && p.image_url.trim());
}

// Label por categoría real de Reebok (vive 100% en active_shoes; el grupo del
// catálogo ES la categoría: Footwear / Apparel / Accessories).
const REEBOK_CATEGORIA_LABEL: Record<string, string> = {
  footwear: "Footwear",
  apparel: "Apparel",
  accessories: "Accessories",
};

// Joybees es 100% calzado. El "tipo" se deriva del NOMBRE (no hay columna tipo):
// contiene "Clog" → Clogs, "Sandal" → Sandalias, "Flip" → Flips. Los demás
// (Flat, Trekking, Popinz…) no caen en ninguna card de tipo.
function tipoJoybees(name: string): "Clogs" | "Sandalias" | "Flips" | null {
  const n = (name || "").toLowerCase();
  if (n.includes("clog")) return "Clogs";
  if (n.includes("sandal")) return "Sandalias";
  if (n.includes("flip")) return "Flips";
  return null;
}

// Género de Switch → etiqueta simple en español (para el Excel de Joybees).
const JOYBEES_GENERO_LABEL: Record<string, string> = {
  women: "Mujer",
  adults_m: "Hombre",
  adults: "Adulto",
  unisex: "Unisex",
  kids: "Niños",
};

/** Taxonomía de género histórica (Reebok y Joybees) — español, boys+girls
 *  colapsados en "Niños". Se comparte por referencia: las dos marcas leen la
 *  MISMA fuente, así no puede haber deriva entre ellas. */
const REEBOK_GENERO = {
  match: reebokMatchesGenderFilter,
  groupKey: reebokGenderGroupKey,
  groupLabel: reebokGenderGroupLabel,
  groupOrder: reebokGenderGroupOrder,
  filterLabel: reebokGenderFilterLabel,
  pdfSections: [
    { key: "hombre", label: "HOMBRE" },
    { key: "mujer", label: "MUJER" },
    { key: "ninos", label: "NIÑOS" },
    { key: "unisex", label: "UNISEX" },
    { key: "otros", label: "OTROS" },
  ],
};

export interface MarcaTheme {
  marca: MarcaUiKey;
  /** "Reebok" — título corto para copys. */
  label: string;
  /** "REEBOK" — headers en mayúscula. */
  labelUpper: string;
  /** Empresa Switch de la marca (query de /api/catalogo/mi-vendedor). */
  empresaKey: string;
  /** Nombre del directorio Switch en copys ("clientes de Active Shoes"). */
  switchDirectorioLabel: string;

  // ── Rutas ──
  /** Base del API de la marca: /api/catalogo/<marca>. */
  api: string;
  /** Grid canónica del catálogo con sesión (raíz de /catalogo/<marca>). */
  catalogoHref: string;
  pedidosHref: string;
  checkoutHref: string;
  confirmacionBase: string;
  clientesHref: string;
  /** Link público compartible (copiar link del vendedor). */
  publicoShareUrl: string;
  /** Base de la página permanente del pedido público (/pedido-<marca>). */
  pedidoPublicoBase: string;

  // ── Storage keys (idénticas a las históricas — carritos vivos migran solos) ──
  /**
   * Carrito del catálogo con sesión. Vive en `sessionStorage` (ver
   * `lib/catalogo/carrito.ts`): sobrevive navegar y refrescar dentro de la
   * pestaña y muere al cerrarla. La clave es la MISMA de siempre, así que el
   * carrito guardado en localStorage por el esquema viejo se lee una última vez
   * y se limpia.
   */
  cartKey: string;
  /** Carrito del catálogo PÚBLICO — misma regla de vida (sesión). */
  publicCartKey: string;
  publicClientNameKey: string;
  checkoutTokenKey: string;

  // ── Reglas de negocio client-side ──
  /**
   * Piezas por bulto. `bultoPzas` es el valor guardado en el producto y solo lo
   * usa Tommy (`tommy_products.bulto_pzas`): sus estilos vienen de 8 o de 12 y
   * no hay forma de deducirlo — ver `tommy-bulto.ts`. Reebok ramifica por
   * categoría y Joybees es fijo, así que las dos ignoran el segundo argumento.
   */
  bulto: (category?: string | null, bultoPzas?: number | null) => number;
  calcTotal: (items: { quantity: number; unit_price: number; category?: string; bulto_pzas?: number | null }[]) => number;
  /** Orden canónico de items del pedido (Reebok: categoría+SKU) o null = SKU asc. */
  sortOrderItems: (<T extends { sku: string; category?: string }>(items: T[]) => T[]) | null;
  /** Fallback de category para PDFs / items sin category. */
  pdfFallbackCategory: string;
  /** Relación embebida de items en la respuesta de orders. */
  itemsField: string;
  /** Taxonomía de GÉNERO de la marca — filtro, agrupación de secciones del
   *  grid plano y secciones del PDF del catálogo. Reebok y Joybees usan la
   *  histórica de `reebok-gender.ts` (Hombre/Mujer/Niños/Unisex, en español);
   *  Tommy usa la suya (`tommy-gender.ts`: Women/Men/Boys/Girls, el vocabulario
   *  de Switch). Los componentes leen SIEMPRE de aquí — nunca importan un
   *  módulo de género directo. */
  genero: {
    /** ¿El producto cae bajo el chip seleccionado? "" = Todos. */
    match: (rawGender: string | null | undefined, filterValue: string) => boolean;
    /** Clave de agrupación de secciones (desconocido → "otros"). */
    groupKey: (rawGender: string | null | undefined) => string;
    /** Label del encabezado de sección ("SLIPPERS — WOMEN"). */
    groupLabel: (rawGender: string | null | undefined) => string;
    /** Orden de las secciones. */
    groupOrder: (rawGender: string | null | undefined) => number;
    /** Label del chip activo, para el subtítulo del PDF. */
    filterLabel: (filterValue: string) => string;
    /** Secciones del PDF del catálogo plano, en orden (key = groupKey). */
    pdfSections: { key: string; label: string }[];
  };

  // ── Features (diferencias FUNCIONALES reales) ──
  features: {
    /** Pre-orden / badge "proximamente" (solo Reebok). */
    preorder: boolean;
    /** Chips Oferta/Nuevo/Próximamente en filtros (solo Reebok). */
    saleFilter: boolean;
    /** Grid agrupada por modelo + secciones por género (Joybees groupByModel). */
    agrupacionPorModelo: boolean;
    /** Inventario por talla en endpoint aparte (Reebok /inventory). */
    inventarioPorTalla: boolean;
    /** Chips de categoría en los filtros (Reebok Calzado/Ropa/Accesorios). */
    categoryChips: boolean;
    /** Chip "2 bultos o más" en los filtros (solo Tommy — ver filtros-extra). */
    filtroBultos: boolean;
    /** Select de rango de precio por pieza en los filtros (solo Tommy). */
    filtroPrecio: boolean;
    /** QUIRK legacy Reebok: rol 'cliente' solo ve su propio pedido. */
    roleClienteGuard: boolean;
    /** El "← Inicio" del navbar solo aparece con rol de sistema (Reebok). */
    navInicioRequiereRol: boolean;
  };

  // ── Metadata del layout ──
  metaTitle: string;
  metaDescription: string;
  /** Imagen de la VISTA PREVIA del link en WhatsApp (1200x630, relación
   *  1.91:1 = la que WhatsApp recorta sin cortar nada). Se genera con
   *  `node scripts/generar-og-catalogos.mjs` a partir de los logos reales.
   *
   *  URL ABSOLUTA a propósito: el layout raíz NO define `metadataBase`, así
   *  que una ruta relativa la resolvería Next contra la URL del deploy de
   *  Vercel y no contra fashiongr.com — el scraper de WhatsApp se quedaría
   *  sin imagen. PNG y no SVG: WhatsApp no renderiza SVG en og:image. */
  ogImage: string;

  /** Acento (hex) del borde del total en el checkout. */
  checkoutAccent: string;

  /** Paleta de la TARJETA del hub /catalogos/marcas (strings Tailwind literales,
   *  ver nota JIT de cabecera). Cada marca aporta aquí su identidad de tarjeta —
   *  así el hub NO hardcodea colores por marca: agregar una marca = agregar su
   *  entrada de tema y su card sale sola. */
  hub: {
    /** Fondo + borde de la tarjeta. */
    card: string;
    /** Color del nombre grande de la marca. */
    name: string;
    /** Color del tagline bajo el nombre. */
    tag: string;
    /** Color de la línea de contadores (productos · sin foto). */
    counter: string;
    /** Blob decorativo de la esquina. */
    blob: string;
    /** Botón primario "Ver catálogo" (contraste fuerte sobre la tarjeta). */
    primaryBtn: string;
    /** Botón secundario "Administrar" (outline). */
    outlineBtn: string;
    /** Énfasis del "N sin foto". */
    sinFoto: string;
  };

  // ── Logos (bloques JSX por superficie) ──
  logos: {
    /**
     * Logo de la navbar del catálogo con sesión.
     * `null` = la marca NO pone logo en la navbar porque su identidad ya vive
     * en el header grande de abajo (evita ver el mismo logo dos veces en la
     * misma pantalla). Con `null`, la navbar queda solo con "← Inicio".
     */
    navbar: (() => ReactNode) | null;
    header: () => ReactNode;
    admin: () => ReactNode;
    pedidoPublico: () => ReactNode;
  };

  // ── Clases por componente (strings literales completos) ──
  navbar: {
    accentBar: string;
    inicioLink: string;
  };
  header: {
    fashionGroupBar: string;
    fashionGroupText: string;
  };
  filtros: {
    searchIcon: string;
    searchInput: string;
    searchClear: string;
    searchPlaceholder: string;
    chipLabel: string;
    chipActive: string;
    chipInactive: string;
    divider: string;
    clearAll: string;
    sortSelect: string;
    count: string;
    genderOptions: { value: string; label: string }[];
    categoryOptions: { value: string; label: string }[];
  };
  grid: {
    /** Fondo de página del catálogo (vendedor y público). */
    pageBg: string;
    sectionTitle: string;
    sectionRule: string;
    sectionCount: string;
    emptyIcon: ReactNode;
    emptyIconWrap: string;
    emptyText: string;
    emptyClear: string;
    scrollTopBtn: string;
  };
  cart: {
    tituloMini: string;
    itemName: string;
    itemMeta: string;
    qtyBtn: string;
    qtyNum: string;
    lineTotal: string;
    totalText: string;
    vaciarBtn: string;
    summaryBtn: string;
    summaryMeta: string;
    badge: string;
    nameLabel: string;
    nameInput: string;
    /** Botón principal: Reebok lo colorea por variante/props; Joybees fijo. */
    actionPublic: string;
    actionVendor: string;
    /** Reebok: check solo en public y flecha en vendor; Joybees: check siempre. */
    checkIconAlways: boolean;
    vendorArrow: boolean;
  };
  card: {
    ring: string;
    checkBubble: string;
    checkStroke: string;
    /** Contenedor de la foto — 4:3 en las 3 marcas: el calzado es ancho y en
     *  cuadrado sobraba fondo blanco arriba y abajo (Daniel, 25-jul-2026). */
    imageBg: string;
    /** object-contain SIEMPRE y SIN padding en las 3 marcas: la foto ocupa el
     *  marco 4:3 completo (el p-3 de Reebok/Tommy encogía el producto ~14% y
     *  además era una divergencia con Joybees). NO se usa object-cover: se
     *  midieron las 608 fotos activas y cover corta PRODUCTO (no margen) en
     *  67/138 de Reebok y 16/81 de Joybees — ver PR de la card unificada. */
    imageFit: string;
    placeholder: ReactNode;
    /** Nombre del producto. Solo el COLOR cambia por marca; la geometría es
     *  idéntica en las 3 y es un contrato: `leading-5 h-5 truncate` = una sola
     *  línea de alto fijo (20px). El ajuste de tamaño 14px→11px y el "…" los
     *  hace CatalogoProductName (Daniel, 25-jul-2026). */
    name: string;
    /** Píldora del CÓDIGO (misma posición y forma en las 3 marcas; solo cambia
     *  el color del tema). Antes vivía hardcodeada con los colores de Reebok
     *  en la card plana y como texto mono suelto en la agrupada. */
    skuPill: string;
    priceNormal: string;
    priceMeta: string;
    bultoMeta: string;
    /** Bloque "Disponibilidad N" / "Existencia N" del catálogo interno
     *  (CatalogoStockLine): estructura única, colores por marca. Ya no hay
     *  `divider` ni `dot`: el stock dejó de ser una franja con línea propia y
     *  pasó a la derecha del precio, en dos renglones (Daniel, 25-jul-2026). */
    stock: {
      strong: string;
      soft: string;
      agotado: string;
    };
    addBtn: string;
    qtyWrap: string;
    qtyBtn: string;
    qtyNum: string;
    qtyUnit: string;
  };
  /** Grid vendedor: dónde vive el menú Compartir y el botón "Ver pedido". */
  vendorShare: {
    /** true (layout Joybees): share + "Ver pedido" junto al header; false
     *  (layout Reebok): share en la fila del sync, solo con resultados. */
    enHeader: boolean;
    verPedidoBtn: string | null;
    btn: string;
    /** "Pedidos" — vive en la MISMA fila que Compartir desde el 12-ago-2026
     *  (antes en la navbar, arriba del todo). Daniel: *"cambia el boton de
     *  pedido a la altura de compartir"*, en las 4 marcas. Misma geometría que
     *  `btn` para que los dos se lean como un par de acciones del catálogo. */
    pedidosBtn: string;
    iconSize: number;
    panel: string;
    item: string;
    copyLabel: string;
    /** Color del botón principal de la barra sticky (null = default del tema). */
    stickyActionColor: string | null;
  };
  publico: {
    /** Carga del catálogo público: color del texto vacío etc. reuse grid. */
    confirmingLabel: string;
  };
  /** Página PERMANENTE del pedido del link (/pedido-<marca>/[short_id]).
   *  Hasta jul-2026 el navy de Reebok (#1A2656) estaba hardcodeado 16 veces
   *  dentro de PedidoPublicoClient, así que el pedido de Joybees salía con el
   *  navy de Reebok en vez de su gris/amarillo y el de Tommy con #1A2656 en
   *  vez de su #152342. Ahora TODO el color sale de aquí. */
  pedidoPublico: {
    pageBg: string;
    spinner: string;
    itemImageBg: string;
    totalValue: string;
    confirmBtn: string;
    /** Banda oscura del header y de la barra del total. */
    headerBg: string;
    /** Banda de la sección "Pedido" (solo se ve con pre-orden → Reebok). */
    sectionBg: string;
    /** Borde lateral del bloque blanco de items. */
    panelBorder: string;
    /** Texto principal sobre blanco: nombre del producto, precio, títulos. */
    textStrong: string;
    /** Texto secundario: SKU, "c/u", línea de bultos, subtítulos. */
    textSoft: string;
    /** Texto de apoyo bajo el botón Confirmar. */
    textHelp: string;
    /** Lo más tenue: pie "fashiongr.com". */
    textFaint: string;
    /** Icono placeholder cuando el item no tiene foto. */
    placeholderIcon: string;
    /** Botón "Descargar PDF" (outline sobre el fondo de página). */
    pdfBtn: string;
  };
  admin: {
    titulo: string;
    subtituloSync: (lastSync: string | null) => string;
    /** GET de products del admin (QUIRK 4 heredado: Reebok usa scope=admin). */
    productsUrl: string;
    /** Cards de resumen sobre los productos VISIBLES (sin ocultos a mano). */
    metrics: (visibles: AdminProducto[]) => { label: string; value: number; highlight?: boolean }[];
    /** Excel "sin foto" por marca (columnas y libs propias). Lanza si falla. */
    excelSinFoto: (sin: AdminProducto[]) => Promise<void>;
    /** Contador del tab Faltan foto: chip rojo (Reebok) o inline en el label. */
    fotoTabBadge: "chip" | "inline";
    syncModulo: string;
    syncSubtext: string;
    toastBg: string;
    tabActive: string;
    spinner: string;
    metricValue: string;
    metricHighlightBox: string;
    metricHighlightValue: string;
    /** Estilo del tab de fotos/productos: "tarjetas" (Reebok, badge+stock+bulk)
     *  o "batch" (Joybees/Tommy, batch simple). */
    productosStyle: "tarjetas" | "batch";
    /** Solo Tommy: nombre editable inline en las filas del admin (al guardarlo
     *  el endpoint marca nombre_manual=true y el sync deja de pisarlo). */
    nombreEditable: boolean;
    /** Import por plantilla como respaldo (?tab=importar) — solo Joybees. */
    importarTab: boolean;
    /** Edición de etiqueta (badge) por producto — solo Reebok. */
    badgeEditable: boolean;
    /** QUIRK 5 client-side: identificador y verbo del update de products. */
    productEdit: { idField: "id" | "sku"; verb: "PUT" | "POST" };
    /**
     * ¿Se marcan a mano las piezas por bulto? Solo Tommy: sus bultos vienen de
     * 8 o de 12 según el estilo y no hay fuente de la que deducirlo (ver
     * `tommy-bulto.ts`). Espejo de `products.bultoEditable` en marcas.ts, que
     * es quien lo hace cumplir en el servidor — esto solo pinta el control.
     */
    bultoEditable?: boolean;
    pedidos: {
      linkBadge: string;
      linkBadgeCheck: string;
      filterActive: string;
      searchFocus: string;
      /** Modal de borrado individual: Reebok usa ConfirmModal, Joybees ConfirmDeleteModal. */
      deleteModal: "confirm" | "confirm-delete";
      exportFilename: string;
    };
  };
  producto: {
    /** Ficha /producto/[id]: por tallas (Reebok, inventory) o por variantes
     *  de género (Joybees, groupByModel). */
    estilo: "tallas" | "variantes";
    volverClass: string;
    imageWrap: string;
    price: string;
    sizeActive: string;
    sizeInactive: string;
    addBtn: string;
    consultaWrap: string;
  };
  pedido: {
    /** Micro-diferencias heredadas de la página del pedido interno. */
    qtyInputClass: string;
    suggDropdownClass: string;
    suggItemClass: string;
    suggLimit: number | null;
    clientNamePlaceholder: string | null;
    /** ref del click-outside: Reebok en el contenedor, Joybees en el input. */
    nameRefEnContenedor: boolean;
  };
  clientes: {
    nuevoBtn: string;
    saveBtn: string;
  };
}

const REEBOK: MarcaTheme = {
  marca: "reebok",
  label: "Reebok",
  labelUpper: "REEBOK",
  empresaKey: "active_shoes",
  switchDirectorioLabel: "Active Shoes",

  api: "/api/catalogo/reebok",
  catalogoHref: "/catalogo/reebok",
  pedidosHref: "/catalogo/reebok/pedidos",
  checkoutHref: "/catalogo/reebok/checkout",
  confirmacionBase: "/catalogo/reebok/confirmacion",
  clientesHref: "/catalogo/reebok/clientes",
  publicoShareUrl: "https://www.fashiongr.com/catalogo-publico/reebok",
  pedidoPublicoBase: "/pedido-reebok",

  cartKey: "reebok_cart",
  publicCartKey: "reebok_public_cart",
  publicClientNameKey: "reebok_public_client_name",
  checkoutTokenKey: "reebok_checkout_token",

  bulto: (c) => reebokBulto(c || "apparel"),
  calcTotal: calculateReebokOrderTotal,
  sortOrderItems: sortReebokOrderItems,
  pdfFallbackCategory: "apparel",
  itemsField: "reebok_order_items",
  genero: REEBOK_GENERO,

  features: {
    preorder: true,
    saleFilter: true,
    agrupacionPorModelo: false,
    inventarioPorTalla: true,
    categoryChips: true,
    // Precio ~90% redundante con los chips de categoría que ya existen (medido
    // 25-jul-2026) y el corte de bultos casi no corta: no se agregan.
    filtroBultos: false,
    filtroPrecio: false,
    roleClienteGuard: true,
    navInicioRequiereRol: true,
  },

  metaTitle: "Reebok Panamá - Catálogo",
  metaDescription: "Catálogo de productos Reebok Panamá.",
  ogImage: "https://www.fashiongr.com/og/catalogo-reebok.png",

  checkoutAccent: "#1A2656",

  hub: {
    card: "bg-[#1A2656] border-[#1A2656]/10",
    name: "text-white",
    tag: "text-white/50",
    counter: "text-white/70",
    blob: "bg-[#E4002B]/15",
    primaryBtn: "bg-white text-[#1A2656] hover:bg-white/90",
    outlineBtn: "border border-white/40 text-white hover:bg-white/10",
    sinFoto: "text-[#FFD1D1] font-semibold",
  },

  logos: {
    navbar: () => <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-7" />,
    // Símbolo REAL de la marca (el "vector") + la palabra en texto. Antes había
    // aquí un <svg> de un triángulo dibujado a mano que NO es el logo de Reebok.
    // OJO: reebok-logo.png es SOLO el símbolo — no trae el wordmark, a
    // diferencia del SVG de Tommy. Verificado abriendo el archivo (2560×726, un
    // único trazo rojo). Por eso la palabra se escribe aparte, con la misma
    // tipografía que tenía el header antes de que existiera el PNG: sin ella el
    // catálogo público quedaba con el símbolo solo, sin ninguna palabra de la
    // marca (decisión de Daniel, 26-jul-2026).
    header: () => (
      <div className="flex items-center gap-2.5 shrink-0">
        {/* alt="" a propósito: el nombre accesible lo da el <h1> de al lado. Con
            alt="Reebok" un lector de pantalla diría la marca dos veces. */}
        <img src="/reebok/reebok-logo.png" alt="" className="h-5 w-auto shrink-0" />
        <div className="shrink-0">
          <h1 className="text-lg font-black uppercase tracking-[0.15em] text-[#1A2656] leading-none">
            Reebok
          </h1>
          {/* El subtítulo "Catálogo Panamá" se PODÓ (Daniel, 12-ago-2026): ya
              estás EN el catálogo y todo el negocio es Panamá — no decía nada.
              Vale para las 4 marcas; candado en poda-textos-cxc-multifashion. */}
        </div>
      </div>
    ),
    admin: () => (
      <div className="w-10 h-10 rounded-xl bg-[#1A2656] flex items-center justify-center">
        <span className="text-white font-extrabold text-xs tracking-tight">RBK</span>
      </div>
    ),
    // Símbolo + palabra sobre placa blanca: la banda del header del pedido
    // público es oscura y el símbolo es rojo (#E4002B) — la placa garantiza que
    // se lea igual que en la web de la marca. La palabra va en navy dentro de la
    // placa (en blanco sobre blanco desaparecería). Paridad con Tommy, que sí
    // trae su wordmark dentro del SVG.
    pedidoPublico: () => (
      <div className="shrink-0">
        <h1 className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
          <img src="/reebok/reebok-logo.png" alt="" className="h-5 w-auto shrink-0" />
          <span className="text-base font-black uppercase tracking-[0.15em] text-[#1A2656] leading-none">
            Reebok
          </span>
        </h1>
        {/* El "Panamá" suelto bajo el logo se PODÓ junto con "Catálogo Panamá"
            (12-ago-2026): misma palabra obvia, mismo motivo. */}
      </div>
    ),
  },

  navbar: {
    accentBar: "bg-[#E4002B]",
    inicioLink: "text-xs text-[#1A2656] hover:text-[#E4002B] transition flex-shrink-0 py-2",
  },
  header: {
    fashionGroupBar: "w-1 h-4 bg-[#E4002B] rounded-full",
    fashionGroupText: "text-xs font-medium uppercase tracking-wide text-[#1A2656]/30",
  },
  filtros: {
    searchIcon: "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1A2656]/30",
    searchInput:
      "w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-[#1A2656]/10 text-sm outline-none focus:border-[#1A2656]/30 focus:ring-2 focus:ring-[#1A2656]/5 transition placeholder:text-[#1A2656]/25",
    searchClear:
      "absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 transition",
    searchPlaceholder: "Buscar por nombre, código o color...",
    chipLabel: "text-xs font-semibold text-[#1A2656]/40 uppercase tracking-wide mr-0.5",
    chipActive: "bg-[#1A2656] text-white shadow-sm",
    chipInactive: "bg-white text-[#1A2656]/60 border border-[#1A2656]/10 hover:border-[#1A2656]/25",
    divider: "w-px h-5 bg-[#1A2656]/10 shrink-0",
    clearAll: "text-xs text-[#1A2656]/40 hover:text-[#E4002B] transition min-h-[44px] px-2",
    sortSelect:
      "text-xs border border-[#1A2656]/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#1A2656]/30 transition bg-white text-[#1A2656]/60 min-h-[44px]",
    count: "text-xs text-[#1A2656]/30 tabular-nums",
    genderOptions: [
      { value: "", label: "Todos" },
      { value: "male", label: "Hombre" },
      { value: "female", label: "Mujer" },
      { value: "kids", label: "Ninos" },
    ],
    categoryOptions: [
      { value: "", label: "Todos" },
      { value: "footwear", label: "Calzado" },
      { value: "apparel", label: "Ropa" },
      { value: "accessories", label: "Accesorios" },
    ],
  },
  grid: {
    pageBg: "min-h-screen bg-[#F5F0E8]",
    sectionTitle: "text-xs font-bold uppercase tracking-wide text-[#1A2656]",
    sectionRule: "flex-1 h-px bg-[#1A2656]/10",
    sectionCount: "text-xs text-[#1A2656]/25 tabular-nums",
    emptyIconWrap: "w-16 h-16 rounded-full bg-[#1A2656]/5 flex items-center justify-center mx-auto mb-4",
    emptyIcon: (
      <svg className="w-8 h-8 text-[#1A2656]/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    emptyText: "text-[#1A2656]/40 text-sm font-medium",
    emptyClear: "mt-3 text-sm text-[#E4002B] hover:text-[#c90025] font-medium transition",
    scrollTopBtn:
      "fixed bottom-24 right-4 z-30 w-10 h-10 bg-white border border-[#1A2656]/10 rounded-full shadow-md flex items-center justify-center text-[#1A2656]/40 hover:text-[#1A2656] transition min-w-[44px] min-h-[44px]",
  },
  cart: {
    tituloMini: "text-xs font-semibold text-[#1A2656]/50 uppercase tracking-wide",
    itemName: "text-sm text-[#1A2656] truncate block font-medium",
    itemMeta: "text-xs text-[#1A2656]/40",
    qtyBtn:
      "w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#1A2656] hover:bg-gray-100 rounded-lg transition text-sm min-w-[44px] min-h-[44px]",
    qtyNum: "text-sm tabular-nums text-[#1A2656] w-6 text-center font-semibold",
    lineTotal: "text-sm tabular-nums text-[#1A2656]/60 w-20 text-right font-medium",
    totalText: "text-sm font-bold text-[#1A2656]",
    vaciarBtn: "min-h-[44px] min-w-[44px] -my-2 inline-flex items-center justify-center text-xs text-gray-400 hover:text-[#E4002B] transition",
    summaryBtn:
      "flex items-center gap-2 px-3 py-3.5 rounded-xl bg-[#F5F0E8] text-[#1A2656] text-sm tabular-nums shrink-0 hover:bg-[#ebe5d9] transition min-h-[56px]",
    summaryMeta: "text-xs text-[#1A2656]/50",
    badge:
      "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#E4002B] text-white text-xs font-bold flex items-center justify-center",
    nameLabel: "block text-xs font-semibold uppercase tracking-wide text-[#1A2656]/50 mb-1",
    nameInput:
      "w-full rounded-lg border border-gray-200 bg-[#F5F0E8] px-3 py-2 min-h-[44px] text-base sm:text-sm text-[#1A2656] placeholder:text-[#1A2656]/30 focus:border-[#1A2656] focus:bg-white focus:outline-none transition",
    actionPublic: "bg-[#1A2656] hover:bg-[#131c40]",
    actionVendor: "bg-[#E4002B] hover:bg-[#c90025]",
    checkIconAlways: false,
    vendorArrow: true,
  },
  card: {
    ring: "ring-2 ring-emerald-400 scale-[1.02]",
    checkBubble: "w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg",
    checkStroke: "white",
    imageBg: "aspect-[4/3] bg-[#F5F0E8] relative overflow-hidden cursor-pointer",
    imageFit: "w-full h-full object-contain",
    placeholder: (
      <div className="w-full h-full flex items-center justify-center text-gray-300">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    ),
    name: "text-sm font-semibold text-[#1A2656] leading-5 h-5 truncate",
    skuPill: "text-xs bg-[#F5F0E8] text-[#1A2656]/50 px-1.5 py-0.5 rounded font-medium tabular-nums",
    priceNormal: "text-xl font-bold tabular-nums text-[#1A2656]",
    priceMeta: "text-xs text-[#1A2656]/40",
    bultoMeta: "text-xs text-[#1A2656]/50",
    stock: {
      strong: "text-[#1A2656]",
      soft: "text-[#1A2656]/45",
      agotado: "text-[#1A2656]/40",
    },
    addBtn: "bg-[#1A2656] text-white hover:bg-[#0f1a3d] active:scale-[0.97]",
    qtyWrap: "flex items-center justify-between bg-emerald-50 rounded-lg px-1 border border-emerald-100",
    qtyBtn: "text-emerald-700 hover:bg-emerald-100",
    qtyNum: "text-base font-bold text-emerald-700 tabular-nums",
    qtyUnit: "text-xs text-emerald-600 ml-1",
  },
  vendorShare: {
    enHeader: false,
    verPedidoBtn: null,
    btn: "text-xs border border-[#1A2656]/10 text-[#1A2656]/40 px-3 py-1.5 rounded-lg hover:border-[#1A2656]/25 hover:text-[#1A2656]/60 transition flex items-center gap-1.5 min-h-[44px]",
    pedidosBtn: "text-xs border border-[#1A2656]/10 text-[#1A2656] px-3 py-1.5 rounded-lg hover:border-[#1A2656]/25 transition flex items-center gap-1.5 min-h-[44px] font-medium",
    iconSize: 12,
    panel: "absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 w-48 z-50",
    item: "w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition flex items-center gap-2",
    copyLabel: "Copiar link público",
    stickyActionColor: "bg-[#E4002B] hover:bg-[#c90025]",
  },
  publico: { confirmingLabel: "Confirmando..." },
  pedidoPublico: {
    pageBg: "min-h-screen bg-[#F5F0E8]",
    spinner: "w-8 h-8 border-2 border-[#1A2656] border-t-transparent rounded-full animate-spin",
    itemImageBg: "w-14 h-14 rounded-lg bg-[#F5F0E8] flex-shrink-0 overflow-hidden",
    totalValue: "text-white font-bold text-xl tabular-nums",
    confirmBtn:
      "w-full bg-[#1A2656] text-white text-base font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition disabled:opacity-50",
    headerBg: "bg-[#1A2656]",
    sectionBg: "bg-[#1A2656]",
    panelBorder: "border-[#1A2656]/10",
    textStrong: "text-[#1A2656]",
    textSoft: "text-[#1A2656]/40",
    textHelp: "text-[#1A2656]/45",
    textFaint: "text-[#1A2656]/25",
    placeholderIcon: "text-[#1A2656]/20",
    pdfBtn:
      "flex items-center gap-2 px-6 py-3 bg-white border border-[#1A2656]/15 text-[#1A2656] rounded-lg font-medium text-sm hover:bg-[#1A2656]/5 active:scale-[0.97] transition disabled:opacity-50",
  },
  admin: {
    titulo: "Administrar",
    subtituloSync: (lastSync) => {
      const rel = relativo(lastSync);
      return `Sincronizado con Switch ${rel} · 1×/día`;
    },
    productsUrl: "/api/catalogo/reebok/products?scope=admin",
    metrics: (visibles) => {
      const sinFoto = visibles.filter((p) => !tieneFotoAdmin(p)).length;
      return [
        { label: "Productos", value: visibles.length },
        { label: "Sin foto", value: sinFoto, highlight: sinFoto > 0 },
        { label: "Footwear", value: visibles.filter((p) => p.category === "footwear").length },
        { label: "Apparel", value: visibles.filter((p) => p.category === "apparel").length },
        { label: "Accessories", value: visibles.filter((p) => p.category === "accessories").length },
      ];
    },
    excelSinFoto: async (sin) => {
      // Imports dinámicos: xlsx-js-style no entra al bundle inicial de la página.
      const [{ buildReebokSinFotoWorkbook }, { downloadWorkbook, exportFilename }] = await Promise.all([
        import("@/lib/catalogos/sinfoto-excel"),
        import("@/lib/excel-export"),
      ]);
      const wb = buildReebokSinFotoWorkbook(
        sin.map((p) => ({
          sku: p.sku || "",
          nombre: p.name || "",
          categoria: REEBOK_CATEGORIA_LABEL[p.category || ""] ?? (p.category || ""),
          disponible: p.disponibilidad ?? "",
          existencia: p.existencia ?? "",
        })),
      );
      downloadWorkbook(wb, exportFilename("reebok-sin-foto"));
    },
    fotoTabBadge: "chip",
    syncModulo: "catalogo-reebok",
    syncSubtext: "tarda ~3 min",
    toastBg: "fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A2656] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]",
    tabActive: "bg-white text-[#1A2656] shadow-sm",
    spinner: "w-8 h-8 border-2 border-[#E4002B] border-t-transparent rounded-full animate-spin",
    metricValue: "text-[#1A2656]",
    metricHighlightBox: "border-[#E4002B]/30 bg-[#E4002B]/5",
    metricHighlightValue: "text-[#E4002B]",
    productosStyle: "tarjetas",
    nombreEditable: false,
    importarTab: false,
    badgeEditable: true,
    productEdit: { idField: "id", verb: "PUT" },
    pedidos: {
      linkBadge: "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700",
      linkBadgeCheck: "w-3 h-3 text-emerald-600",
      filterActive: "text-[#1A2656] border-[#1A2656]",
      searchFocus: "w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1A2656]/30 transition",
      deleteModal: "confirm",
      exportFilename: "Pedidos-Reebok",
    },
  },
  producto: {
    estilo: "tallas",
    volverClass: "text-sm text-reebok-red hover:underline mb-6 inline-block",
    imageWrap: "aspect-square bg-reebok-grey rounded-lg overflow-hidden",
    price: "text-2xl font-bold text-reebok-red mb-4",
    sizeActive: "bg-reebok-dark text-white border-reebok-dark",
    sizeInactive: "border-gray-300 hover:border-reebok-dark",
    addBtn:
      "w-full bg-reebok-red text-white py-3 rounded font-bold text-sm uppercase tracking-wide hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
    consultaWrap: "bg-reebok-grey p-4 rounded text-center",
  },
  pedido: {
    qtyInputClass: "w-14 min-h-[44px] text-center border-b border-gray-200 text-base md:text-sm outline-none focus:border-black tabular-nums",
    suggDropdownClass: "absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg overflow-hidden",
    suggItemClass: "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0",
    suggLimit: 5,
    clientNamePlaceholder: null,
    nameRefEnContenedor: true,
  },
  clientes: {
    nuevoBtn: "bg-reebok-red text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition",
    saveBtn: "flex-1 py-2 bg-reebok-red text-white rounded-full text-sm hover:bg-red-700 transition disabled:opacity-50",
  },
};

const JOYBEES: MarcaTheme = {
  marca: "joybees",
  label: "Joybees",
  labelUpper: "JOYBEES",
  empresaKey: "joystep",
  switchDirectorioLabel: "Joystep",

  api: "/api/catalogo/joybees",
  catalogoHref: "/catalogo/joybees",
  pedidosHref: "/catalogo/joybees/pedidos",
  checkoutHref: "/catalogo/joybees/checkout",
  confirmacionBase: "/catalogo/joybees/confirmacion",
  clientesHref: "/catalogo/joybees/clientes",
  publicoShareUrl: "https://www.fashiongr.com/catalogo-publico/joybees",
  pedidoPublicoBase: "/pedido-joybees",

  cartKey: "joybees_cart",
  publicCartKey: "joybees_public_cart",
  publicClientNameKey: "joybees_public_client_name",
  checkoutTokenKey: "joybees_checkout_token",

  bulto: () => joybeesBulto(),
  calcTotal: calculateJoybeesOrderTotal,
  sortOrderItems: null,
  pdfFallbackCategory: "footwear",
  itemsField: "joybees_order_items",
  genero: REEBOK_GENERO,

  features: {
    preorder: false,
    saleFilter: false,
    agrupacionPorModelo: true,
    inventarioPorTalla: false,
    categoryChips: false,
    // El corte de bultos dejaría pasar el 92% del catálogo y los precios no
    // tienen dispersión ($10 y $13 = 3 de cada 4 productos): no se agregan.
    filtroBultos: false,
    filtroPrecio: false,
    roleClienteGuard: false,
    navInicioRequiereRol: false,
  },

  metaTitle: "Joybees Panamá - Catálogo",
  metaDescription: "Catálogo de productos Joybees Panamá.",
  ogImage: "https://www.fashiongr.com/og/catalogo-joybees.png",

  checkoutAccent: "#404041",

  hub: {
    card: "bg-[#FFE443] border-[#FFE443]/30",
    name: "text-[#404041]",
    tag: "text-[#404041]/50",
    counter: "text-[#404041]/70",
    blob: "bg-[#404041]/10",
    primaryBtn: "bg-[#404041] text-white hover:bg-[#404041]/90",
    outlineBtn: "border border-[#404041]/40 text-[#404041] hover:bg-[#404041]/10",
    sinFoto: "text-[#8a1a1a] font-semibold",
  },

  // Logo REAL de la marca (abeja + wordmark, public/joybees/joybees-logo.png,
  // PNG con transparencia recortado del arte oficial). Antes estos tres
  // lugares mostraban el emoji 🐝 con la palabra en texto — un placeholder,
  // no el logo (Daniel consiguió el arte el 26-jul-2026). Patrón Reebok.
  logos: {
    navbar: () => <img src="/joybees/joybees-logo.png" alt="Joybees" className="h-6 w-auto" />,
    // A diferencia de Reebok, el PNG de Joybees SÍ trae el wordmark dentro:
    // no hace falta escribir "JOYBEES" al lado (se vería dos veces).
    header: () => (
      <div className="shrink-0">
        {/* Sin subtítulo "Catálogo Panamá" — podado en las 4 marcas (12-ago-2026). */}
        <img src="/joybees/joybees-logo.png" alt="Joybees" className="h-8 w-auto shrink-0" />
      </div>
    ),
    admin: () => (
      <div className="w-10 h-10 rounded-xl bg-[#FFE443] flex items-center justify-center">
        <span className="text-[#404041] font-extrabold text-sm">JB</span>
      </div>
    ),
    // Placa blanca: la banda del header del pedido público es gris oscuro
    // (#404041) y el wordmark del logo es exactamente ese gris — sin la placa
    // desaparecería. Mismo tratamiento que Reebok y Tommy.
    pedidoPublico: () => (
      <div className="shrink-0">
        <h1 className="inline-flex items-center rounded-lg bg-white px-2.5 py-2">
          <img src="/joybees/joybees-logo.png" alt="Joybees" className="h-6 w-auto shrink-0" />
        </h1>
      </div>
    ),
  },

  navbar: {
    accentBar: "bg-[#FFE443]",
    inicioLink: "text-xs text-[#404041] hover:text-[#FFE443] transition flex-shrink-0 py-2",
  },
  header: {
    fashionGroupBar: "w-1 h-4 bg-[#FFE443] rounded-full",
    fashionGroupText: "text-xs font-medium uppercase tracking-wide text-[#404041]/30",
  },
  filtros: {
    searchIcon: "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#404041]/30",
    searchInput:
      "w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-[#404041]/10 text-sm outline-none focus:border-[#FFE443] focus:ring-2 focus:ring-[#FFE443]/20 transition placeholder:text-[#404041]/25",
    searchClear:
      "absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#404041]/40 hover:text-[#404041] transition",
    searchPlaceholder: "Buscar por nombre o código...",
    chipLabel: "text-xs font-semibold text-[#404041]/40 uppercase tracking-wide mr-0.5",
    chipActive: "bg-[#404041] text-white shadow-sm",
    chipInactive: "bg-white text-[#404041]/60 border border-[#404041]/10 hover:border-[#404041]/25",
    divider: "w-px h-5 bg-[#404041]/10 shrink-0",
    clearAll: "text-xs text-[#404041]/40 hover:text-[#404041] transition min-h-[44px] px-2",
    sortSelect:
      "text-xs border border-[#404041]/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#404041]/30 transition bg-white text-[#404041]/60 min-h-[44px]",
    count: "text-xs text-[#404041]/30 tabular-nums",
    genderOptions: [
      { value: "", label: "Todos" },
      { value: "mujer", label: "Mujer" },
      { value: "hombre", label: "Hombre" },
      { value: "adultos", label: "Adultos" },
      { value: "kids", label: "Kids" },
      { value: "accesorios", label: "Accesorios" },
    ],
    categoryOptions: [],
  },
  grid: {
    pageBg: "min-h-screen bg-[#FFFEF5]",
    sectionTitle: "text-xs font-bold uppercase tracking-wide text-[#404041]",
    sectionRule: "flex-1 h-px bg-[#404041]/10",
    sectionCount: "text-xs text-[#404041]/25 tabular-nums",
    emptyIconWrap: "w-16 h-16 rounded-full bg-[#FFE443]/20 flex items-center justify-center mx-auto mb-4 text-2xl",
    emptyIcon: <>🐝</>,
    emptyText: "text-[#404041]/40 text-sm font-medium",
    emptyClear: "mt-3 text-sm text-[#404041] hover:text-black font-medium transition",
    scrollTopBtn:
      "fixed bottom-24 right-4 z-30 w-10 h-10 bg-white border border-[#404041]/10 rounded-full shadow-md flex items-center justify-center text-[#404041]/40 hover:text-[#404041] transition min-w-[44px] min-h-[44px]",
  },
  cart: {
    tituloMini: "text-xs font-semibold text-[#404041]/50 uppercase tracking-wide",
    itemName: "text-sm text-[#404041] truncate block font-medium",
    itemMeta: "text-xs text-[#404041]/40",
    qtyBtn:
      "w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#404041] hover:bg-gray-100 rounded-lg transition text-sm min-w-[44px] min-h-[44px]",
    qtyNum: "text-sm tabular-nums text-[#404041] w-6 text-center font-semibold",
    lineTotal: "text-sm tabular-nums text-[#404041]/60 w-20 text-right font-medium",
    totalText: "text-sm font-bold text-[#404041]",
    vaciarBtn: "min-h-[44px] min-w-[44px] -my-2 inline-flex items-center justify-center text-xs text-gray-400 hover:text-red-500 transition",
    summaryBtn:
      "flex items-center gap-2 px-3 py-3.5 rounded-xl bg-[#FFE443]/20 text-[#404041] text-sm tabular-nums shrink-0 hover:bg-[#FFE443]/30 transition min-h-[56px]",
    summaryMeta: "text-xs text-[#404041]/50",
    badge:
      "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#FFE443] text-[#404041] text-xs font-bold flex items-center justify-center",
    nameLabel: "block text-xs font-semibold uppercase tracking-wide text-[#404041]/50 mb-1",
    nameInput:
      "w-full rounded-lg border border-gray-200 bg-[#FFFEF5] px-3 py-2 min-h-[44px] text-base sm:text-sm text-[#404041] placeholder:text-[#404041]/30 focus:border-[#404041] focus:bg-white focus:outline-none transition",
    actionPublic: "bg-[#404041] hover:bg-[#2d2d2e]",
    actionVendor: "bg-[#404041] hover:bg-[#2d2d2e]",
    checkIconAlways: true,
    vendorArrow: false,
  },
  card: {
    ring: "ring-2 ring-[#FFE443] scale-[1.02]",
    checkBubble: "w-10 h-10 rounded-full bg-[#FFE443] flex items-center justify-center shadow-lg",
    checkStroke: "#404041",
    imageBg: "aspect-[4/3] bg-[#FFFEF5] relative overflow-hidden cursor-pointer",
    imageFit: "w-full h-full object-contain",
    placeholder: (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-4xl">🐝</div>
      </div>
    ),
    name: "text-sm font-semibold text-[#404041] leading-5 h-5 truncate",
    skuPill: "text-xs bg-[#FFE443]/25 text-[#404041]/50 px-1.5 py-0.5 rounded font-medium tabular-nums",
    priceNormal: "text-xl font-bold tabular-nums text-[#404041]",
    priceMeta: "text-xs text-[#404041]/40",
    bultoMeta: "text-xs text-[#404041]/50",
    stock: {
      strong: "text-[#404041]",
      soft: "text-[#404041]/45",
      agotado: "text-[#404041]/40",
    },
    addBtn: "bg-[#404041] text-white hover:bg-[#2a2a2b] active:scale-[0.97]",
    qtyWrap: "flex items-center justify-between bg-[#FFE443]/20 rounded-lg px-1 border border-[#FFE443]/40",
    qtyBtn: "text-[#404041] hover:bg-[#FFE443]/30",
    qtyNum: "text-base font-bold text-[#404041] tabular-nums",
    qtyUnit: "text-xs text-[#404041]/60 ml-1",
  },
  vendorShare: {
    enHeader: true,
    verPedidoBtn: "flex items-center gap-1.5 text-xs font-semibold text-[#404041] bg-[#FFE443] hover:bg-[#f5d90a] transition px-3 py-2 rounded-lg min-h-[44px]",
    btn: "flex items-center gap-1.5 text-xs text-[#404041]/50 hover:text-[#404041] transition px-3 py-2 rounded-lg border border-[#404041]/10 hover:border-[#404041]/20 min-h-[44px]",
    pedidosBtn: "flex items-center gap-1.5 text-xs text-[#404041] hover:text-black transition px-3 py-2 rounded-lg border border-[#404041]/10 hover:border-[#404041]/20 min-h-[44px] font-medium",
    iconSize: 14,
    panel: "absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-48 z-50",
    item: "w-full text-left px-4 py-2.5 text-sm text-[#404041] hover:bg-gray-50 transition flex items-center gap-2",
    copyLabel: "Copiar link público",
    stickyActionColor: null,
  },
  publico: { confirmingLabel: "Confirmando..." },
  pedidoPublico: {
    pageBg: "min-h-screen bg-[#FFFEF5]",
    spinner: "w-8 h-8 border-2 border-[#404041] border-t-transparent rounded-full animate-spin",
    itemImageBg: "w-14 h-14 rounded-lg bg-[#FFFEF5] flex-shrink-0 overflow-hidden",
    totalValue: "text-[#FFE443] font-bold text-xl tabular-nums",
    confirmBtn:
      "w-full bg-[#404041] text-white text-base font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition disabled:opacity-50",
    headerBg: "bg-[#404041]",
    sectionBg: "bg-[#404041]",
    panelBorder: "border-[#404041]/10",
    textStrong: "text-[#404041]",
    textSoft: "text-[#404041]/40",
    textHelp: "text-[#404041]/45",
    textFaint: "text-[#404041]/25",
    placeholderIcon: "text-[#404041]/20",
    pdfBtn:
      "flex items-center gap-2 px-6 py-3 bg-white border border-[#404041]/15 text-[#404041] rounded-lg font-medium text-sm hover:bg-[#404041]/5 active:scale-[0.97] transition disabled:opacity-50",
  },
  admin: {
    titulo: "Administrar",
    subtituloSync: (lastSync) =>
      `Se llena solo desde Switch por existencia · tú solo subes fotos${
        lastSync
          ? ` · sincronizado ${new Date(lastSync).toLocaleString("es-PA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
          : ""
      }`,
    productsUrl: "/api/catalogo/joybees/products",
    metrics: (visibles) => {
      const sinFoto = visibles.filter((p) => !tieneFotoAdmin(p)).length;
      return [
        { label: "Productos", value: visibles.length },
        { label: "Sin foto", value: sinFoto, highlight: sinFoto > 0 },
        { label: "Clogs", value: visibles.filter((p) => tipoJoybees(p.name) === "Clogs").length },
        { label: "Sandalias", value: visibles.filter((p) => tipoJoybees(p.name) === "Sandalias").length },
        { label: "Flips", value: visibles.filter((p) => tipoJoybees(p.name) === "Flips").length },
      ];
    },
    excelSinFoto: async (sin) => {
      // Imports dinámicos: xlsx-js-style no entra al bundle inicial de la página.
      const { buildReportSheet, workbookFromSheets, downloadWorkbook, exportFilename, fmtFechaExcel, JOYBEES_PALETTE } =
        await import("@/lib/excel-export");
      const { buildDashBusquedaSheets } = await import("@/lib/catalogos/dash-busqueda-excel");
      const ws = buildReportSheet({
        title: "JOYBEES — Productos sin foto",
        subtitle: `${sin.length} producto${sin.length !== 1 ? "s" : ""} sin foto  ·  ${fmtFechaExcel(new Date().toISOString())}`,
        columns: [
          { header: "Código", wch: 18 },
          { header: "Descripción", wch: 40 },
          { header: "Tipo", wch: 12 },
          { header: "Género", wch: 12 },
          { header: "Stock", wch: 10, align: "right", fmt: "0" },
        ],
        rows: sin.map((p) => [p.sku || "", p.name || "", tipoJoybees(p.name) ?? "", JOYBEES_GENERO_LABEL[p.gender || ""] ?? (p.gender || ""), p.stock ?? ""]),
        palette: JOYBEES_PALETTE,
      });
      // La hoja de la plantilla del banco B2B va PRIMERA (ver dash-busqueda-excel).
      const wb = workbookFromSheets([
        ...buildDashBusquedaSheets(sin.map((p) => p.sku)),
        { name: "Sin foto", ws },
      ]);
      downloadWorkbook(wb, exportFilename("joybees-sin-foto"));
    },
    fotoTabBadge: "inline",
    syncModulo: "catalogo-joybees",
    syncSubtext: "tarda ~1-2 min",
    toastBg: "fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#404041] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]",
    tabActive: "bg-white text-[#404041] shadow-sm",
    spinner: "w-8 h-8 border-2 border-[#FFE443] border-t-transparent rounded-full animate-spin",
    metricValue: "text-[#404041]",
    metricHighlightBox: "border-amber-300 bg-amber-50",
    metricHighlightValue: "text-amber-600",
    productosStyle: "batch",
    nombreEditable: false,
    importarTab: true,
    badgeEditable: false,
    productEdit: { idField: "sku", verb: "POST" },
    pedidos: {
      linkBadge: "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#FFE443] text-[#404041]",
      linkBadgeCheck: "w-3 h-3 text-emerald-700",
      filterActive: "text-[#404041] border-[#404041]",
      searchFocus: "w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#404041]/30 transition",
      deleteModal: "confirm-delete",
      exportFilename: "Pedidos-Joybees",
    },
  },
  producto: {
    estilo: "variantes",
    volverClass: "text-sm text-[#404041] hover:underline mb-6 inline-block",
    imageWrap: "aspect-square bg-[#FFFEF5] border border-[#404041]/10 rounded-lg overflow-hidden",
    price: "text-2xl font-bold text-[#404041] mb-4",
    sizeActive: "bg-[#404041] text-white border-[#404041]",
    sizeInactive: "border-gray-300 hover:border-[#404041]",
    addBtn:
      "w-full bg-[#FFE443] text-[#404041] py-3 rounded font-bold text-sm uppercase tracking-wide hover:bg-[#f5d90a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
    consultaWrap: "bg-[#FFFEF5] border border-[#404041]/10 p-4 rounded text-center",
  },
  pedido: {
    qtyInputClass: "w-12 text-center border-b border-gray-200 text-sm py-0.5 outline-none focus:border-black tabular-nums",
    suggDropdownClass: "absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-sm max-h-56 overflow-y-auto",
    suggItemClass: "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition",
    suggLimit: null,
    clientNamePlaceholder: "Nombre del cliente",
    nameRefEnContenedor: false,
  },
  clientes: {
    nuevoBtn: "bg-[#FFE443] text-[#404041] px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#f5d90a] transition",
    saveBtn: "flex-1 py-2 bg-[#FFE443] text-[#404041] rounded-full text-sm font-semibold hover:bg-[#f5d90a] transition disabled:opacity-50",
  },
};

// ─── TOMMY HILFIGER ──────────────────────────────────────────────────────────
// Paleta: navy #152342, rojo #AE0029, blanco (wordmark #102039). Página casi
// blanca (#F6F7F9) con cards blancas — look limpio "prep" de la marca. Grid
// PLANA (sin agrupación por modelo), ficha simple por variantes, admin estilo
// batch (648 productos calzado con TODAS las fotos pendientes → subida masiva
// nombre-de-archivo=SKU es el flujo dominante). Sin pre-orden ni saleFilter.
// Chips de categoría = las categorías parseadas de Switch (tommy-nombres.ts).
const TOMMY: MarcaTheme = {
  marca: "tommy",
  label: "Tommy Hilfiger",
  labelUpper: "TOMMY HILFIGER",
  empresaKey: "fashion_shoes",
  switchDirectorioLabel: "Fashion Shoes",

  api: "/api/catalogo/tommy",
  catalogoHref: "/catalogo/tommy",
  pedidosHref: "/catalogo/tommy/pedidos",
  checkoutHref: "/catalogo/tommy/checkout",
  confirmacionBase: "/catalogo/tommy/confirmacion",
  clientesHref: "/catalogo/tommy/clientes",
  publicoShareUrl: "https://www.fashiongr.com/catalogo-publico/tommy",
  pedidoPublicoBase: "/pedido-tommy",

  cartKey: "tommy_cart",
  publicCartKey: "tommy_public_cart",
  publicClientNameKey: "tommy_public_client_name",
  checkoutTokenKey: "tommy_checkout_token",

  bulto: (c, bultoPzas) => tommyBulto(c, bultoPzas),
  calcTotal: calculateTommyOrderTotal,
  sortOrderItems: null,
  pdfFallbackCategory: "footwear",
  itemsField: "tommy_order_items",
  genero: {
    match: matchesTommyGenderFilter,
    groupKey: tommyGenderGroupKey,
    groupLabel: tommyGenderGroupLabel,
    groupOrder: tommyGenderGroupOrder,
    filterLabel: tommyGenderFilterLabel,
    pdfSections: TOMMY_PDF_GENDER_SECTIONS,
  },

  features: {
    preorder: false,        // sin pre-orden (decisión Daniel, como Joybees)
    saleFilter: false,
    agrupacionPorModelo: false, // grid PLANA
    inventarioPorTalla: false,
    categoryChips: true,    // categorías parseadas de la descripcion Switch
    filtroBultos: true,     // "2 bultos o más" (aprobado 25-jul-2026)
    filtroPrecio: true,     // rango de precio por pieza (4 tramos medidos)
    roleClienteGuard: false,
    navInicioRequiereRol: false,
  },

  metaTitle: "Tommy Hilfiger Panamá - Catálogo",
  metaDescription: "Catálogo de calzado Tommy Hilfiger Panamá.",
  ogImage: "https://www.fashiongr.com/og/catalogo-tommy.png",

  checkoutAccent: "#152342",

  hub: {
    card: "bg-[#152342] border-[#152342]/10",
    name: "text-white",
    tag: "text-white/50",
    counter: "text-white/70",
    blob: "bg-[#AE0029]/15",
    primaryBtn: "bg-white text-[#152342] hover:bg-white/90",
    outlineBtn: "border border-white/40 text-white hover:bg-white/10",
    sinFoto: "text-[#FFD1D1] font-semibold",
  },

  logos: {
    // Navbar SIN logo: la navbar de Tommy queda solo con "← Inicio". La
    // identidad (bandera + wordmark TOMMY HILFIGER) vive ENTERA en el header
    // grande de abajo. Antes la bandera estaba en los dos lugares y se veía el
    // mismo logo repetido en la misma pantalla (Daniel, 25-jul-2026).
    navbar: null,
    header: () => (
      <div className="flex items-center gap-2.5 shrink-0">
        <img src="/tommy/tommy-flag.png" alt="" className="w-9 h-6 object-contain shrink-0" />
        <div className="shrink-0">
          {/* Sin subtítulo "Catálogo Panamá" — podado en las 4 marcas (12-ago-2026). */}
          <img src="/tommy/tommy-horizontal.png" alt="TOMMY HILFIGER" className="h-4 w-auto shrink-0" />
        </div>
      </div>
    ),
    admin: () => (
      <div className="w-10 h-10 rounded-xl bg-white border border-[#152342]/15 flex items-center justify-center">
        <img src="/tommy/tommy-flag.png" alt="Tommy" className="w-7 h-5 object-contain" />
      </div>
    ),
    // Logo REAL sobre placa blanca. El wordmark oficial es navy (#00154D) y la
    // banda del header del pedido público es navy también: sin la placa el logo
    // desaparecería. Antes decía "TOMMY HILFIGER" en texto — es el lugar que
    // Daniel vio en el link público (25-jul-2026).
    pedidoPublico: () => (
      <div className="shrink-0">
        <h1 className="inline-flex items-center rounded-lg bg-white px-2.5 py-2">
          <img src="/tommy/tommy-horizontal.png" alt="TOMMY HILFIGER" className="h-3 w-auto shrink-0" />
        </h1>
      </div>
    ),
  },

  navbar: {
    accentBar: "bg-[#AE0029]",
    inicioLink: "text-xs text-[#152342] hover:text-[#AE0029] transition flex-shrink-0 py-2",
  },
  header: {
    fashionGroupBar: "w-1 h-4 bg-[#AE0029] rounded-full",
    fashionGroupText: "text-xs font-medium uppercase tracking-wide text-[#152342]/30",
  },
  filtros: {
    searchIcon: "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#152342]/30",
    searchInput:
      "w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-[#152342]/10 text-sm outline-none focus:border-[#152342]/30 focus:ring-2 focus:ring-[#152342]/5 transition placeholder:text-[#152342]/25",
    searchClear:
      "absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#152342]/40 hover:text-[#152342] transition",
    searchPlaceholder: "Buscar por nombre o código...",
    chipLabel: "text-xs font-semibold text-[#152342]/40 uppercase tracking-wide mr-0.5",
    chipActive: "bg-[#152342] text-white shadow-sm",
    chipInactive: "bg-white text-[#152342]/60 border border-[#152342]/10 hover:border-[#152342]/25",
    divider: "w-px h-5 bg-[#152342]/10 shrink-0",
    clearAll: "text-xs text-[#152342]/40 hover:text-[#AE0029] transition min-h-[44px] px-2",
    sortSelect:
      "text-xs border border-[#152342]/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#152342]/30 transition bg-white text-[#152342]/60 min-h-[44px]",
    count: "text-xs text-[#152342]/30 tabular-nums",
    // Tommy filtra por los CUATRO géneros de Switch (tommy-gender.ts), no por
    // los grupos de Reebok: aquí Boys y Girls son secciones distintas y las
    // etiquetas son las de Switch, coherentes con el nombre del producto
    // ("Women-Slippers") y con el encabezado de sección ("SLIPPERS — WOMEN").
    genderOptions: [
      { value: "", label: "Todos" },
      { value: "women", label: "Women" },
      { value: "men", label: "Men" },
      { value: "boys", label: "Boys" },
      { value: "girls", label: "Girls" },
    ],
    categoryOptions: [
      { value: "", label: "Todos" },
      { value: "sneakers", label: "Sneakers" },
      { value: "flip_flops", label: "Flip Flops" },
      { value: "sandals", label: "Sandals" },
      { value: "shoes", label: "Shoes" },
      { value: "slippers", label: "Slippers" },
      { value: "boots", label: "Boots" },
    ],
  },
  grid: {
    pageBg: "min-h-screen bg-[#F6F7F9]",
    sectionTitle: "text-xs font-bold uppercase tracking-wide text-[#152342]",
    sectionRule: "flex-1 h-px bg-[#152342]/10",
    sectionCount: "text-xs text-[#152342]/25 tabular-nums",
    emptyIconWrap: "w-16 h-16 rounded-full bg-[#152342]/5 flex items-center justify-center mx-auto mb-4",
    emptyIcon: (
      <svg className="w-8 h-8 text-[#152342]/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    emptyText: "text-[#152342]/40 text-sm font-medium",
    emptyClear: "mt-3 text-sm text-[#AE0029] hover:text-[#8c0021] font-medium transition",
    scrollTopBtn:
      "fixed bottom-24 right-4 z-30 w-10 h-10 bg-white border border-[#152342]/10 rounded-full shadow-md flex items-center justify-center text-[#152342]/40 hover:text-[#152342] transition min-w-[44px] min-h-[44px]",
  },
  cart: {
    tituloMini: "text-xs font-semibold text-[#152342]/50 uppercase tracking-wide",
    itemName: "text-sm text-[#152342] truncate block font-medium",
    itemMeta: "text-xs text-[#152342]/40",
    qtyBtn:
      "w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#152342] hover:bg-gray-100 rounded-lg transition text-sm min-w-[44px] min-h-[44px]",
    qtyNum: "text-sm tabular-nums text-[#152342] w-6 text-center font-semibold",
    lineTotal: "text-sm tabular-nums text-[#152342]/60 w-20 text-right font-medium",
    totalText: "text-sm font-bold text-[#152342]",
    vaciarBtn: "min-h-[44px] min-w-[44px] -my-2 inline-flex items-center justify-center text-xs text-gray-400 hover:text-[#AE0029] transition",
    summaryBtn:
      "flex items-center gap-2 px-3 py-3.5 rounded-xl bg-[#152342]/5 text-[#152342] text-sm tabular-nums shrink-0 hover:bg-[#152342]/10 transition min-h-[56px]",
    summaryMeta: "text-xs text-[#152342]/50",
    badge:
      "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#AE0029] text-white text-xs font-bold flex items-center justify-center",
    nameLabel: "block text-xs font-semibold uppercase tracking-wide text-[#152342]/50 mb-1",
    nameInput:
      "w-full rounded-lg border border-gray-200 bg-[#F6F7F9] px-3 py-2 min-h-[44px] text-base sm:text-sm text-[#152342] placeholder:text-[#152342]/30 focus:border-[#152342] focus:bg-white focus:outline-none transition",
    actionPublic: "bg-[#152342] hover:bg-[#0e1830]",
    actionVendor: "bg-[#152342] hover:bg-[#0e1830]",
    checkIconAlways: true,
    vendorArrow: false,
  },
  card: {
    ring: "ring-2 ring-[#152342] scale-[1.02]",
    checkBubble: "w-10 h-10 rounded-full bg-[#152342] flex items-center justify-center shadow-lg",
    checkStroke: "white",
    imageBg: "aspect-[4/3] bg-[#F6F7F9] relative overflow-hidden cursor-pointer",
    imageFit: "w-full h-full object-contain",
    placeholder: (
      <div className="w-full h-full flex items-center justify-center text-gray-300">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    ),
    name: "text-sm font-semibold text-[#152342] leading-5 h-5 truncate",
    skuPill: "text-xs bg-[#F6F7F9] text-[#152342]/50 px-1.5 py-0.5 rounded font-medium tabular-nums",
    priceNormal: "text-xl font-bold tabular-nums text-[#152342]",
    priceMeta: "text-xs text-[#152342]/40",
    bultoMeta: "text-xs text-[#152342]/50",
    stock: {
      strong: "text-[#152342]",
      soft: "text-[#152342]/45",
      agotado: "text-[#152342]/40",
    },
    addBtn: "bg-[#152342] text-white hover:bg-[#0e1830] active:scale-[0.97]",
    qtyWrap: "flex items-center justify-between bg-[#152342]/5 rounded-lg px-1 border border-[#152342]/15",
    qtyBtn: "text-[#152342] hover:bg-[#152342]/10",
    qtyNum: "text-base font-bold text-[#152342] tabular-nums",
    qtyUnit: "text-xs text-[#152342]/60 ml-1",
  },
  vendorShare: {
    enHeader: true,
    verPedidoBtn:
      "flex items-center gap-1.5 text-xs font-semibold text-white bg-[#152342] hover:bg-[#0e1830] transition px-3 py-2 rounded-lg min-h-[44px]",
    btn: "flex items-center gap-1.5 text-xs text-[#152342]/50 hover:text-[#152342] transition px-3 py-2 rounded-lg border border-[#152342]/10 hover:border-[#152342]/20 min-h-[44px]",
    pedidosBtn: "flex items-center gap-1.5 text-xs text-[#152342] hover:text-[#AE0029] transition px-3 py-2 rounded-lg border border-[#152342]/10 hover:border-[#152342]/20 min-h-[44px] font-medium",
    iconSize: 14,
    panel: "absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-48 z-50",
    item: "w-full text-left px-4 py-2.5 text-sm text-[#152342] hover:bg-gray-50 transition flex items-center gap-2",
    copyLabel: "Copiar link público",
    stickyActionColor: "bg-[#AE0029] hover:bg-[#8c0021]",
  },
  publico: { confirmingLabel: "Confirmando..." },
  pedidoPublico: {
    pageBg: "min-h-screen bg-[#F6F7F9]",
    spinner: "w-8 h-8 border-2 border-[#152342] border-t-transparent rounded-full animate-spin",
    itemImageBg: "w-14 h-14 rounded-lg bg-[#F6F7F9] flex-shrink-0 overflow-hidden",
    totalValue: "text-white font-bold text-xl tabular-nums",
    confirmBtn:
      "w-full bg-[#152342] text-white text-base font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition disabled:opacity-50",
    headerBg: "bg-[#152342]",
    sectionBg: "bg-[#152342]",
    panelBorder: "border-[#152342]/10",
    textStrong: "text-[#152342]",
    textSoft: "text-[#152342]/40",
    textHelp: "text-[#152342]/45",
    textFaint: "text-[#152342]/25",
    placeholderIcon: "text-[#152342]/20",
    pdfBtn:
      "flex items-center gap-2 px-6 py-3 bg-white border border-[#152342]/15 text-[#152342] rounded-lg font-medium text-sm hover:bg-[#152342]/5 active:scale-[0.97] transition disabled:opacity-50",
  },
  admin: {
    titulo: "Administrar",
    subtituloSync: (lastSync) =>
      `Se llena solo desde Switch por existencia · tú solo subes fotos${
        lastSync
          ? ` · sincronizado ${new Date(lastSync).toLocaleString("es-PA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
          : ""
      }`,
    productsUrl: "/api/catalogo/tommy/products",
    metrics: (visibles) => {
      const sinFoto = visibles.filter((p) => !tieneFotoAdmin(p)).length;
      return [
        { label: "Productos", value: visibles.length },
        { label: "Sin foto", value: sinFoto, highlight: sinFoto > 0 },
        { label: "Sneakers", value: visibles.filter((p) => p.category === "sneakers").length },
        { label: "Flip Flops", value: visibles.filter((p) => p.category === "flip_flops").length },
        { label: "Sandalias", value: visibles.filter((p) => p.category === "sandals").length },
      ];
    },
    excelSinFoto: async (sin) => {
      // Imports dinámicos: xlsx-js-style no entra al bundle inicial de la página.
      const { buildReportSheet, workbookFromSheets, downloadWorkbook, exportFilename, fmtFechaExcel, TOMMY_PALETTE } =
        await import("@/lib/excel-export");
      const { buildDashBusquedaSheets } = await import("@/lib/catalogos/dash-busqueda-excel");
      const ws = buildReportSheet({
        title: "TOMMY HILFIGER — Productos sin foto",
        subtitle: `${sin.length} producto${sin.length !== 1 ? "s" : ""} sin foto  ·  ${fmtFechaExcel(new Date().toISOString())}`,
        columns: [
          { header: "Código", wch: 18 },
          { header: "Nombre", wch: 40 },
          { header: "Categoría", wch: 14 },
          { header: "Género", wch: 12 },
          { header: "Stock", wch: 10, align: "right", fmt: "0" },
        ],
        rows: sin.map((p) => [
          p.sku || "",
          p.name || "",
          TOMMY_CATEGORIA_LABEL[p.category || ""] ?? (p.category || ""),
          TOMMY_GENERO_LABEL[p.gender || ""] ?? (p.gender || ""),
          p.stock ?? "",
        ]),
        palette: TOMMY_PALETTE,
      });
      // La hoja de la plantilla del banco B2B va PRIMERA (ver dash-busqueda-excel).
      const wb = workbookFromSheets([
        ...buildDashBusquedaSheets(sin.map((p) => p.sku)),
        { name: "Sin foto", ws },
      ]);
      downloadWorkbook(wb, exportFilename("tommy-sin-foto"));
    },
    fotoTabBadge: "inline",
    syncModulo: "catalogo-tommy",
    syncSubtext: "tarda ~2-3 min",
    toastBg: "fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#152342] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]",
    tabActive: "bg-white text-[#152342] shadow-sm",
    spinner: "w-8 h-8 border-2 border-[#AE0029] border-t-transparent rounded-full animate-spin",
    metricValue: "text-[#152342]",
    metricHighlightBox: "border-[#AE0029]/30 bg-[#AE0029]/5",
    metricHighlightValue: "text-[#AE0029]",
    productosStyle: "batch",
    nombreEditable: true,
    importarTab: false,
    badgeEditable: false,
    productEdit: { idField: "sku", verb: "POST" },
    bultoEditable: true,
    pedidos: {
      linkBadge: "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#152342]/10 text-[#152342]",
      linkBadgeCheck: "w-3 h-3 text-emerald-600",
      filterActive: "text-[#152342] border-[#152342]",
      searchFocus: "w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#152342]/30 transition",
      deleteModal: "confirm-delete",
      exportFilename: "Pedidos-Tommy",
    },
  },
  producto: {
    estilo: "variantes",
    volverClass: "text-sm text-[#152342] hover:underline mb-6 inline-block",
    imageWrap: "aspect-square bg-[#F6F7F9] border border-[#152342]/10 rounded-lg overflow-hidden",
    price: "text-2xl font-bold text-[#152342] mb-4",
    sizeActive: "bg-[#152342] text-white border-[#152342]",
    sizeInactive: "border-gray-300 hover:border-[#152342]",
    addBtn:
      "w-full bg-[#152342] text-white py-3 rounded font-bold text-sm uppercase tracking-wide hover:bg-[#0e1830] transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
    consultaWrap: "bg-[#F6F7F9] border border-[#152342]/10 p-4 rounded text-center",
  },
  pedido: {
    qtyInputClass: "w-12 text-center border-b border-gray-200 text-sm py-0.5 outline-none focus:border-black tabular-nums",
    suggDropdownClass: "absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-sm max-h-56 overflow-y-auto",
    suggItemClass: "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition",
    suggLimit: null,
    clientNamePlaceholder: "Nombre del cliente",
    nameRefEnContenedor: false,
  },
  clientes: {
    nuevoBtn: "bg-[#152342] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#0e1830] transition",
    saveBtn: "flex-1 py-2 bg-[#152342] text-white rounded-full text-sm font-semibold hover:bg-[#0e1830] transition disabled:opacity-50",
  },
};

// ── CALVIN KLEIN ─────────────────────────────────────────────────────────────
// Paleta: blanco/negro minimalista — la identidad de la marca (negro #1A1A1A
// sobre página casi blanca #FAFAFA, sin color de acento: el "acento" es el
// negro pleno). Wordmark OFICIAL "Calvin Klein" (public/calvin/
// calvin-wordmark*.png, derivado del master que mandó Daniel el 12-ago-2026
// con scripts/_generar-logo-calvin.mjs).
// Grid PLANA, admin estilo batch, sin pre-orden ni saleFilter — espejo
// funcional de Tommy: mismo flujo de fotos B2B Dash de PVH, bulto 8/12 por
// producto (default 12), name editable (nombre_manual). Chips de categoría =
// las categorías parseadas de Switch (calvin-nombres.ts, 13 valores medidos).
// filtroBultos/filtroPrecio como Tommy: los precios CK con stock van de 15 a
// 55 dólares (medido 12-ago-2026) y los tramos existentes los cortan bien.
const CALVIN: MarcaTheme = {
  marca: "calvin",
  label: "Calvin Klein",
  labelUpper: "CALVIN KLEIN",
  empresaKey: "vistana",
  switchDirectorioLabel: "Vistana International",

  api: "/api/catalogo/calvin",
  catalogoHref: "/catalogo/calvin",
  pedidosHref: "/catalogo/calvin/pedidos",
  checkoutHref: "/catalogo/calvin/checkout",
  confirmacionBase: "/catalogo/calvin/confirmacion",
  clientesHref: "/catalogo/calvin/clientes",
  publicoShareUrl: "https://www.fashiongr.com/catalogo-publico/calvin",
  pedidoPublicoBase: "/pedido-calvin",

  cartKey: "calvin_cart",
  publicCartKey: "calvin_public_cart",
  publicClientNameKey: "calvin_public_client_name",
  checkoutTokenKey: "calvin_checkout_token",

  bulto: (c, bultoPzas) => calvinBulto(c, bultoPzas),
  calcTotal: calculateCalvinOrderTotal,
  sortOrderItems: null,
  pdfFallbackCategory: "footwear",
  itemsField: "calvin_order_items",
  genero: {
    match: matchesCalvinGenderFilter,
    groupKey: calvinGenderGroupKey,
    groupLabel: calvinGenderGroupLabel,
    groupOrder: calvinGenderGroupOrder,
    filterLabel: calvinGenderFilterLabel,
    pdfSections: CALVIN_PDF_GENDER_SECTIONS,
  },

  features: {
    preorder: false,        // sin pre-orden (decisión Daniel, solo Reebok)
    saleFilter: false,
    agrupacionPorModelo: false, // grid PLANA
    inventarioPorTalla: false,
    categoryChips: true,    // categorías parseadas de la descripcion Switch
    filtroBultos: true,     // "2 bultos o más" (paridad Tommy)
    filtroPrecio: true,     // rango de precio por pieza (dispersión medida 15-55)
    roleClienteGuard: false,
    navInicioRequiereRol: false,
  },

  metaTitle: "Calvin Klein Panamá - Catálogo",
  metaDescription: "Catálogo de calzado Calvin Klein Panamá.",
  ogImage: "https://www.fashiongr.com/og/catalogo-calvin.png",

  checkoutAccent: "#1A1A1A",

  hub: {
    card: "bg-[#0A0A0A] border-white/10",
    name: "text-white",
    tag: "text-white/50",
    counter: "text-white/70",
    blob: "bg-white/10",
    primaryBtn: "bg-white text-[#0A0A0A] hover:bg-white/90",
    outlineBtn: "border border-white/40 text-white hover:bg-white/10",
    sinFoto: "text-white font-semibold underline decoration-white/40",
  },

  logos: {
    // Navbar SIN logo (patrón Tommy): la identidad vive ENTERA en el header
    // grande de abajo — el mismo wordmark dos veces en la misma pantalla es lo
    // que Daniel hizo quitar en Tommy (25-jul-2026).
    navbar: null,
    header: () => (
      <div className="shrink-0">
        {/* Sin subtítulo "Catálogo Panamá" — podado en las 4 marcas (12-ago-2026). */}
        <img src="/calvin/calvin-wordmark.png" alt="CALVIN KLEIN" className="h-4 w-auto shrink-0" />
      </div>
    ),
    admin: () => (
      <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] flex items-center justify-center">
        <span className="text-white font-extrabold text-xs tracking-tight">CK</span>
      </div>
    ),
    // Wordmark blanco directo sobre la banda negra: a diferencia de Tommy y
    // Reebok acá NO hace falta placa blanca — el logo oficial tiene versión
    // blanca monocroma y el fondo de la banda es el negro de la marca.
    pedidoPublico: () => (
      <div className="shrink-0">
        <h1 className="inline-flex items-center py-1.5">
          <img src="/calvin/calvin-wordmark-blanco.png" alt="CALVIN KLEIN" className="h-3.5 w-auto shrink-0" />
        </h1>
      </div>
    ),
  },

  navbar: {
    accentBar: "bg-[#1A1A1A]",
    inicioLink: "text-xs text-[#1A1A1A] hover:text-black transition flex-shrink-0 py-2",
  },
  header: {
    fashionGroupBar: "w-1 h-4 bg-[#1A1A1A] rounded-full",
    fashionGroupText: "text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/30",
  },
  filtros: {
    searchIcon: "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1A1A1A]/30",
    searchInput:
      "w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-[#1A1A1A]/10 text-sm outline-none focus:border-[#1A1A1A]/30 focus:ring-2 focus:ring-[#1A1A1A]/5 transition placeholder:text-[#1A1A1A]/25",
    searchClear:
      "absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#1A1A1A]/40 hover:text-[#1A1A1A] transition",
    searchPlaceholder: "Buscar por nombre o código...",
    chipLabel: "text-xs font-semibold text-[#1A1A1A]/40 uppercase tracking-wide mr-0.5",
    chipActive: "bg-[#1A1A1A] text-white shadow-sm",
    chipInactive: "bg-white text-[#1A1A1A]/60 border border-[#1A1A1A]/10 hover:border-[#1A1A1A]/25",
    divider: "w-px h-5 bg-[#1A1A1A]/10 shrink-0",
    clearAll: "text-xs text-[#1A1A1A]/40 hover:text-black transition min-h-[44px] px-2",
    sortSelect:
      "text-xs border border-[#1A1A1A]/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#1A1A1A]/30 transition bg-white text-[#1A1A1A]/60 min-h-[44px]",
    count: "text-xs text-[#1A1A1A]/30 tabular-nums",
    // Calvin filtra por los CUATRO géneros de Switch (calvin-gender.ts), igual
    // que Tommy: Boys y Girls son secciones distintas y las etiquetas son las
    // de Switch, coherentes con el nombre del producto ("Women-Sandals") y con
    // el encabezado de sección ("SANDALS — WOMEN").
    genderOptions: [
      { value: "", label: "Todos" },
      { value: "women", label: "Women" },
      { value: "men", label: "Men" },
      { value: "boys", label: "Boys" },
      { value: "girls", label: "Girls" },
    ],
    categoryOptions: [
      { value: "", label: "Todos" },
      { value: "sneakers", label: "Sneakers" },
      { value: "flip_flops", label: "Flip Flops" },
      { value: "sandals", label: "Sandals" },
      { value: "shoes", label: "Shoes" },
      { value: "slippers", label: "Slippers" },
      { value: "boots", label: "Boots" },
    ],
  },
  grid: {
    pageBg: "min-h-screen bg-[#FAFAFA]",
    sectionTitle: "text-xs font-bold uppercase tracking-wide text-[#1A1A1A]",
    sectionRule: "flex-1 h-px bg-[#1A1A1A]/10",
    sectionCount: "text-xs text-[#1A1A1A]/25 tabular-nums",
    emptyIconWrap: "w-16 h-16 rounded-full bg-[#1A1A1A]/5 flex items-center justify-center mx-auto mb-4",
    emptyIcon: (
      <svg className="w-8 h-8 text-[#1A1A1A]/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    emptyText: "text-[#1A1A1A]/40 text-sm font-medium",
    emptyClear: "mt-3 text-sm text-[#1A1A1A] hover:text-black font-medium underline transition",
    scrollTopBtn:
      "fixed bottom-24 right-4 z-30 w-10 h-10 bg-white border border-[#1A1A1A]/10 rounded-full shadow-md flex items-center justify-center text-[#1A1A1A]/40 hover:text-[#1A1A1A] transition min-w-[44px] min-h-[44px]",
  },
  cart: {
    tituloMini: "text-xs font-semibold text-[#1A1A1A]/50 uppercase tracking-wide",
    itemName: "text-sm text-[#1A1A1A] truncate block font-medium",
    itemMeta: "text-xs text-[#1A1A1A]/40",
    qtyBtn:
      "w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#1A1A1A] hover:bg-gray-100 rounded-lg transition text-sm min-w-[44px] min-h-[44px]",
    qtyNum: "text-sm tabular-nums text-[#1A1A1A] w-6 text-center font-semibold",
    lineTotal: "text-sm tabular-nums text-[#1A1A1A]/60 w-20 text-right font-medium",
    totalText: "text-sm font-bold text-[#1A1A1A]",
    vaciarBtn: "min-h-[44px] min-w-[44px] -my-2 inline-flex items-center justify-center text-xs text-gray-400 hover:text-black transition",
    summaryBtn:
      "flex items-center gap-2 px-3 py-3.5 rounded-xl bg-[#1A1A1A]/5 text-[#1A1A1A] text-sm tabular-nums shrink-0 hover:bg-[#1A1A1A]/10 transition min-h-[56px]",
    summaryMeta: "text-xs text-[#1A1A1A]/50",
    badge:
      "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#1A1A1A] text-white text-xs font-bold flex items-center justify-center",
    nameLabel: "block text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/50 mb-1",
    nameInput:
      "w-full rounded-lg border border-gray-200 bg-[#FAFAFA] px-3 py-2 min-h-[44px] text-base sm:text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 focus:border-[#1A1A1A] focus:bg-white focus:outline-none transition",
    actionPublic: "bg-[#1A1A1A] hover:bg-black",
    actionVendor: "bg-[#1A1A1A] hover:bg-black",
    checkIconAlways: true,
    vendorArrow: false,
  },
  card: {
    ring: "ring-2 ring-[#1A1A1A] scale-[1.02]",
    checkBubble: "w-10 h-10 rounded-full bg-[#1A1A1A] flex items-center justify-center shadow-lg",
    checkStroke: "white",
    imageBg: "aspect-[4/3] bg-[#FAFAFA] relative overflow-hidden cursor-pointer",
    imageFit: "w-full h-full object-contain",
    placeholder: (
      <div className="w-full h-full flex items-center justify-center text-gray-300">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    ),
    name: "text-sm font-semibold text-[#1A1A1A] leading-5 h-5 truncate",
    skuPill: "text-xs bg-[#1A1A1A]/5 text-[#1A1A1A]/50 px-1.5 py-0.5 rounded font-medium tabular-nums",
    priceNormal: "text-xl font-bold tabular-nums text-[#1A1A1A]",
    priceMeta: "text-xs text-[#1A1A1A]/40",
    bultoMeta: "text-xs text-[#1A1A1A]/50",
    stock: {
      strong: "text-[#1A1A1A]",
      soft: "text-[#1A1A1A]/45",
      agotado: "text-[#1A1A1A]/40",
    },
    addBtn: "bg-[#1A1A1A] text-white hover:bg-black active:scale-[0.97]",
    qtyWrap: "flex items-center justify-between bg-[#1A1A1A]/5 rounded-lg px-1 border border-[#1A1A1A]/15",
    qtyBtn: "text-[#1A1A1A] hover:bg-[#1A1A1A]/10",
    qtyNum: "text-base font-bold text-[#1A1A1A] tabular-nums",
    qtyUnit: "text-xs text-[#1A1A1A]/60 ml-1",
  },
  vendorShare: {
    enHeader: true,
    verPedidoBtn:
      "flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1A1A1A] hover:bg-black transition px-3 py-2 rounded-lg min-h-[44px]",
    btn: "flex items-center gap-1.5 text-xs text-[#1A1A1A]/50 hover:text-[#1A1A1A] transition px-3 py-2 rounded-lg border border-[#1A1A1A]/10 hover:border-[#1A1A1A]/20 min-h-[44px]",
    pedidosBtn: "flex items-center gap-1.5 text-xs text-[#1A1A1A] hover:text-black transition px-3 py-2 rounded-lg border border-[#1A1A1A]/10 hover:border-[#1A1A1A]/20 min-h-[44px] font-medium",
    iconSize: 14,
    panel: "absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-48 z-50",
    item: "w-full text-left px-4 py-2.5 text-sm text-[#1A1A1A] hover:bg-gray-50 transition flex items-center gap-2",
    copyLabel: "Copiar link público",
    stickyActionColor: "bg-[#1A1A1A] hover:bg-black",
  },
  publico: { confirmingLabel: "Confirmando..." },
  pedidoPublico: {
    pageBg: "min-h-screen bg-[#FAFAFA]",
    spinner: "w-8 h-8 border-2 border-[#1A1A1A] border-t-transparent rounded-full animate-spin",
    itemImageBg: "w-14 h-14 rounded-lg bg-[#FAFAFA] flex-shrink-0 overflow-hidden",
    totalValue: "text-white font-bold text-xl tabular-nums",
    confirmBtn:
      "w-full bg-[#1A1A1A] text-white text-base font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition disabled:opacity-50",
    headerBg: "bg-[#0A0A0A]",
    sectionBg: "bg-[#0A0A0A]",
    panelBorder: "border-[#1A1A1A]/10",
    textStrong: "text-[#1A1A1A]",
    textSoft: "text-[#1A1A1A]/40",
    textHelp: "text-[#1A1A1A]/45",
    textFaint: "text-[#1A1A1A]/25",
    placeholderIcon: "text-[#1A1A1A]/20",
    pdfBtn:
      "flex items-center gap-2 px-6 py-3 bg-white border border-[#1A1A1A]/15 text-[#1A1A1A] rounded-lg font-medium text-sm hover:bg-[#1A1A1A]/5 active:scale-[0.97] transition disabled:opacity-50",
  },
  admin: {
    titulo: "Administrar",
    subtituloSync: (lastSync) =>
      `Se llena solo desde Switch por existencia · tú solo subes fotos${
        lastSync
          ? ` · sincronizado ${new Date(lastSync).toLocaleString("es-PA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
          : ""
      }`,
    productsUrl: "/api/catalogo/calvin/products",
    metrics: (visibles) => {
      const sinFoto = visibles.filter((p) => !tieneFotoAdmin(p)).length;
      return [
        { label: "Productos", value: visibles.length },
        { label: "Sin foto", value: sinFoto, highlight: sinFoto > 0 },
        { label: "Sneakers", value: visibles.filter((p) => p.category === "sneakers").length },
        { label: "Flip Flops", value: visibles.filter((p) => p.category === "flip_flops").length },
        { label: "Sandalias", value: visibles.filter((p) => p.category === "sandals").length },
      ];
    },
    excelSinFoto: async (sin) => {
      // Imports dinámicos: xlsx-js-style no entra al bundle inicial de la página.
      const { buildReportSheet, workbookFromSheets, downloadWorkbook, exportFilename, fmtFechaExcel, CALVIN_PALETTE } =
        await import("@/lib/excel-export");
      const { buildDashBusquedaSheets } = await import("@/lib/catalogos/dash-busqueda-excel");
      const ws = buildReportSheet({
        title: "CALVIN KLEIN — Productos sin foto",
        subtitle: `${sin.length} producto${sin.length !== 1 ? "s" : ""} sin foto  ·  ${fmtFechaExcel(new Date().toISOString())}`,
        columns: [
          { header: "Código", wch: 18 },
          { header: "Nombre", wch: 40 },
          { header: "Categoría", wch: 14 },
          { header: "Género", wch: 12 },
          { header: "Stock", wch: 10, align: "right", fmt: "0" },
        ],
        rows: sin.map((p) => [
          p.sku || "",
          p.name || "",
          CALVIN_CATEGORIA_LABEL[p.category || ""] ?? (p.category || ""),
          CALVIN_GENERO_LABEL[p.gender || ""] ?? (p.gender || ""),
          p.stock ?? "",
        ]),
        palette: CALVIN_PALETTE,
      });
      // La hoja de la plantilla del banco B2B va PRIMERA (ver dash-busqueda-excel
      // — es multi-marca: el portal Dash de PVH es el mismo de Tommy).
      const wb = workbookFromSheets([
        ...buildDashBusquedaSheets(sin.map((p) => p.sku)),
        { name: "Sin foto", ws },
      ]);
      downloadWorkbook(wb, exportFilename("calvin-sin-foto"));
    },
    fotoTabBadge: "inline",
    syncModulo: "catalogo-calvin",
    syncSubtext: "tarda ~2-3 min",
    toastBg: "fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]",
    tabActive: "bg-white text-[#1A1A1A] shadow-sm",
    spinner: "w-8 h-8 border-2 border-[#1A1A1A] border-t-transparent rounded-full animate-spin",
    metricValue: "text-[#1A1A1A]",
    metricHighlightBox: "border-[#1A1A1A]/30 bg-[#1A1A1A]/5",
    metricHighlightValue: "text-[#1A1A1A]",
    productosStyle: "batch",
    nombreEditable: true,
    importarTab: false,
    badgeEditable: false,
    productEdit: { idField: "sku", verb: "POST" },
    bultoEditable: true,
    pedidos: {
      linkBadge: "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#1A1A1A]/10 text-[#1A1A1A]",
      linkBadgeCheck: "w-3 h-3 text-emerald-600",
      filterActive: "text-[#1A1A1A] border-[#1A1A1A]",
      searchFocus: "w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1A1A1A]/30 transition",
      deleteModal: "confirm-delete",
      exportFilename: "Pedidos-Calvin",
    },
  },
  producto: {
    estilo: "variantes",
    volverClass: "text-sm text-[#1A1A1A] hover:underline mb-6 inline-block",
    imageWrap: "aspect-square bg-[#FAFAFA] border border-[#1A1A1A]/10 rounded-lg overflow-hidden",
    price: "text-2xl font-bold text-[#1A1A1A] mb-4",
    sizeActive: "bg-[#1A1A1A] text-white border-[#1A1A1A]",
    sizeInactive: "border-gray-300 hover:border-[#1A1A1A]",
    addBtn:
      "w-full bg-[#1A1A1A] text-white py-3 rounded font-bold text-sm uppercase tracking-wide hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
    consultaWrap: "bg-[#FAFAFA] border border-[#1A1A1A]/10 p-4 rounded text-center",
  },
  pedido: {
    qtyInputClass: "w-12 text-center border-b border-gray-200 text-sm py-0.5 outline-none focus:border-black tabular-nums",
    suggDropdownClass: "absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-sm max-h-56 overflow-y-auto",
    suggItemClass: "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition",
    suggLimit: null,
    clientNamePlaceholder: "Nombre del cliente",
    nameRefEnContenedor: false,
  },
  clientes: {
    nuevoBtn: "bg-[#1A1A1A] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-black transition",
    saveBtn: "flex-1 py-2 bg-[#1A1A1A] text-white rounded-full text-sm font-semibold hover:bg-black transition disabled:opacity-50",
  },
};

// "hace X" relativo del subtítulo del admin Reebok (heredado tal cual).
function relativo(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

export const MARCA_THEME: Record<string, MarcaTheme> = {
  reebok: REEBOK,
  joybees: JOYBEES,
  tommy: TOMMY,
  calvin: CALVIN,
};

/** Marca del segmento dinámico [marca] → tema; null si no existe (→ 404). */
export function getMarcaTheme(marca: string | undefined | null): MarcaTheme | null {
  if (!marca) return null;
  return MARCA_THEME[marca] ?? null;
}

/** Lista de marcas con catálogo (para generateStaticParams si hace falta). */
export const MARCAS_UI: MarcaUiKey[] = ["reebok", "joybees", "tommy", "calvin"];
