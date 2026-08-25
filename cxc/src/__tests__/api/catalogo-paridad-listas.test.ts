// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de pedidos-unificado y pedidos-export.
//
//   · roles admin/secretaria (vendedor 403)
//   · total SIEMPRE re-calculado desde items (nunca el guardado de la vista)
//   · fuente: passthrough de la vista, con fallback origen link→publicos
//   · switch_numero: números de envíos ACTIVOS (enviado/verificado, criterio
//     del candado #236/#237)
//   · export: Excel con Content-Type XLSX y filename por marca
//
// Topología actual: la vista reebok vive en el proyecto PRINCIPAL y los envíos
// en el proyecto Reebok; en joybees todo vive en su client (fallback al
// principal). El refactor debe respetarla.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: { from: (t: string) => joybeesDb.from(t), rpc: (...a: unknown[]) => joybeesDb.rpc(...a) },
}));
let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) },
}));

let categoryMap = new Map<string, string>();
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => categoryMap),
}));

// PR-1: rutas dinámicas [marca] — un solo handler por endpoint; los wrappers
// inyectan la marca del segmento (mismas aserciones que el arnés de PR-0).
import type { NextRequest } from "next/server";
import { GET as unificadoGet } from "@/app/api/catalogo/[marca]/pedidos-unificado/route";
import { POST as exportPost } from "@/app/api/catalogo/[marca]/pedidos-export/route";
const rUnificado = (req: NextRequest) => unificadoGet(req, { params: { marca: "reebok" } });
const jUnificado = (req: NextRequest) => unificadoGet(req, { params: { marca: "joybees" } });
const rExport = (req: NextRequest) => exportPost(req, { params: { marca: "reebok" } });
const jExport = (req: NextRequest) => exportPost(req, { params: { marca: "joybees" } });
import { XLSX_MIME } from "@/lib/excel-export";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  mainDb = makeDb();
  categoryMap = new Map();
});

describe("GET /pedidos-unificado", () => {
  it("401 sin sesión, 403 vendedor (solo admin/secretaria) — ambas marcas", async () => {
    for (const get of [rUnificado, jUnificado]) {
      expect((await get(makeReq("/x"))).status).toBe(401);
      expect((await get(makeReq("/x", { role: "vendedor" }))).status).toBe(403);
    }
  });

  it("reebok: total re-calculado por categoría, fuente con fallback y switch_numero de envíos activos", async () => {
    categoryMap = new Map([[P1, "footwear"]]);
    mainDb.queue("reebok_pedidos_unificado_vw", {
      data: [
        {
          origen: "mio",
          id_natural: OID,
          cliente: "Cliente A",
          total: 1, // stale — no debe salir
          created_at: "2026-07-20T10:00:00Z",
          vendor: "V",
          items: [{ product_id: P1, sku: "S1", name: "P", image_url: null, quantity: 2, unit_price: 10 }],
          fuente: "orders",
        },
        {
          origen: "link",
          id_natural: "abc12345",
          cliente: "Cliente B",
          total: 1,
          created_at: "2026-07-19T10:00:00Z",
          vendor: null,
          items: [{ product_id: null, sku: null, name: "X", image_url: null, quantity: 1, unit_price: 5 }],
          // sin `fuente` → fallback por origen
        },
      ],
    });
    reebokDb.queue("reebok_switch_envios", {
      data: [{ order_id: OID, numero_interno: "16-000000489", pedido_switch_id: 489, documento: "pedido" }],
    });
    reebokDb.queue("reebok_orders", { data: [{ id: OID, order_number: "PED-017" }] });

    const res = await rUnificado(makeReq("/x", { role: "admin" }));
    expect(res.status).toBe(200);
    const rows = await res.json();

    expect(rows[0]).toEqual({
      origen: "mio",
      id_natural: OID,
      cliente: "Cliente A",
      total: 240, // 2×12×10
      created_at: "2026-07-20T10:00:00Z",
      vendor: "V",
      item_count: 1,
      fuente: "orders",
      confirmado_cliente_at: null,
      switch_numero: "16-000000489",
      // Los DOS números de la fila (24-ago-2026): el de la casa y el del ERP,
      // con qué se mandó (pedido | cotizacion) para que el número no mienta.
      numero_pedido: "PED-017",
      switch_documento: "pedido",
    });
    // link sin fuente → publicos; product_id null → fallback apparel (bulto 6)
    expect(rows[1].fuente).toBe("publicos");
    expect(rows[1].total).toBe(30); // 1×6×5
    expect(rows[1].switch_numero).toBeNull();
    // El pedido del LINK sin convertir NO tiene número propio: se lo asigna la
    // conversión. Null, y la pantalla lo dice con palabras.
    expect(rows[1].numero_pedido).toBeNull();
    expect(rows[1].switch_documento).toBeNull();

    // El criterio del candado: solo envíos enviado/verificado
    const enviosChain = reebokDb.chainsFor("reebok_switch_envios")[0];
    expect(enviosChain._calls.in).toContainEqual(["estado", ["enviado", "verificado"]]);
  });

  it("joybees: todo en su client, total bulto 12", async () => {
    joybeesDb.queue("joybees_pedidos_unificado_vw", {
      data: [
        {
          origen: "mio",
          id_natural: OID,
          cliente: "C",
          total: 1,
          created_at: "2026-07-20T10:00:00Z",
          vendor: null,
          items: [{ product_id: P1, sku: "S1", name: "P", image_url: null, quantity: 2, unit_price: 10 }],
          fuente: "orders",
        },
      ],
    });
    joybeesDb.queue("joybees_switch_envios", { data: [] });

    const res = await jUnificado(makeReq("/x", { role: "secretaria" }));
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows[0].total).toBe(240); // 2×12×10
    expect(rows[0].switch_numero).toBeNull();
    // Nada de joybees toca los clients de reebok/principal
    expect(reebokDb.tables()).toEqual([]);
    expect(mainDb.tables()).toEqual([]);
  });
});

describe("POST /pedidos-export — Excel de la lista unificada", () => {
  it("401 sin sesión, 403 vendedor — ambas marcas", async () => {
    for (const post of [rExport, jExport]) {
      expect((await post(makeReq("/x", { method: "POST" }))).status).toBe(401);
      expect((await post(makeReq("/x", { method: "POST", role: "vendedor" }))).status).toBe(403);
    }
  });

  it("reebok: XLSX con filename pedidos-reebok", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", {
      data: [
        {
          origen: "mio",
          cliente: "C",
          vendor: null,
          created_at: "2026-07-20T10:00:00Z",
          items: [{ product_id: P1, quantity: 1, unit_price: 10 }],
        },
      ],
    });
    const res = await rExport(makeReq("/x", { method: "POST", role: "admin" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(XLSX_MIME);
    expect(res.headers.get("content-disposition")).toContain("pedidos-reebok");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(500);
  });

  it("joybees: XLSX con filename pedidos-joybees", async () => {
    joybeesDb.queue("joybees_pedidos_unificado_vw", {
      data: [
        {
          origen: "link",
          cliente: "C",
          vendor: null,
          created_at: "2026-07-20T10:00:00Z",
          items: [{ quantity: 1, unit_price: 10 }],
        },
      ],
    });
    const res = await jExport(makeReq("/x", { method: "POST", role: "secretaria" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(XLSX_MIME);
    expect(res.headers.get("content-disposition")).toContain("pedidos-joybees");
  });
});
