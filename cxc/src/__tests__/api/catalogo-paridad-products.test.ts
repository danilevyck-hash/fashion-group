// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de /products (admin) y /public (catálogo
// público) para ambas marcas.
//
// Contratos clave:
//   · allow-list de edición manual = SOLO image_url y badge; cualquier otra
//     columna se RECHAZA con 400 (no se ignora): el cron es dueño del resto
//   · badge válido: null | nuevo | oferta | proximamente
//   · PATCH oculto_manual recalcula `active` con la regla ÚNICA de visibilidad
//   · DELETE reebok = soft-delete (active=false), nunca borrado físico
//
// DIVERGENCIAS ACTUALES capturadas:
//   · GET products reebok es público sin sesión (solo scope=admin exige rol);
//     joybees exige sesión SIEMPRE (401)
//   · identificador de edición: reebok por `id`, joybees por `sku`
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

// Client anon del catálogo Reebok (components/reebok/supabase) — GET products.
let reebokAnonDb: MockDb;
vi.mock("@/components/reebok/supabase", () => ({
  supabase: { from: (t: string) => reebokAnonDb.from(t) },
}));

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: {
    from: (t: string) => reebokDb.from(t),
    rpc: (...a: unknown[]) => reebokDb.rpc(...a),
  },
}));

// Joybees products/public crean su client con createClient() → se intercepta
// el paquete. (reebok-supabase-server está mockeado aparte, no le afecta.)
let mainDb: MockDb;
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
  }),
}));

const mockLogActivity = vi.fn(async () => {});
vi.mock("@/lib/log-activity", () => ({
  logActivity: (...a: unknown[]) => mockLogActivity(...a),
}));

// PR-1: rutas dinámicas [marca] — un solo handler por endpoint; los wrappers
// inyectan la marca del segmento (mismas aserciones que el arnés de PR-0).
import type { NextRequest } from "next/server";
import {
  GET as productsGet,
  PUT as productsPut,
  POST as productsPost,
  PATCH as productsPatch,
  DELETE as productsDelete,
} from "@/app/api/catalogo/[marca]/products/route";
import { GET as publicGet } from "@/app/api/catalogo/[marca]/public/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const rProductsGet = (req: NextRequest) => productsGet(req, { params: { marca: "reebok" } });
const jProductsGet = (req: NextRequest) => productsGet(req, { params: { marca: "joybees" } });
const rProductsPut = (req: NextRequest) => productsPut(req, { params: { marca: "reebok" } });
const jProductsPost = (req: NextRequest) => productsPost(req, { params: { marca: "joybees" } });
const rProductsPatch = (req: NextRequest) => productsPatch(req, { params: { marca: "reebok" } });
const jProductsPatch = (req: NextRequest) => productsPatch(req, { params: { marca: "joybees" } });
const rProductsDelete = (req: NextRequest) => productsDelete(req, { params: { marca: "reebok" } });
const rPublicGet = () => publicGet(makeReq("/x"), { params: { marca: "reebok" } });
const jPublicGet = () => publicGet(makeReq("/x"), { params: { marca: "joybees" } });

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const PID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  reebokAnonDb = makeDb();
  reebokDb = makeDb();
  mainDb = makeDb();
});

// ─── GET products ────────────────────────────────────────────────────────────

describe("GET /products — divergencia de auth actual", () => {
  it("reebok: SIN sesión responde 200 (catálogo legible); scope=admin sin sesión → 403", async () => {
    reebokAnonDb.queue("products", { data: [] });
    expect((await rProductsGet(makeReq("/api/catalogo/reebok/products"))).status).toBe(200);
    expect(
      (await rProductsGet(makeReq("/api/catalogo/reebok/products?scope=admin"))).status,
    ).toBe(403);
  });

  it("joybees: SIN sesión responde 401; bodega SÍ puede consultar (roles del módulo)", async () => {
    expect((await jProductsGet(makeReq("/api/catalogo/joybees/products"))).status).toBe(401);
    mainDb.queue("joybees_products", { data: [] });
    expect(
      (await jProductsGet(makeReq("/api/catalogo/joybees/products", { role: "bodega" }))).status,
    ).toBe(200);
  });

  it("reebok scope=admin: incluye ocultados a mano (active OR oculto_manual)", async () => {
    reebokAnonDb.queue("products", { data: [] });
    const res = await rProductsGet(
      makeReq("/api/catalogo/reebok/products?scope=admin", { role: "secretaria" }),
    );
    expect(res.status).toBe(200);
    const chain = reebokAnonDb.chainsFor("products")[0];
    expect(chain._calls.or).toContainEqual(["active.is.true,oculto_manual.is.true"]);
  });
});

