// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CONDUCTA — DAVID VE EL CATÁLOGO, Y NADA MÁS (27-ago-2026)
//
// Daniel, textual: ***«catalogo para david si, solo eso»***.
//
// El #659 dejó Catálogos AFUERA con un motivo bueno: las 4 marcas (Reebok,
// Joybees, Tommy, Calvin) son de `active_shoes`, `joystep`, `fashion_shoes` y
// `vistana` — CUATRO EMPRESAS DE FASHION GROUP —, y la frase de Daniel era «no
// quiero que vea info de fashion group». **Él decidió que sí, sabiendo eso.**
//
// Este archivo NO barre texto: llama a los handlers REALES con **cookies
// FIRMADAS** y mira el CÓDIGO que devuelven. Que una constante contenga
// "gerente_boston" no prueba que el endpoint lo deje entrar, y que un
// comentario diga "cerrado" no prueba que lo esté — este repo ya pagó cuatro
// veces el candado que se cumple con su propia explicación.
//
// Las TRES mitades pesan igual:
//   1. 🔴 GANA: **200 con filas** en `GET /catalogo/<marca>/products`, en las 4
//      marcas. Antes era 403.
//   2. 🔴 NO GANA NADA MÁS: **403** en las 12 rutas del módulo que no son «ver
//      el catálogo» — la lista de comprobantes, el directorio de clientes de
//      Switch, los vendedores, la búsqueda del directorio, crear/editar/
//      exportar/mandar por correo un pedido, el checkout, editar un producto,
//      el estado del sync y el permiso de precio. Y en las 4 marcas.
//   3. 🩸 EL 403 PRUEBA ALGO: esas MISMAS rutas dejan pasar a `admin`. Un 403
//      que le sale a todo el mundo no es un permiso cerrado: es una ruta rota.
//
// 🔴 Y LO QUE MÁS IMPORTA: **las dos fugas que tapó el #659 siguen tapadas.**
// Agregar un módulo es justo el cambio que puede reabrirlas, así que se vuelven
// a medir acá con los handlers reales: la búsqueda global le contesta 403 y el
// Inicio del grupo lo sigue esquivando (ahora por su CASA, porque el redirect
// de «módulo único» ya no lo alcanza con dos módulos).
//
// 🔑 **El catálogo NO le muestra costo ni margen**, y no es una decisión de la
// lista de roles: es la forma de la consulta. Hay un caso que lee las columnas
// que la respuesta trae de verdad, en las 4 marcas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

// ── Arnés: ninguna marca toca la base ni Switch ──────────────────────────────
let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
vi.mock("@/components/reebok/supabase", () => ({
  supabase: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: { from: (t: string) => joybeesDb.from(t), rpc: (...a: unknown[]) => joybeesDb.rpc(...a) },
}));
let tommyDb: MockDb;
vi.mock("@/lib/tommy-supabase-server", () => ({
  tommyServer: { from: (t: string) => tommyDb.from(t), rpc: (...a: unknown[]) => tommyDb.rpc(...a) },
}));
let calvinDb: MockDb;
vi.mock("@/lib/calvin-supabase-server", () => ({
  calvinServer: { from: (t: string) => calvinDb.from(t), rpc: (...a: unknown[]) => calvinDb.rpc(...a) },
}));
let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) },
  HAS_SERVICE_ROLE: true,
}));
// Joybees arma su client por request con createClient (patrón original).
vi.mock("@supabase/supabase-js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createClient: () => ({ from: (t: string) => joybeesDb.from(t), rpc: (...a: unknown[]) => joybeesDb.rpc(...a) }),
}));
// Switch: `permiso-precio` y el checkout abren sesión. Nunca sale a la red.
vi.mock("@/lib/switch-api/client", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createSwitchClient: () => ({ verificarPermiso: async () => true }),
  logoutAllSwitchSessions: async () => {},
}));
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => new Map<string, string>()),
}));
vi.mock("@/lib/alertas/canal", () => ({ enviarNegocio: vi.fn(async () => true), enviarSistema: vi.fn(async () => true) }));
vi.mock("@/lib/rechazos-de-switch", () => ({ lineaDeRechazos: async () => null }));

import type { NextRequest, NextResponse } from "next/server";

