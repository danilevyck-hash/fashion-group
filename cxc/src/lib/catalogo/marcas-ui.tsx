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
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";
import { calculateTommyOrderTotal } from "@/lib/tommy-order-total";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";
import { TOMMY_CATEGORIA_LABEL, TOMMY_GENERO_LABEL } from "@/lib/tommy-nombres";
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

export type MarcaUiKey = "reebok" | "joybees" | "tommy";

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
  cartKeyLocal: string;
  /** Reebok también persiste el carrito en sessionStorage; Joybees no. */
  cartKeySession: string | null;
  publicCartKey: string;
  publicClientNameKey: string;
  /** QUIRK Joybees: la página del pedido interno trackea el borrador activo. */
  draftIdKey: string | null;
  checkoutTokenKey: string;

  // ── Reglas de negocio client-side ──
  bulto: (category?: string | null) => number;
  calcTotal: (items: { quantity: number; unit_price: number; category?: string }[]) => number;
  /** Orden canónico de items del pedido (Reebok: categoría+SKU) o null = SKU asc. */
  sortOrderItems: (<T extends { sku: string; category?: string }>(items: T[]) => T[]) | null;
  /** Fallback de category para PDFs / items sin category. */
  pdfFallbackCategory: string;
  /** Relación embebida de items en la respuesta de orders. */
  itemsField: string;
  /** Decimales del total en la barra del carrito del catálogo VENDEDOR
   *  (quirk heredado: Reebok 0, Joybees 2; el público siempre usa 2). */
  vendorFmtDecimals: 0 | 2;

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
    /** QUIRK legacy Reebok: rol 'cliente' solo ve su propio pedido. */
    roleClienteGuard: boolean;
    /** El "← Inicio" del navbar solo aparece con rol de sistema (Reebok). */
    navInicioRequiereRol: boolean;
  };

  // ── Metadata del layout ──
  metaTitle: string;
  metaDescription: string;

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
    navbar: () => ReactNode;
    header: () => ReactNode;
    admin: () => ReactNode;
    pedidoPublico: () => ReactNode;
  };

  // ── Clases por componente (strings literales completos) ──
  navbar: {
    accentBar: string;
    inicioLink: string;
    pedidosLink: string;
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
    /** object-contain SIEMPRE: el 4:3 recorta fondo, nunca producto. */
    imageFit: string;
    placeholder: ReactNode;
    name: string;
    priceNormal: string;
    priceMeta: string;
    bultoMeta: string;
    addBtn: string;
    qtyWrap: string;
    qtyBtn: string;
    qtyNum: string;
    qtyUnit: string;
  };
  /** Labels de categoría del grid agrupado (marcas con agrupacionPorModelo). */
  groupedCategoryLabels: Record<string, string>;
  /** Grid vendedor: dónde vive el menú Compartir y el botón "Ver pedido". */
  vendorShare: {
    /** true (layout Joybees): share + "Ver pedido" junto al header; false
     *  (layout Reebok): share en la fila del sync, solo con resultados. */
    enHeader: boolean;
    verPedidoBtn: string | null;
    btn: string;
    iconSize: number;
    panel: string;
    item: string;
    copyLabel: string;
    /** Color del botón principal de la barra sticky (null = default del tema). */
    stickyActionColor: string | null;
  };
  stockAviso: {
    panel: string;
    title: string;
    line: string;
    note: string;
    confirmBtn: string;
    cancelBtn: string;
  };
  publico: {
    /** Carga del catálogo público: color del texto vacío etc. reuse grid. */
    confirmingLabel: string;
  };
  pedidoPublico: {
    pageBg: string;
    spinner: string;
    itemImageBg: string;
    totalValue: string;
    stockConfirmBtn: string;
    confirmBtn: string;
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

  cartKeyLocal: "reebok_cart",
  cartKeySession: "reebok_cart",
  publicCartKey: "reebok_public_cart",
  publicClientNameKey: "reebok_public_client_name",
  draftIdKey: null,
  checkoutTokenKey: "reebok_checkout_token",

  bulto: (c) => reebokBulto(c || "apparel"),
  calcTotal: calculateReebokOrderTotal,
  sortOrderItems: sortReebokOrderItems,
  pdfFallbackCategory: "apparel",
  itemsField: "reebok_order_items",
  vendorFmtDecimals: 0,
  genero: REEBOK_GENERO,

  features: {
    preorder: true,
    saleFilter: true,
    agrupacionPorModelo: false,
    inventarioPorTalla: true,
    categoryChips: true,
    roleClienteGuard: true,
    navInicioRequiereRol: true,
  },

  metaTitle: "Reebok Panamá - Catálogo",
  metaDescription: "Catálogo de productos Reebok Panamá.",

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
    header: () => (
      <div className="flex items-center gap-1">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="w-7 h-7 text-[#E4002B]" fill="currentColor">
              <path d="M4 24L16 4l12 20H4z" opacity="0.9" />
            </svg>
          </div>
        </div>
        <div>
          <h1 className="text-lg font-black uppercase tracking-[0.15em] text-[#1A2656] leading-none">
            REEBOK
          </h1>
          <p className="text-xs text-[#1A2656]/40 uppercase tracking-[0.25em] leading-none mt-0.5">
            Catalogo Panama
          </p>
        </div>
      </div>
    ),
    admin: () => (
      <div className="w-10 h-10 rounded-xl bg-[#1A2656] flex items-center justify-center">
        <span className="text-white font-extrabold text-xs tracking-tight">RBK</span>
      </div>
    ),
    pedidoPublico: () => (
      <div>
        <h1 className="text-white font-bold text-xl tracking-wide">REEBOK</h1>
        <p className="text-white/50 text-xs mt-0.5">Panama</p>
      </div>
    ),
  },

  navbar: {
    accentBar: "bg-[#E4002B]",
    inicioLink: "text-xs text-[#1A2656] hover:text-[#E4002B] transition flex-shrink-0 py-2",
    pedidosLink: "text-sm text-[#1A2656] hover:text-[#E4002B] transition py-2 px-2 font-medium",
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
    searchPlaceholder: "Buscar por nombre, codigo o color...",
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
    vaciarBtn: "text-xs text-gray-400 hover:text-[#E4002B] transition",
    summaryBtn:
      "flex items-center gap-2 px-3 py-3.5 rounded-xl bg-[#F5F0E8] text-[#1A2656] text-sm tabular-nums shrink-0 hover:bg-[#ebe5d9] transition min-h-[56px]",
    summaryMeta: "text-xs text-[#1A2656]/50",
    badge:
      "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#E4002B] text-white text-xs font-bold flex items-center justify-center",
    nameLabel: "block text-xs font-semibold uppercase tracking-wide text-[#1A2656]/50 mb-1",
    nameInput:
      "w-full rounded-lg border border-gray-200 bg-[#F5F0E8] px-3 py-2 text-sm text-[#1A2656] placeholder:text-[#1A2656]/30 focus:border-[#1A2656] focus:bg-white focus:outline-none transition",
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
    imageFit: "w-full h-full object-contain p-3",
    placeholder: (
      <div className="w-full h-full flex items-center justify-center text-gray-300">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    ),
    name: "text-sm font-semibold text-[#1A2656] line-clamp-2 leading-snug min-h-[2.5em]",
    priceNormal: "text-xl font-bold tabular-nums text-[#1A2656]",
    priceMeta: "text-xs text-[#1A2656]/40",
    bultoMeta: "text-xs text-[#1A2656]/50",
    addBtn: "bg-[#1A2656] text-white hover:bg-[#0f1a3d] active:scale-[0.97]",
    qtyWrap: "flex items-center justify-between bg-emerald-50 rounded-lg px-1 border border-emerald-100",
    qtyBtn: "text-emerald-700 hover:bg-emerald-100",
    qtyNum: "text-base font-bold text-emerald-700 tabular-nums",
    qtyUnit: "text-xs text-emerald-600 ml-1",
  },
  groupedCategoryLabels: {},
  vendorShare: {
    enHeader: false,
    verPedidoBtn: null,
    btn: "text-xs border border-[#1A2656]/10 text-[#1A2656]/40 px-3 py-1.5 rounded-lg hover:border-[#1A2656]/25 hover:text-[#1A2656]/60 transition flex items-center gap-1.5 min-h-[44px]",
    iconSize: 12,
    panel: "absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 w-48 z-50",
    item: "w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition flex items-center gap-2",
    copyLabel: "Copiar link",
    stickyActionColor: "bg-[#E4002B] hover:bg-[#c90025]",
  },
  stockAviso: {
    panel: "fixed inset-x-0 bottom-0 z-50 bg-white border-t border-[#1A2656]/10 px-4 pt-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]",
    title: "text-sm font-semibold text-[#1A2656]",
    line: "text-xs text-[#1A2656]/70",
    note: "text-xs text-[#1A2656]/60 mb-3",
    confirmBtn:
      "flex-1 bg-[#1A2656] text-white text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
    cancelBtn:
      "flex-1 bg-white border border-[#1A2656]/20 text-[#1A2656] text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
  },
  publico: { confirmingLabel: "Confirmando..." },
  pedidoPublico: {
    pageBg: "min-h-screen bg-[#F5F0E8]",
    spinner: "w-8 h-8 border-2 border-[#1A2656] border-t-transparent rounded-full animate-spin",
    itemImageBg: "w-14 h-14 rounded-lg bg-[#F5F0E8] flex-shrink-0 overflow-hidden",
    totalValue: "text-white font-bold text-xl tabular-nums",
    stockConfirmBtn:
      "flex-1 bg-[#1A2656] text-white text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
    confirmBtn:
      "w-full bg-[#1A2656] text-white text-base font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition disabled:opacity-50",
  },
  admin: {
    titulo: "Catálogo Reebok",
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

  cartKeyLocal: "joybees_cart",
  cartKeySession: null,
  publicCartKey: "joybees_public_cart",
  publicClientNameKey: "joybees_public_client_name",
  draftIdKey: "joybees_draft_id",
  checkoutTokenKey: "joybees_checkout_token",

  bulto: () => joybeesBulto(),
  calcTotal: calculateJoybeesOrderTotal,
  sortOrderItems: null,
  pdfFallbackCategory: "footwear",
  itemsField: "joybees_order_items",
  vendorFmtDecimals: 2,
  genero: REEBOK_GENERO,

  features: {
    preorder: false,
    saleFilter: false,
    agrupacionPorModelo: true,
    inventarioPorTalla: false,
    categoryChips: false,
    roleClienteGuard: false,
    navInicioRequiereRol: false,
  },

  metaTitle: "Joybees Panama - Catalogo",
  metaDescription: "Catalogo de productos Joybees Panama.",

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

  logos: {
    navbar: () => (
      <span className="flex items-center gap-2">
        <span className="text-lg">🐝</span>
        <span className="font-black text-[#404041] uppercase tracking-wide text-sm">Joybees</span>
      </span>
    ),
    header: () => (
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-[#FFE443] flex items-center justify-center text-lg">
          🐝
        </div>
        <div>
          <h1 className="text-lg font-black uppercase tracking-[0.12em] text-[#404041] leading-none">
            JOYBEES
          </h1>
          <p className="text-xs text-[#404041]/40 uppercase tracking-[0.25em] leading-none mt-0.5">
            Catalogo Panama
          </p>
        </div>
      </div>
    ),
    admin: () => (
      <div className="w-10 h-10 rounded-xl bg-[#FFE443] flex items-center justify-center">
        <span className="text-[#404041] font-extrabold text-sm">JB</span>
      </div>
    ),
    pedidoPublico: () => (
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-[#FFE443] flex items-center justify-center text-lg">🐝</div>
        <div>
          <h1 className="text-white font-black uppercase tracking-wide text-xl leading-none">JOYBEES</h1>
          <p className="text-white/50 text-xs mt-1">Panama</p>
        </div>
      </div>
    ),
  },

  navbar: {
    accentBar: "bg-[#FFE443]",
    inicioLink: "text-xs text-[#404041] hover:text-[#FFE443] transition flex-shrink-0 py-2",
    pedidosLink: "text-sm text-[#404041] hover:text-black transition py-2 px-2 font-medium",
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
    searchPlaceholder: "Buscar por nombre o codigo...",
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
    vaciarBtn: "text-xs text-gray-400 hover:text-red-500 transition",
    summaryBtn:
      "flex items-center gap-2 px-3 py-3.5 rounded-xl bg-[#FFE443]/20 text-[#404041] text-sm tabular-nums shrink-0 hover:bg-[#FFE443]/30 transition min-h-[56px]",
    summaryMeta: "text-xs text-[#404041]/50",
    badge:
      "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#FFE443] text-[#404041] text-xs font-bold flex items-center justify-center",
    nameLabel: "block text-xs font-semibold uppercase tracking-wide text-[#404041]/50 mb-1",
    nameInput:
      "w-full rounded-lg border border-gray-200 bg-[#FFFEF5] px-3 py-2 text-sm text-[#404041] placeholder:text-[#404041]/30 focus:border-[#404041] focus:bg-white focus:outline-none transition",
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
    name: "text-sm font-semibold text-[#404041] line-clamp-2 leading-snug min-h-[2.5em]",
    priceNormal: "text-xl font-bold tabular-nums text-[#404041]",
    priceMeta: "text-xs text-[#404041]/40",
    bultoMeta: "text-xs text-[#404041]/50",
    addBtn: "bg-[#404041] text-white hover:bg-[#2a2a2b] active:scale-[0.97]",
    qtyWrap: "flex items-center justify-between bg-[#FFE443]/20 rounded-lg px-1 border border-[#FFE443]/40",
    qtyBtn: "text-[#404041] hover:bg-[#FFE443]/30",
    qtyNum: "text-base font-bold text-[#404041] tabular-nums",
    qtyUnit: "text-xs text-[#404041]/60 ml-1",
  },
  groupedCategoryLabels: {
    active_clog: "Active Clog",
    casual_flip: "Casual Flip",
    varsity_clog: "Varsity Clog",
    trekking_slide: "Trekking Slide",
    trekking_shoe: "Trekking Shoe",
    work_clog: "Work Clog",
    friday_flat: "Friday Flat",
    garden_grove_clog: "Garden Grove",
    lakeshore_sandal: "Lakeshore",
    riviera_sandal: "Riviera",
    everyday_sandal: "Everyday Sandal",
    varsity_flip: "Varsity Flip",
    studio_clog: "Studio Clog",
    popinz: "Popinz",
  },
  vendorShare: {
    enHeader: true,
    verPedidoBtn: "flex items-center gap-1.5 text-xs font-semibold text-[#404041] bg-[#FFE443] hover:bg-[#f5d90a] transition px-3 py-2 rounded-lg min-h-[44px]",
    btn: "flex items-center gap-1.5 text-xs text-[#404041]/50 hover:text-[#404041] transition px-3 py-2 rounded-lg border border-[#404041]/10 hover:border-[#404041]/20",
    iconSize: 14,
    panel: "absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-48 z-50",
    item: "w-full text-left px-4 py-2.5 text-sm text-[#404041] hover:bg-gray-50 transition flex items-center gap-2",
    copyLabel: "Copiar link publico",
    stickyActionColor: null,
  },
  stockAviso: {
    panel: "fixed inset-x-0 bottom-0 z-50 bg-white border-t border-[#404041]/10 px-4 pt-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]",
    title: "text-sm font-semibold text-[#404041]",
    line: "text-xs text-[#404041]/70",
    note: "text-xs text-[#404041]/60 mb-3",
    confirmBtn:
      "flex-1 bg-[#404041] text-white text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
    cancelBtn:
      "flex-1 bg-white border border-[#404041]/20 text-[#404041] text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
  },
  publico: { confirmingLabel: "Confirmando..." },
  pedidoPublico: {
    pageBg: "min-h-screen bg-[#FFFEF5]",
    spinner: "w-8 h-8 border-2 border-[#1A2656] border-t-transparent rounded-full animate-spin",
    itemImageBg: "w-14 h-14 rounded-lg bg-[#FFFEF5] flex-shrink-0 overflow-hidden",
    totalValue: "text-[#FFE443] font-bold text-xl tabular-nums",
    stockConfirmBtn:
      "flex-1 bg-[#1A2656] text-white text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
    confirmBtn:
      "w-full bg-[#1A2656] text-white text-base font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition disabled:opacity-50",
  },
  admin: {
    titulo: "JOYBEES",
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
      // Import dinámico: xlsx-js-style no entra al bundle inicial de la página.
      const { buildReportSheet, workbookFromSheets, downloadWorkbook, exportFilename, fmtFechaExcel, REEBOK_PALETTE } =
        await import("@/lib/excel-export");
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
        palette: REEBOK_PALETTE,
      });
      const wb = workbookFromSheets([{ name: "Sin foto", ws }]);
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

  cartKeyLocal: "tommy_cart",
  cartKeySession: null,
  publicCartKey: "tommy_public_cart",
  publicClientNameKey: "tommy_public_client_name",
  draftIdKey: "tommy_draft_id",
  checkoutTokenKey: "tommy_checkout_token",

  bulto: () => tommyBulto(),
  calcTotal: calculateTommyOrderTotal,
  sortOrderItems: null,
  pdfFallbackCategory: "footwear",
  itemsField: "tommy_order_items",
  vendorFmtDecimals: 2,
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
    roleClienteGuard: false,
    navInicioRequiereRol: false,
  },

  metaTitle: "Tommy Hilfiger Panamá - Catálogo",
  metaDescription: "Catálogo de calzado Tommy Hilfiger Panamá.",

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
    // Navbar: SOLO la bandera. El wordmark TOMMY HILFIGER vive en el header
    // grande de abajo ("CATALOGO PANAMA") — tenerlo en los dos lo repetía dos
    // veces en la misma pantalla (Daniel, 25-jul-2026).
    navbar: () => <img src="/tommy/tommy-flag.png" alt="Tommy Hilfiger" className="h-5 w-auto" />,
    header: () => (
      <div className="flex items-center gap-2.5">
        <img src="/tommy/tommy-flag.png" alt="" className="w-9 h-6 object-contain" />
        <div>
          <img src="/tommy/tommy-horizontal.svg" alt="TOMMY HILFIGER" className="h-4 w-auto" />
          <p className="text-xs text-[#152342]/40 uppercase tracking-[0.25em] leading-none mt-1">
            Catalogo Panama
          </p>
        </div>
      </div>
    ),
    admin: () => (
      <div className="w-10 h-10 rounded-xl bg-white border border-[#152342]/15 flex items-center justify-center">
        <img src="/tommy/tommy-flag.png" alt="Tommy" className="w-7 h-5 object-contain" />
      </div>
    ),
    pedidoPublico: () => (
      <div>
        <h1 className="text-white font-bold text-xl tracking-[0.08em]">TOMMY HILFIGER</h1>
        <p className="text-white/50 text-xs mt-0.5">Panama</p>
      </div>
    ),
  },

  navbar: {
    accentBar: "bg-[#AE0029]",
    inicioLink: "text-xs text-[#152342] hover:text-[#AE0029] transition flex-shrink-0 py-2",
    pedidosLink: "text-sm text-[#152342] hover:text-[#AE0029] transition py-2 px-2 font-medium",
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
    searchPlaceholder: "Buscar por nombre o codigo...",
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
    vaciarBtn: "text-xs text-gray-400 hover:text-[#AE0029] transition",
    summaryBtn:
      "flex items-center gap-2 px-3 py-3.5 rounded-xl bg-[#152342]/5 text-[#152342] text-sm tabular-nums shrink-0 hover:bg-[#152342]/10 transition min-h-[56px]",
    summaryMeta: "text-xs text-[#152342]/50",
    badge:
      "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#AE0029] text-white text-xs font-bold flex items-center justify-center",
    nameLabel: "block text-xs font-semibold uppercase tracking-wide text-[#152342]/50 mb-1",
    nameInput:
      "w-full rounded-lg border border-gray-200 bg-[#F6F7F9] px-3 py-2 text-sm text-[#152342] placeholder:text-[#152342]/30 focus:border-[#152342] focus:bg-white focus:outline-none transition",
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
    imageFit: "w-full h-full object-contain p-3",
    placeholder: (
      <div className="w-full h-full flex items-center justify-center text-gray-300">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    ),
    name: "text-sm font-semibold text-[#152342] line-clamp-2 leading-snug min-h-[2.5em]",
    priceNormal: "text-xl font-bold tabular-nums text-[#152342]",
    priceMeta: "text-xs text-[#152342]/40",
    bultoMeta: "text-xs text-[#152342]/50",
    addBtn: "bg-[#152342] text-white hover:bg-[#0e1830] active:scale-[0.97]",
    qtyWrap: "flex items-center justify-between bg-[#152342]/5 rounded-lg px-1 border border-[#152342]/15",
    qtyBtn: "text-[#152342] hover:bg-[#152342]/10",
    qtyNum: "text-base font-bold text-[#152342] tabular-nums",
    qtyUnit: "text-xs text-[#152342]/60 ml-1",
  },
  groupedCategoryLabels: {},
  vendorShare: {
    enHeader: true,
    verPedidoBtn:
      "flex items-center gap-1.5 text-xs font-semibold text-white bg-[#152342] hover:bg-[#0e1830] transition px-3 py-2 rounded-lg min-h-[44px]",
    btn: "flex items-center gap-1.5 text-xs text-[#152342]/50 hover:text-[#152342] transition px-3 py-2 rounded-lg border border-[#152342]/10 hover:border-[#152342]/20",
    iconSize: 14,
    panel: "absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-48 z-50",
    item: "w-full text-left px-4 py-2.5 text-sm text-[#152342] hover:bg-gray-50 transition flex items-center gap-2",
    copyLabel: "Copiar link publico",
    stickyActionColor: "bg-[#AE0029] hover:bg-[#8c0021]",
  },
  stockAviso: {
    panel: "fixed inset-x-0 bottom-0 z-50 bg-white border-t border-[#152342]/10 px-4 pt-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]",
    title: "text-sm font-semibold text-[#152342]",
    line: "text-xs text-[#152342]/70",
    note: "text-xs text-[#152342]/60 mb-3",
    confirmBtn:
      "flex-1 bg-[#152342] text-white text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
    cancelBtn:
      "flex-1 bg-white border border-[#152342]/20 text-[#152342] text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
  },
  publico: { confirmingLabel: "Confirmando..." },
  pedidoPublico: {
    pageBg: "min-h-screen bg-[#F6F7F9]",
    spinner: "w-8 h-8 border-2 border-[#152342] border-t-transparent rounded-full animate-spin",
    itemImageBg: "w-14 h-14 rounded-lg bg-[#F6F7F9] flex-shrink-0 overflow-hidden",
    totalValue: "text-white font-bold text-xl tabular-nums",
    stockConfirmBtn:
      "flex-1 bg-[#152342] text-white text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50",
    confirmBtn:
      "w-full bg-[#152342] text-white text-base font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition disabled:opacity-50",
  },
  admin: {
    titulo: "Catálogo Tommy Hilfiger",
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
      // Import dinámico: xlsx-js-style no entra al bundle inicial de la página.
      const { buildReportSheet, workbookFromSheets, downloadWorkbook, exportFilename, fmtFechaExcel, REEBOK_PALETTE } =
        await import("@/lib/excel-export");
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
        palette: REEBOK_PALETTE,
      });
      const wb = workbookFromSheets([{ name: "Sin foto", ws }]);
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
};

/** Marca del segmento dinámico [marca] → tema; null si no existe (→ 404). */
export function getMarcaTheme(marca: string | undefined | null): MarcaTheme | null {
  if (!marca) return null;
  return MARCA_THEME[marca] ?? null;
}

/** Lista de marcas con catálogo (para generateStaticParams si hace falta). */
export const MARCAS_UI: MarcaUiKey[] = ["reebok", "joybees", "tommy"];
