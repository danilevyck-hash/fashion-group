// ─────────────────────────────────────────────────────────────────────────────
// Config por marca del motor de catálogos (PR-1: rutas dinámicas [marca]).
// SERVER-ONLY — resuelve clients service-role; no importar desde componentes
// cliente.
//
// Los clients Supabase son LAZY (funciones async con dynamic import): importar
// este módulo NUNCA construye un client. Esto es deliberado y load-bearing:
// el arnés de paridad mockea los módulos client POR ARCHIVO de test; un import
// eager arrastraría clients reales (sin env → throw) en los tests que no
// mockean el client de la otra marca.
//
// Los QUIRKS marcados abajo son divergencias reales heredadas del estado
// pre-refactor (fijadas por el arnés de PR-0). Se preservan a propósito:
// unificarlas requiere OK de Daniel, no es decisión de un refactor.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { getBultoSize as reebokBulto } from "@/lib/reebok-bulto";
import { getBultoSize as joybeesBulto } from "@/lib/joybees-bulto";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";
import {
  validatePedidoBody as reebokValidatePedidoBody,
  applyDbPrices as reebokApplyDbPrices,
} from "@/lib/reebok-pedido-publico-validate";
import { checkPedidoRateLimit as reebokCheckPedidoRateLimit } from "@/lib/reebok-pedido-rate-limit";
import {
  validatePedidoBody as joybeesValidatePedidoBody,
  applyDbPrices as joybeesApplyDbPrices,
} from "@/lib/joybees-pedido-publico-validate";
import { checkPedidoRateLimit as joybeesCheckPedidoRateLimit } from "@/lib/joybees-pedido-rate-limit";
import { getBultoSize as tommyBulto } from "@/lib/tommy-bulto";
import { calculateTommyOrderTotal } from "@/lib/tommy-order-total";
import {
  validatePedidoBody as tommyValidatePedidoBody,
  applyDbPrices as tommyApplyDbPrices,
} from "@/lib/tommy-pedido-publico-validate";
import { checkPedidoRateLimit as tommyCheckPedidoRateLimit } from "@/lib/tommy-pedido-rate-limit";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";
import { STORAGE_PREFIX } from "@/lib/catalogos/variantes-paths";
import { catalogoAdminRoles } from "@/lib/catalogo/roles";

export type MarcaKey = "reebok" | "joybees" | "tommy";

/** Client Supabase resuelto de forma lazy (ver nota de cabecera). */
export type LazyDb = () => Promise<SupabaseClient>;

export interface ItemForTotal {
  quantity: number;
  unit_price: number;
  category?: string;
}

/** Item saneado del pedido público (superset de las dos marcas: category e
 *  is_preorder son opcionales y solo-Reebok). */
export interface PedidoPublicoItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  category?: string;
  is_preorder?: boolean;
}

export type PedidoPublicoValidacion =
  | { ok: true; items: PedidoPublicoItem[]; cliente_nombre: string }
  | { ok: false; error: string };

export type PedidoPublicoPreciado =
  | { ok: true; items: PedidoPublicoItem[]; total: number; adjusted: boolean }
  | { ok: false; error: string };

export type PedidoPublicoApplyPrices = (
  items: PedidoPublicoItem[],
  products: Map<string, { price: number; category: string | null }>,
) => PedidoPublicoPreciado;

// ── Getters lazy de clients ──────────────────────────────────────────────────

const reebokServerDb: LazyDb = async () =>
  (await import("@/lib/reebok-supabase-server")).reebokServer;
const joybeesServerDb: LazyDb = async () =>
  (await import("@/lib/joybees-supabase-server")).joybeesServer;
const tommyServerDb: LazyDb = async () =>
  (await import("@/lib/tommy-supabase-server")).tommyServer;
const mainServerDb: LazyDb = async () =>
  (await import("@/lib/supabase-server")).supabaseServer;
// GET /products de Reebok lee con el client ANON del catálogo (patrón original).
const reebokProductsAnonDb: LazyDb = async () =>
  (await import("@/components/reebok/supabase")).supabase;