// ─── Edición manual (allow-list) ─────────────────────────────────────────────

describe("edición manual de productos — allow-list image_url/badge", () => {
  it("reebok PUT: campo fuera de la allow-list → 400 explícito (no lo ignora)", async () => {
    const res = await rProductsPut(
      makeReq("/x", { method: "PUT", body: { id: PID, price: 99 }, role: "admin" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("price");
  });

  it("joybees POST espejo: campo no editable → 400; identifica por sku", async () => {
    const res = await jProductsPost(
      makeReq("/x", { method: "POST", body: { sku: "S1", stock: 5 }, role: "admin" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("stock");

    // sin sku → 400
    expect(
      (
        await jProductsPost(
          makeReq("/x", { method: "POST", body: { badge: "nuevo" }, role: "admin" }),
        )
      ).status,
    ).toBe(400);
  });

  it("badge inválido → 400; badge válido pasa — ambas marcas", async () => {
    expect(
      (
        await rProductsPut(
          makeReq("/x", { method: "PUT", body: { id: PID, badge: "loquesea" }, role: "admin" }),
        )
      ).status,
    ).toBe(400);

    reebokDb.queue("products", { data: { id: PID, badge: "nuevo" } });
    expect(
      (
        await rProductsPut(
          makeReq("/x", { method: "PUT", body: { id: PID, badge: "nuevo" }, role: "admin" }),
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await jProductsPost(
          makeReq("/x", { method: "POST", body: { sku: "S1", badge: "loquesea" }, role: "admin" }),
        )
      ).status,
    ).toBe(400);
  });

  it("403 para roles no-admin/secretaria (requireAdmin) — ambas marcas", async () => {
    expect(
      (
        await rProductsPut(
          makeReq("/x", { method: "PUT", body: { id: PID, badge: null }, role: "vendedor" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await jProductsPost(
          makeReq("/x", { method: "POST", body: { sku: "S1", badge: null }, role: "vendedor" }),
        )
      ).status,
    ).toBe(403);
  });
});

// ─── PATCH oculto_manual ─────────────────────────────────────────────────────

describe("PATCH /products — toggle 'Ocultar del catálogo'", () => {
  it("400 sin id/sku o sin oculto boolean — ambas marcas", async () => {
    expect(
      (await rProductsPatch(makeReq("/x", { method: "PATCH", body: { id: PID }, role: "admin" })))
        .status,
    ).toBe(400);
    expect(
      (await jProductsPatch(makeReq("/x", { method: "PATCH", body: { sku: "S1" }, role: "admin" })))
        .status,
    ).toBe(400);
  });

  it("404 si el producto no existe — ambas marcas", async () => {
    reebokDb.queue("products", { data: null });
    expect(
      (
        await rProductsPatch(
          makeReq("/x", { method: "PATCH", body: { id: PID, oculto: true }, role: "admin" }),
        )
      ).status,
    ).toBe(404);

    mainDb.queue("joybees_products", { data: null });
    expect(
      (
        await jProductsPatch(
          makeReq("/x", { method: "PATCH", body: { sku: "S1", oculto: true }, role: "admin" }),
        )
      ).status,
    ).toBe(404);
  });

  it("ocultar: active=false aunque haya existencia; mostrar recalcula con la regla del sync — reebok", async () => {
    // Ocultar
    reebokDb.queue(
      "products",
      { data: { id: PID, sku: "S1", existencia: 10, keep_visible: false, badge: null, oculto_manual: false } },
      { data: { id: PID, sku: "S1", active: false, oculto_manual: true } },
    );
    let res = await rProductsPatch(
      makeReq("/x", { method: "PATCH", body: { id: PID, oculto: true }, role: "admin" }),
    );
    expect(res.status).toBe(200);
    let updPayload = reebokDb.chainsFor("products")[1]._calls.update[0][0] as Record<string, unknown>;
    expect(updPayload).toEqual({ oculto_manual: true, active: false });
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    expect(mockLogActivity.mock.calls[0][1]).toBe("product_ocultar_catalogo");

    // Mostrar (con existencia → visible de nuevo)
    reebokDb = makeDb();
    reebokDb.queue(
      "products",
      { data: { id: PID, sku: "S1", existencia: 10, keep_visible: false, badge: null, oculto_manual: true } },
      { data: { id: PID, sku: "S1", active: true, oculto_manual: false } },
    );
    res = await rProductsPatch(
      makeReq("/x", { method: "PATCH", body: { id: PID, oculto: false }, role: "admin" }),
    );
    expect(res.status).toBe(200);
    updPayload = reebokDb.chainsFor("products")[1]._calls.update[0][0] as Record<string, unknown>;
    expect(updPayload).toEqual({ oculto_manual: false, active: true });
  });

  it("joybees espejo por sku: misma regla de visibilidad", async () => {
    mainDb.queue(
      "joybees_products",
      { data: { id: PID, sku: "S1", existencia: 0, keep_visible: false, badge: null, oculto_manual: true } },
      { data: { id: PID, sku: "S1", active: false, oculto_manual: false } },
    );
    const res = await jProductsPatch(
      makeReq("/x", { method: "PATCH", body: { sku: "S1", oculto: false }, role: "admin" }),
    );
    expect(res.status).toBe(200);
    // Sin existencia y sin keep_visible/badge → aunque se muestre, active=false.
    const updPayload = mainDb.chainsFor("joybees_products")[1]._calls.update[0][0] as Record<
      string,
      unknown
    >;
    expect(updPayload).toEqual({ oculto_manual: false, active: false });
  });
});

// ─── DELETE reebok (soft) ────────────────────────────────────────────────────

describe("DELETE /products — reebok", () => {
  it("400 sin id; 404 si no existe; soft-delete = update active:false", async () => {
    expect(
      (await rProductsDelete(makeReq("/api/x", { method: "DELETE", role: "admin" }))).status,
    ).toBe(400);

    reebokDb.queue("products", { data: null });
    expect(
      (
        await rProductsDelete(
          makeReq(`/api/x?id=${PID}`, { method: "DELETE", role: "admin" }),
        )
      ).status,
    ).toBe(404);

    reebokDb = makeDb();
    reebokDb.queue("products", { data: { id: PID } });
    const res = await rProductsDelete(
      makeReq(`/api/x?id=${PID}`, { method: "DELETE", role: "secretaria" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, deleted: PID });
    const chain = reebokDb.chainsFor("products")[0];
    expect(chain._calls.update[0][0]).toEqual({ active: false });
    expect(chain._calls.delete).toBeUndefined();
  });
});

// ─── GET /public ─────────────────────────────────────────────────────────────

describe("GET /public — catálogo público (sin login)", () => {
  it("reebok: {products, inventory} solo activos", async () => {
    reebokDb.queue("products", { data: [{ id: PID, name: "P", active: true }] });
    reebokDb.queue("inventory", { data: [{ product_id: PID, size: "9", quantity: 3 }] });
    const res = await rPublicGet();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.products).toHaveLength(1);
    expect(json.inventory).toHaveLength(1);
    expect(reebokDb.chainsFor("products")[0]._calls.eq).toContainEqual(["active", true]);
  });

  it("joybees: {products} sin inventory (stock vive en la fila) + Cache-Control no-store", async () => {
    mainDb.queue("joybees_products", { data: [{ id: PID, name: "P", stock: 5, active: true }] });
    const res = await jPublicGet();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.products).toHaveLength(1);
    expect("inventory" in json).toBe(false);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mainDb.chainsFor("joybees_products")[0]._calls.eq).toContainEqual(["active", true]);
  });
});