// Lo SUYO.
import { GET as productsGet, PUT as productsPut, POST as productsPost } from "@/app/api/catalogo/[marca]/products/route";
// Lo que NO es suyo, dentro del mismo módulo.
import { GET as ordersGet, POST as ordersPost } from "@/app/api/catalogo/[marca]/orders/route";
import { GET as unificadoGet } from "@/app/api/catalogo/[marca]/pedidos-unificado/route";
import { POST as exportPost } from "@/app/api/catalogo/[marca]/pedidos-export/route";
import { GET as clientesSwitchGet } from "@/app/api/catalogo/[marca]/clientes-switch/route";
import { GET as vendedoresSwitchGet } from "@/app/api/catalogo/[marca]/vendedores-switch/route";
import { GET as clientesSearchGet } from "@/app/api/catalogo/[marca]/clientes-search/route";
import { GET as syncStatusGet } from "@/app/api/catalogo/[marca]/sync-status/route";
import { GET as permisoPrecioGet } from "@/app/api/catalogo/[marca]/permiso-precio/route";
import { POST as sendOrderPost } from "@/app/api/catalogo/[marca]/send-order/route";
import { POST as checkoutPost } from "@/app/api/catalogo/checkout/route";
// 🔴 Las DOS fugas del #659.
import { GET as busquedaGlobal } from "@/app/api/search/route";

import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { CATALOGO_ROLES, CATALOGO_ADMIN_ROLES, COMPROBANTES_ROLES } from "@/lib/catalogo/roles";
import { ROL_BOSTON, MODULO_BOSTON } from "@/lib/boston/rol";
import { SYSTEM_ROLE_KEYS, getVisibleModules, moduloCasaDeRol } from "@/lib/modules";

beforeAll(() => { process.env.SESSION_SECRET = TEST_SECRET; });

const ROL = ROL_BOSTON;
const MARCAS = ["reebok", "joybees", "tommy", "calvin"] as const;
type Marca = (typeof MARCAS)[number];

const dbDe = (m: Marca): MockDb =>
  ({ reebok: reebokDb, joybees: joybeesDb, tommy: tommyDb, calvin: calvinDb })[m];

const OID = "33333333-3333-4333-8333-333333333333";

/** Dos productos vivos, para que «200 con filas» pueda contar filas de verdad.
 *  Las columnas son las que `MARCAS_CONFIG[*].products.cols` enumera. */