// Joybees products/public crean su client por request (patrón original
// getSupabase(): proyecto principal, service-role con fallback a anon).
// `cache: "no-store"` en cada fetch igual que reebok/joybees/tommy-supabase-
// server: este client era el único sin el blindaje y fue justo la forma del bug
// #253 (createClient propio → snapshot viejo del Data Cache de Next).
const joybeesProductsDb: LazyDb = async () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } },
  );
// POST /pedido-publico: ambas marcas insertan con un client al proyecto
// principal con service-role (RLS public_insert), patrón original del route.
const publicosInsertClient = (): SupabaseClient =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export interface MarcaConfig {
  marca: MarcaKey;
  label: string;
  empresaKey: string;

  // ── Tablas / vistas / RPCs ──
  ordersTable: string;
  itemsRelation: string; // nombre de la relación embebida en selects
  enviosTable: string;
  productsTable: string;
  publicosTable: string;
  unificadoView: string;
  createOrderRpc: string;
  replaceItemsRpc: string;
  convertRpc: string;
  /** Prefijo de numeración que asigna la RPC (PED-### / JBP-###). */
  numeroPrefijo: string;
  /** Nombre del cron de catálogo en cron_heartbeats (sync-status). */
  cronName: string;

  // ── Clients (lazy) ──
  /** Proyecto de la marca: orders/items/envios/products server-side. */
  db: LazyDb;
  /** Proyecto principal: directorio, switch_clientes, cron_heartbeats. */
  mainDb: LazyDb;
  /** QUIRK heredado, unificar con OK de Daniel: reebok_pedidos_publicos y su
   *  vista unificada viven en el proyecto PRINCIPAL (supabaseServer); en
   *  Joybees viven en su client (que hoy cae al principal por env). */
  publicosDb: LazyDb;
  /** Insert del POST público (pedido del link) — ver publicosInsertClient. */
  publicosInsertClient: () => SupabaseClient;

  // ── Totales / categorías ──
  bultoSize: (category?: string | null) => number;
  calcTotal: (items: ItemForTotal[]) => number;
  /** Solo Reebok: category por product_id (define bulto 6/12). null = la marca
   *  no maneja categorías (Joybees es 100% footwear, bulto 12 fijo). */
  categoryLookup:
    | ((ids: (string | null | undefined)[]) => Promise<Map<string, string>>)
    | null;
  /** Fallback al calcular TOTALES cuando la category no resuelve (apparel=6:
   *  nunca inflar el cobro asumiendo footwear=12 a ciegas). */
  fallbackCategory: string | null;
  /** Fallback de category para el PDF del pedido (patrón original por marca). */
  pdfFallbackCategory: string;

  // ── Columnas / flags de datos ──
  /** is_preorder (pre-venta) es concepto solo-Reebok: columna en items, RPCs y
   *  secciones del correo. */
  itemsHasPreorder: boolean;
  /** Columnas extra de la tabla orders en los selects (origen_* solo Reebok). */
  ordersSelectExtra: string;
  /** Select del POST /pedidos-export (col `total` vestigial solo en Reebok). */
  exportCols: string;
  exportTitulo: string;

  // ── QUIRKS de negocio heredados (unificar con OK de Daniel) ──
  /** QUIRK 1: la lista GET /orders de Joybees filtra deleted=false en la
   *  query; la de Reebok NO filtra (comportamiento pre-refactor). */
  listaFiltraDeleted: boolean;
  /** QUIRK 2: Reebok aún acepta el rol legacy 'cliente' al crear pedidos. */
  createRoles: string[];
  /** QUIRK 3 (resuelto en roles el 27-jul-2026): el Storage sigue siendo
   *  distinto por marca (Reebok → proyecto Reebok, path products/; Joybees y
   *  Tommy → proyecto principal, paths joybees/ y tommy/), pero los ROLES ya
   *  no: las 3 marcas usan CATALOGO_ADMIN_ROLES (admin + secretaria). Antes
   *  Joybees y Tommy eran solo-admin, y eso dejaba a la secretaria sin poder
   *  subir fotos en 2 de las 3 marcas. */
  upload: { roles: string[]; storage: "marca" | "main"; pathPrefix: string };

  // ── Presentación / mensajes ──
  telegramEmoji: string;
  /** Nombre del directorio Switch en mensajes de error (clientes-switch). */
  switchDirectorioLabel: string;
  sendOrder: {
    from: string;
    /** Banda de marca del correo AL EQUIPO (aviso interno de pedido nuevo). */
    headerHtml: (orderNumber: string, clientName: string, fechaLabel: string) => string;
    /** Banda de marca del correo AL CLIENTE. No lleva el nombre del cliente
     *  (a él no le dice nada leer su propio nombre en el encabezado): agradece
     *  y deja a la vista el número de pedido y la fecha. Las 3 marcas usan la
     *  MISMA tipografía acá a propósito — bloque nuevo, paridad total; solo
     *  cambian logo y color. */
    headerClienteHtml: (orderNumber: string, fechaLabel: string) => string;
    tableHeadBg: string;
  };
  /** Solo Reebok: orden canónico categoría+SKU de items en correo/PDF. */
  sortEmailItems: (<T extends { sku: string; category?: string }>(items: T[]) => T[]) | null;

  // ── Endpoint /pedido-publico (libs de validación por marca) ──
  pedidoPublico: {
    validateBody: (body: unknown) => PedidoPublicoValidacion;
    applyDbPrices: PedidoPublicoApplyPrices;
    checkRateLimit: (
      db: SupabaseClient,
      ip: string,
    ) => Promise<{ allowed: boolean; ipHash: string | null }>;
    /** Columnas de precio a leer de products ("id, price, category" en Reebok). */
    priceCols: string;
  };

  // ── Endpoint /products y /public (QUIRKS 4 y 5) ──
  products: {
    /** QUIRK 4: 'publico-scope-admin' = GET legible SIN sesión salvo
     *  scope=admin (Reebok); 'roles-modulo' = sesión SIEMPRE con roles del
     *  módulo Catálogos (Joybees, incluye bodega). */
    authStyle: "publico-scope-admin" | "roles-modulo";
    /** QUIRK 5: edición por `id` vía PUT (Reebok) o por `sku` vía POST
     *  (Joybees). El verbo no configurado responde 405. */
    editVerb: "PUT" | "POST";
    idField: "id" | "sku";
    cols: string;
    readDb: LazyDb;
    writeDb: LazyDb;
    /** DELETE (soft, active=false) existe solo en Reebok. */
    hasDelete: boolean;
    /** Solo Tommy: `name` es editable a mano en el admin; al editarlo el
     *  endpoint marca nombre_manual=true y el sync deja de pisarlo (patrón
     *  oculto_manual). Reebok/Joybees mantienen la allow-list clásica
     *  (image_url/badge). */
    nombreEditable?: boolean;
  };
  publicCatalog: {
    db: LazyDb;
    cols: string;
    /** Reebok responde {products, inventory}; Joybees {products} (stock en fila). */
    conInventario: boolean;
  };

  /** Defaults del piloto — SOLO Reebok legacy (pedidos creados antes del
   *  checkout, sin cliente/vendedor guardados). Joybees no tiene legacy. */
  fallback: {
    clienteId: number;
    clienteNombre: string;
    vendedorId: number;
    vendedorNombre: string;
  } | null;
}

