// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de
// POST /api/catalogo/{reebok,joybees}/pedidos-publicos/[short_id]/convertir
//
// Conversión ADMIN de un pedido del link a PED-/JBP- vía la RPC atómica
// convert_{reebok,joybees}_pedido_publico. El total se calcula en JS
// (Reebok: categoría real con fallback apparel; Joybees: bulto 12) y la RPC
// solo inserta. Idempotente: passthrough de already_converted.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
  },
}));

let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: {
    from: (t: string) => joybeesDb.from(t),
    rpc: (...a: unknown[]) => joybeesDb.rpc(...a),
  },
}));

let categoryMap = new Map<string, string>();
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => categoryMap),
}));

// PR-1: rutas dinámicas [marca] — un solo handler por endpoint; los wrappers
// inyectan la marca del segmento (mismas aserciones que el arnés de PR-0).
import type { NextRequest } from "next/server";
import { POST as convertirPost } from "@/app/api/catalogo/[marca]/pedidos-publicos/[short_id]/convertir/route";
type SidCtx = { params: { short_id: string } };
const rConvertir = (req: NextRequest, ctx: SidCtx) => convertirPost(req, { params: { marca: "reebok", ...ctx.params } });
const jConvertir = (req: NextRequest, ctx: SidCtx) => convertirPost(req, { params: { marca: "joybees", ...ctx.params } });
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const SID = "abc12345";

beforeEach(() => {
  vi.clearAllMocks();
  mainDb = makeDb();
  joybeesDb = makeDb();
  categoryMap = new Map();
});

describe("POST /pedidos-publicos/[short_id]/convertir", () => {
  it("401 sin sesión y 403 vendedor (solo admin/secretaria) — ambas marcas", async () => {
    for (const [post, param] of [
      [rConvertir, { params: { short_id: SID } }],
      [jConvertir, { params: { short_id: SID } }],
    ] as const) {
      expect((await post(makeReq("/x", { method: "POST" }), param)).status).toBe(401);
      expect((await post(makeReq("/x", { method: "POST", role: "vendedor" }), param)).status).toBe(
        403,
      );
    }
  });

  it("404 si el pedido público no existe — ambas marcas", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: null });
    expect(
      (await rConvertir(makeReq("/x", { method: "POST", role: "admin" }), {
        params: { short_id: SID },
      })).status,
    ).toBe(404);

    joybeesDb.queue("joybees_pedidos_publicos", { data: null });
    expect(
      (await jConvertir(makeReq("/x", { method: "POST", role: "admin" }), {
        params: { short_id: SID },
      })).status,
    ).toBe(404);
  });

  it("reebok: RPC convert_reebok_pedido_publico con p_total por categoría (fallback apparel) y passthrough", async () => {
    categoryMap = new Map([[P1, "footwear"]]);
    mainDb.queue("reebok_pedidos_publicos", {
      data: {
        short_id: SID,
        convertida: false,
        ped_order_number: null,
        items: [
          { product_id: P1, quantity: 2, unit_price: 10 }, // 2×12×10 = 240
          { product_id: P2, quantity: 1, unit_price: 5 }, // sin category en DB → apparel 1×6×5 = 30
        ],
      },
    });
    mainDb.queueRpc({
      data: { order_number: "PED-070", order_id: "oid-1", already_converted: false },
    });

    const res = await rConvertir(makeReq("/x", { method: "POST", role: "secretaria" }), {
      params: { short_id: SID },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      order_number: "PED-070",
      order_id: "oid-1",
      already_converted: false,
    });
    const [rpcName, args] = mainDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("convert_reebok_pedido_publico");
    expect(args.p_short_id).toBe(SID);
    expect(args.p_total).toBe(270);
  });

  it("joybees: RPC convert_joybees_pedido_publico con bulto 12; idempotencia = passthrough already_converted", async () => {
    joybeesDb.queue("joybees_pedidos_publicos", {
      data: {
        short_id: SID,
        convertida: true,
        ped_order_number: "JBP-030",
        items: [{ product_id: P1, quantity: 2, unit_price: 10 }],
      },
    });
    joybeesDb.queueRpc({
      data: { order_number: "JBP-030", order_id: "oid-2", already_converted: true },
    });

    const res = await jConvertir(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { short_id: SID },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.already_converted).toBe(true);
    expect(json.order_number).toBe("JBP-030");
    const [rpcName, args] = joybeesDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("convert_joybees_pedido_publico");
    expect(args.p_total).toBe(240); // 2×12×10
  });

  it("500 amigable si la RPC falla — ambas marcas", async () => {
    mainDb.queue("reebok_pedidos_publicos", {
      data: { short_id: SID, items: [{ product_id: P1, quantity: 1, unit_price: 1 }] },
    });
    mainDb.queueRpc({ data: null, error: { message: "boom" } });
    const rRes = await rConvertir(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { short_id: SID },
    });
    expect(rRes.status).toBe(500);

    joybeesDb.queue("joybees_pedidos_publicos", {
      data: { short_id: SID, items: [{ product_id: P1, quantity: 1, unit_price: 1 }] },
    });
    joybeesDb.queueRpc({ data: null, error: { message: "boom" } });
    const jRes = await jConvertir(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { short_id: SID },
    });
    expect(jRes.status).toBe(500);
  });
});