function sembrarProductos(m: Marca) {
  const cfg = MARCAS_CONFIG[m];
  const fila = (id: string, sku: string) => {
    const o: Record<string, unknown> = {};
    for (const col of cfg.products.cols.split(",")) o[col.trim()] = null;
    return { ...o, id, sku, name: "Women-Flip Flops", price: 26.92, active: true };
  };
  dbDe(m).queue(cfg.productsTable, {
    data: [fila("p1", "AAA111"), fila("p2", "BBB222")],
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  tommyDb = makeDb();
  calvinDb = makeDb();
  mainDb = makeDb();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. GANA: ve el catálogo
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1. gerente_boston VE el catálogo — 200 con filas, en las 4 marcas", () => {
  for (const marca of MARCAS) {
    it(`${marca}: gerente_boston → 200 y la respuesta trae filas`, async () => {
      sembrarProductos(marca);
      const req = makeReq(`/api/catalogo/${marca}/products?active=true`, { role: ROL }) as NextRequest;
      const res = await productsGet(req, { params: { marca } });
      expect(res.status, `${marca} / ${ROL}`).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(Array.isArray(body), `${marca}: el cuerpo es una lista`).toBe(true);
      expect(body.length, `${marca}: recibe productos, no una pantalla en ceros`).toBeGreaterThan(0);
    });

    it(`${marca}: a los otros cuatro no se les quitó nada (siguen en 200)`, async () => {
      for (const rol of ["admin", "secretaria", "vendedor", "bodega"]) {
        sembrarProductos(marca);
        const req = makeReq(`/api/catalogo/${marca}/products?active=true`, { role: rol }) as NextRequest;
        expect((await productsGet(req, { params: { marca } })).status, `${marca} / ${rol}`).toBe(200);
      }
    });

    it(`${marca}: contabilidad y gerente_acs siguen en 403`, async () => {
      // Joybees/Tommy/Calvin exigen sesión con rol; Reebok deja leer sin sesión
      // (QUIRK 4 heredado) y por eso no entra en este caso.
      if (marca === "reebok") return;
      for (const rol of ["contabilidad", "gerente_acs"]) {
        sembrarProductos(marca);
        const req = makeReq(`/api/catalogo/${marca}/products?active=true`, { role: rol }) as NextRequest;
        expect((await productsGet(req, { params: { marca } })).status, `${marca} / ${rol}`).toBe(403);
      }
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. 🔴 LO QUE VE NO TRAE COSTO NI MARGEN
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2. el catálogo no le muestra costo ni margen", () => {
  /** Cualquier columna que hable de lo que la mercancía COSTÓ o de cuánto se
   *  gana. `price` es el precio de VENTA — el mismo que ve el cliente final en
   *  el catálogo público — y por eso NO está acá. */
  const PROHIBIDAS = ["costo", "cost", "cif", "fob", "margen", "margin", "utilidad", "profit"];

  for (const marca of MARCAS) {
    it(`${marca}: las columnas que viajan no incluyen costo ni margen`, () => {
      const cols = MARCAS_CONFIG[marca].products.cols.split(",").map((c) => c.trim().toLowerCase());
      for (const mala of PROHIBIDAS) {
        expect(cols, `${marca} expone «${mala}»`).not.toContain(mala);
      }
      // Y la única columna de plata sigue siendo el precio de venta.
      expect(cols, `${marca} dejó de mandar el precio`).toContain("price");
    });

    it(`${marca}: y la RESPUESTA REAL tampoco los trae`, async () => {
      sembrarProductos(marca);
      const req = makeReq(`/api/catalogo/${marca}/products?active=true`, { role: ROL }) as NextRequest;
      const body = (await (await productsGet(req, { params: { marca } })).json()) as Record<string, unknown>[];
      for (const fila of body) {
        for (const clave of Object.keys(fila)) {
          for (const mala of PROHIBIDAS) {
            expect(clave.toLowerCase(), `${marca}: viajó «${clave}»`).not.toContain(mala);
          }
        }
      }
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. 🔴 NO GANA NADA MÁS — 403, y admin SÍ entra a las mismas rutas
// ═════════════════════════════════════════════════════════════════════════════

/** Todo lo del módulo Catálogos que NO es «ver el catálogo», con su handler
 *  REAL. La primera columna es el nombre que sale en el mensaje de error. */
const AJENAS: {
  nombre: string;
  llamar: (marca: Marca, rol: string | undefined) => Promise<Response | NextResponse>;
}[] = [
  {
    nombre: "la lista de comprobantes (GET /orders)",
    llamar: (marca, role) =>
      ordersGet(makeReq(`/api/catalogo/${marca}/orders`, { role }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "el feed del panel de admin (GET /pedidos-unificado)",
    llamar: (marca, role) =>
      unificadoGet(makeReq(`/api/catalogo/${marca}/pedidos-unificado`, { role }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "crear un pedido (POST /orders)",
    llamar: (marca, role) =>
      ordersPost(makeReq(`/api/catalogo/${marca}/orders`, {
        method: "POST", role, body: { client_name: "X", items: [] },
      }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "exportar los pedidos a Excel (POST /pedidos-export)",
    llamar: (marca, role) =>
      exportPost(makeReq(`/api/catalogo/${marca}/pedidos-export`, {
        method: "POST", role, body: { ids: [OID] },
      }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "🔴 el directorio de clientes de Switch (GET /clientes-switch)",
    llamar: (marca, role) =>
      clientesSwitchGet(makeReq(`/api/catalogo/${marca}/clientes-switch?q=city`, { role }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "los vendedores de Switch (GET /vendedores-switch)",
    llamar: (marca, role) =>
      vendedoresSwitchGet(makeReq(`/api/catalogo/${marca}/vendedores-switch?orderId=${OID}`, { role }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "🔴 la búsqueda del directorio de clientes (GET /clientes-search)",
    llamar: (marca, role) =>
      clientesSearchGet(makeReq(`/api/catalogo/${marca}/clientes-search?q=city`, { role }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "el estado del sync de la marca (GET /sync-status)",
    llamar: (marca, role) =>
      syncStatusGet(makeReq(`/api/catalogo/${marca}/sync-status`, { role }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "el permiso de cambiar precio en Switch (GET /permiso-precio)",
    llamar: (marca, role) =>
      permisoPrecioGet(makeReq(`/api/catalogo/${marca}/permiso-precio`, { role }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "mandar el pedido por correo (POST /send-order)",
    llamar: (marca, role) =>
      sendOrderPost(makeReq(`/api/catalogo/${marca}/send-order`, {
        method: "POST", role, body: { items: [] },
      }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "editar un producto (allow-list image_url/badge)",
    llamar: (marca, role) => {
      const cfg = MARCAS_CONFIG[marca];
      const req = makeReq(`/api/catalogo/${marca}/products`, {
        method: cfg.products.editVerb, role, body: { [cfg.products.idField]: "p1", badge: "nuevo" },
      }) as NextRequest;
      return cfg.products.editVerb === "PUT"
        ? productsPut(req, { params: { marca } })
        : productsPost(req, { params: { marca } });
    },
  },
];

describe("🔴 3. gerente_boston NO gana nada más dentro de Catálogos", () => {
  for (const { nombre, llamar } of AJENAS) {
    it(`${nombre}: 403 en las 4 marcas`, async () => {
      for (const marca of MARCAS) {
        const res = await llamar(marca, ROL);
        expect(res.status, `${marca}: «${nombre}» dejó entrar a ${ROL}`).toBe(403);
      }
    });
  }

  it("🩸 y no es que la ruta rechace a TODO el mundo: admin sí entra", async () => {
    for (const { nombre, llamar } of AJENAS) {
      for (const marca of MARCAS) {
        const res = await llamar(marca, "admin");
        expect(res.status, `${marca}: «${nombre}» rechaza hasta a admin — el 403 no prueba nada`)
          .not.toBe(403);
      }
    }
  });

  it("el checkout del carrito: 403 para él, y admin entra", async () => {
    const pedir = (role: string) =>
      checkoutPost(makeReq("/api/catalogo/checkout", {
        method: "POST", role, body: { marca: "reebok", cliente: { id: 1, nombre: "X" }, items: [] },
      }) as NextRequest);
    expect((await pedir(ROL)).status).toBe(403);
    expect((await pedir("admin")).status).not.toBe(403);
  });

  it("sin cookie es 401: abrirle el catálogo no aflojó la exigencia de sesión", async () => {
    // Se mide sobre `products` de Tommy, que es justo la ruta que este cambio
    // abre. ⚠️ En `orders` la misma llamada da 403 y no 401 — conducta
    // PRE-EXISTENTE, ya fijada en `bodega-ve-pedidos.test.ts`, y no se toca acá.
    sembrarProductos("tommy");
    const res = await productsGet(
      makeReq("/api/catalogo/tommy/products?active=true") as NextRequest,
      { params: { marca: "tommy" } },
    );
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Las listas: entró a UNA sola
// ═════════════════════════════════════════════════════════════════════════════

describe("gerente_boston entró a UNA lista, no a cuatro", () => {
  it("VER sí; administrar, comprobantes y armar pedidos NO", () => {
    expect(CATALOGO_ROLES as readonly string[]).toContain(ROL);
    expect(CATALOGO_ADMIN_ROLES as readonly string[]).not.toContain(ROL);
    expect(COMPROBANTES_ROLES as readonly string[]).not.toContain(ROL);
    for (const marca of MARCAS) {
      expect(MARCAS_CONFIG[marca].createRoles, `${marca}: puede armar pedidos`).not.toContain(ROL);
      expect(MARCAS_CONFIG[marca].upload.roles, `${marca}: puede subir fotos`).not.toContain(ROL);
    }
  });

  it("🔑 el rol se DERIVA de lib/boston/rol, no se escribe a mano en la lista", () => {
    // Una copia a mano es la que un día queda vieja: es el bug de
    // `boston-roles.ts`, que dejó a 3 vendedores tocando una pestaña con 403.
    expect(CATALOGO_ROLES as readonly string[]).toContain(ROL_BOSTON);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. 🔴 LAS DOS FUGAS DEL #659 SIGUEN TAPADAS
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 las dos fugas del #659 siguen tapadas", () => {
  it("FUGA 1 · la búsqueda global le contesta 403 (cubre 8 módulos del grupo)", async () => {
    const req = makeReq("/api/search?q=city%20mall", { role: ROL }) as NextRequest;
    expect((await busquedaGlobal(req)).status).toBe(403);
  });

  it("FUGA 1 · y no es una ruta rota: admin entra", async () => {
    const req = makeReq("/api/search?q=city%20mall", { role: "admin" }) as NextRequest;
    expect((await busquedaGlobal(req)).status).not.toBe(403);
  });

  it("FUGA 2 · su CASA sigue siendo Boston aunque tenga dos módulos", () => {
    expect(moduloCasaDeRol(ROL)).toBe(MODULO_BOSTON);
    const visibles = getVisibleModules(ROL, [MODULO_BOSTON, "catalogos"]);
    expect(visibles.length, "ya no es un rol de módulo único").toBeGreaterThan(1);
    expect(visibles.find((m) => m.key === moduloCasaDeRol(ROL))?.href).toBe("/boston");
  });

  it("FUGA 2 · y ningún otro rol ganó una casa de rebote", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      if (rol === ROL) continue;
      expect(moduloCasaDeRol(rol), `${rol} ganó una casa`).toBeNull();
    }
  });
});