export const MARCAS_CONFIG: Record<string, MarcaConfig> = {
  reebok: {
    marca: "reebok",
    label: "Reebok",
    empresaKey: "active_shoes",
    ordersTable: "reebok_orders",
    itemsRelation: "reebok_order_items",
    enviosTable: "reebok_switch_envios",
    productsTable: "products",
    publicosTable: "reebok_pedidos_publicos",
    unificadoView: "reebok_pedidos_unificado_vw",
    createOrderRpc: "reebok_create_order",
    replaceItemsRpc: "reebok_order_replace_items",
    convertRpc: "convert_reebok_pedido_publico",
    numeroPrefijo: "PED",
    cronName: "reebok-catalogo",
    db: reebokServerDb,
    mainDb: mainServerDb,
    publicosDb: mainServerDb, // quirk heredado: publicos de Reebok en el principal
    publicosInsertClient,
    bultoSize: (c) => reebokBulto(c || "apparel"),
    calcTotal: calculateReebokOrderTotal,
    categoryLookup: async (ids) =>
      (await import("@/lib/reebok-category-lookup")).fetchReebokCategoryMap(ids),
    fallbackCategory: "apparel",
    pdfFallbackCategory: "apparel",
    itemsHasPreorder: true,
    ordersSelectExtra: ", origen_original, origen_short_id",
    exportCols: "origen, cliente, vendor, items, total, created_at",
    exportTitulo: "REEBOK — Pedidos",
    listaFiltraDeleted: false, // quirk heredado, unificar con OK de Daniel
    createRoles: ["admin", "secretaria", "vendedor", "cliente"], // quirk heredado ('cliente' legacy)
    upload: { roles: catalogoAdminRoles(), storage: "marca", pathPrefix: STORAGE_PREFIX.reebok },
    telegramEmoji: "🛒",
    switchDirectorioLabel: "Active Shoes",
    sendOrder: {
      from: "Reebok Panama <pedidos@fashiongr.com>",
      headerHtml: (orderNumber, clientName, fechaLabel) => `
      <div style="background:#1a1a1a;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <img src="https://fashiongr.com/reebok/reebok-logo.png" alt="Reebok" width="60" height="17" style="display:block;margin-bottom:8px" />
        <h2 style="margin:0;font-size:18px">Pedido ${orderNumber} — ${clientName}</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7">Fashion Group · Panama — ${fechaLabel}</p>
      </div>`,
      headerClienteHtml: (orderNumber, fechaLabel) => `
      <div style="background:#1a1a1a;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <img src="https://fashiongr.com/reebok/reebok-logo.png" alt="Reebok" width="60" height="17" style="display:block;margin-bottom:8px" />
        <h2 style="margin:0;font-size:18px">Gracias por tu pedido</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7">Pedido ${orderNumber} · ${fechaLabel}</p>
      </div>`,
      tableHeadBg: "#1a1a1a",
    },
    sortEmailItems: sortReebokOrderItems,
    pedidoPublico: {
      validateBody: reebokValidatePedidoBody,
      applyDbPrices: reebokApplyDbPrices as PedidoPublicoApplyPrices,
      checkRateLimit: reebokCheckPedidoRateLimit,
      priceCols: "id, price, category",
    },
    products: {
      authStyle: "publico-scope-admin", // quirk heredado, unificar con OK de Daniel
      editVerb: "PUT", // quirk heredado: edición por id
      idField: "id",
      cols: "id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at",
      readDb: reebokProductsAnonDb,
      writeDb: reebokServerDb,
      hasDelete: true,
    },
    publicCatalog: {
      // existencia/disponibilidad: el catálogo público mostraba EXISTENCIA (el
      // saldo físico, vía la suma de `inventory`) en vez de DISPONIBILIDAD (lo
      // vendible = saldo − apartado). En Reebok la tabla `inventory` solo
      // guarda existencia (el sync escribe quantity: existencia bajo la talla
      // "UNICA"), así que la disponibilidad correcta es la agregada de la fila
      // del producto — por eso viaja también en el payload público.
      db: reebokServerDb,
      cols: "id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at",
      conInventario: true,
    },
    fallback: {
      clienteId: 1,
      clienteNombre: "Contado",
      vendedorId: 2,
      vendedorNombre: "Reinaldo Espinosa",
    },
  },
  joybees: {
    marca: "joybees",
    label: "Joybees",
    empresaKey: "joystep",
    ordersTable: "joybees_orders",
    itemsRelation: "joybees_order_items",
    enviosTable: "joybees_switch_envios",
    productsTable: "joybees_products",
    publicosTable: "joybees_pedidos_publicos",
    unificadoView: "joybees_pedidos_unificado_vw",
    createOrderRpc: "joybees_create_order",
    replaceItemsRpc: "joybees_order_replace_items",
    convertRpc: "convert_joybees_pedido_publico",
    numeroPrefijo: "JBP",
    cronName: "joybees-catalogo",
    db: joybeesServerDb,
    mainDb: mainServerDb,
    publicosDb: joybeesServerDb,
    publicosInsertClient,
    bultoSize: () => joybeesBulto(),
    calcTotal: calculateJoybeesOrderTotal,
    categoryLookup: null,
    fallbackCategory: null,
    pdfFallbackCategory: "footwear",
    itemsHasPreorder: false,
    ordersSelectExtra: "",
    exportCols: "origen, cliente, vendor, items, created_at",
    exportTitulo: "JOYBEES — Pedidos",
    listaFiltraDeleted: true,
    createRoles: ["admin", "secretaria", "vendedor"],
    upload: { roles: catalogoAdminRoles(), storage: "main", pathPrefix: STORAGE_PREFIX.joybees },
    telegramEmoji: "🐝",
    switchDirectorioLabel: "Joystep",
    sendOrder: {
      from: "Joybees Panama <pedidos@fashiongr.com>",
      headerHtml: (orderNumber, clientName, fechaLabel) => `
      <div style="background:#1a2656;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <img src="https://fashiongr.com/joybees/joybees-logo-blanco.png" alt="Joybees" width="110" height="29" style="display:block;margin-bottom:8px" />
        <h3 style="margin:6px 0 0;font-size:16px;font-weight:normal">Pedido ${orderNumber} — ${clientName}</h3>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7">Fashion Group · Panama — ${fechaLabel}</p>
      </div>`,
      headerClienteHtml: (orderNumber, fechaLabel) => `
      <div style="background:#1a2656;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <img src="https://fashiongr.com/joybees/joybees-logo-blanco.png" alt="Joybees" width="110" height="29" style="display:block;margin-bottom:8px" />
        <h2 style="margin:6px 0 0;font-size:18px">Gracias por tu pedido</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7">Pedido ${orderNumber} · ${fechaLabel}</p>
      </div>`,
      tableHeadBg: "#1a2656",
    },
    sortEmailItems: null,
    pedidoPublico: {
      validateBody: joybeesValidatePedidoBody,
      applyDbPrices: joybeesApplyDbPrices as PedidoPublicoApplyPrices,
      checkRateLimit: joybeesCheckPedidoRateLimit,
      priceCols: "id, price",
    },
    products: {
      authStyle: "roles-modulo",
      editVerb: "POST", // quirk heredado: edición por sku
      idField: "sku",
      // Select explícito = TODAS las columnas reales de joybees_products
      // (regla admin round-trip). existencia/disponibilidad/keep_visible las
      // agregó el DDL 20260629140000 y las escribe el cron de catálogo; el
      // catálogo interno las necesita para la línea "Disponibilidad · Existencia".
      cols: "id,sku,name,category,gender,price,stock,existencia,disponibilidad,keep_visible,image_url,active,popular,is_regalia,badge,created_at",
      readDb: joybeesProductsDb,
      writeDb: joybeesProductsDb,
      hasDelete: false,
    },
    publicCatalog: {
      // `stock` es el espejo de EXISTENCIA que escribe el cron; se conserva por
      // compatibilidad, pero el catálogo público decide con `disponibilidad`.
      db: joybeesProductsDb,
      cols: "id,sku,name,category,gender,price,stock,existencia,disponibilidad,image_url,active,popular,is_regalia,badge",
      conInventario: false,
    },
    fallback: null,
  },
  // ── TOMMY HILFIGER (empresa Switch fashion_shoes, artículos marcaId=3) ──────
  // Tercera marca sobre el motor generalizado — modelo Joybees SIN quirks
  // legacy (marca nueva, no hay comportamiento pre-refactor que preservar):
  // bulto 12 fijo, sin pre-orden, publicos en el client de la marca (que hoy
  // cae al proyecto principal vía tommy-supabase-server), edición por sku vía
  // POST. Diferencia propia: `name` editable en el admin (nombre_manual).
  // NO expuesta en el hub /catalogos/marcas todavía (PR "encender" posterior).
  tommy: {
    marca: "tommy",
    label: "Tommy Hilfiger",
    empresaKey: "fashion_shoes",
    ordersTable: "tommy_orders",
    itemsRelation: "tommy_order_items",
    enviosTable: "tommy_switch_envios",
    productsTable: "tommy_products",
    publicosTable: "tommy_pedidos_publicos",
    unificadoView: "tommy_pedidos_unificado_vw",
    createOrderRpc: "tommy_create_order",
    replaceItemsRpc: "tommy_order_replace_items",
    convertRpc: "convert_tommy_pedido_publico",
    numeroPrefijo: "TOM",
    cronName: "tommy-catalogo",
    db: tommyServerDb,
    mainDb: mainServerDb,
    publicosDb: tommyServerDb,
    publicosInsertClient,
    bultoSize: () => tommyBulto(),
    calcTotal: calculateTommyOrderTotal,
    categoryLookup: null,
    fallbackCategory: null,
    pdfFallbackCategory: "footwear",
    itemsHasPreorder: false,
    ordersSelectExtra: "",
    exportCols: "origen, cliente, vendor, items, created_at",
    exportTitulo: "TOMMY HILFIGER — Pedidos",
    listaFiltraDeleted: true,
    createRoles: ["admin", "secretaria", "vendedor"],
    upload: { roles: catalogoAdminRoles(), storage: "main", pathPrefix: STORAGE_PREFIX.tommy },
    telegramEmoji: "🔵",
    switchDirectorioLabel: "Fashion Shoes",
    sendOrder: {
      from: "Tommy Hilfiger Panama <pedidos@fashiongr.com>",
      headerHtml: (orderNumber, clientName, fechaLabel) => `
      <div style="background:#152342;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <img src="https://fashiongr.com/tommy/tommy-horizontal-blanco.png" alt="TOMMY HILFIGER" width="160" height="9" style="display:block;margin-bottom:8px" />
        <h3 style="margin:6px 0 0;font-size:16px;font-weight:normal">Pedido ${orderNumber} — ${clientName}</h3>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7">Fashion Group · Panama — ${fechaLabel}</p>
      </div>`,
      headerClienteHtml: (orderNumber, fechaLabel) => `
      <div style="background:#152342;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <img src="https://fashiongr.com/tommy/tommy-horizontal-blanco.png" alt="TOMMY HILFIGER" width="160" height="9" style="display:block;margin-bottom:8px" />
        <h2 style="margin:6px 0 0;font-size:18px">Gracias por tu pedido</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7">Pedido ${orderNumber} · ${fechaLabel}</p>
      </div>`,
      tableHeadBg: "#152342",
    },
    sortEmailItems: null,
    pedidoPublico: {
      validateBody: tommyValidatePedidoBody,
      applyDbPrices: tommyApplyDbPrices as PedidoPublicoApplyPrices,
      checkRateLimit: tommyCheckPedidoRateLimit,
      priceCols: "id, price",
    },
    products: {
      authStyle: "roles-modulo",
      editVerb: "POST",
      idField: "sku",
      // Select explícito = TODAS las columnas reales de tommy_products (regla
      // admin round-trip; el DDL 20260724150000 es la fuente).
      cols: "id,sku,name,category,gender,price,stock,existencia,disponibilidad,keep_visible,image_url,active,badge,nombre_manual,created_at",
      readDb: tommyServerDb,
      writeDb: tommyServerDb,
      hasDelete: false,
      nombreEditable: true,
    },
    publicCatalog: {
      // Mismo caso que Joybees: `stock` = espejo de existencia; el catálogo
      // público decide con `disponibilidad`.
      db: tommyServerDb,
      cols: "id,sku,name,category,gender,price,stock,existencia,disponibilidad,image_url,active,badge",
      conInventario: false,
    },
    fallback: null,
  },
};

/** Marca del segmento dinámico [marca] → config; null si no existe (→ 404). */
export function getMarcaConfig(marca: string | undefined | null): MarcaConfig | null {
  if (!marca) return null;
  return MARCAS_CONFIG[marca] ?? null;
}
