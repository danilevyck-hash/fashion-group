// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de orders/[id]/duplicar ("Duplicar y
// corregir" un pedido bloqueado por Switch). Handler compartido por marca:
//   · roles admin/secretaria/vendedor
//   · 503 si la DDL de reemplaza_a no corrió; 404 pedido inexistente
//   · 409 si el pedido NO está en Switch (se edita directo, no se duplica)
//   · dedupe: reemplazo activo existente → lo devuelve (yaExistia=true) sin RPC
//   · clon vía RPC {reebok,joybees}_create_order con total por marca y
//     trazabilidad reemplaza_a en el update posterior
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

let categoryMap = new Map<string, string>();
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => categoryMap),
}));

import { POST as rDuplicar } from "@/app/api/catalogo/reebok/orders/[id]/duplicar/route";
import { POST as jDuplicar } from "@/app/api/catalogo/joybees/orders/[id]/duplicar/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const NEW_ID = "44444444-4444-4444-8444-444444444444";
const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  categoryMap = new Map();
});

describe("POST /orders/[id]/duplicar", () => {
  it("401 sin sesión, 403 bodega — ambas marcas", async () => {
    for (const post of [rDuplicar, jDuplicar]) {
      expect((await post(makeReq("/x", { method: "POST" }), { params: { id: OID } })).status).toBe(401);
      expect(
        (await post(makeReq("/x", { method: "POST", role: "bodega" }), { params: { id: OID } }))
          .status,
      ).toBe(403);
    }
  });

  it("503 con mensaje claro si la columna reemplaza_a no existe (DDL 20260722120000 pendiente)", async () => {
    reebokDb.queue("reebok_orders", {
      data: null,
      error: { message: 'column "reemplaza_a" does not exist' },
    });
    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("20260722120000");
  });

  it("404 si el pedido no existe", async () => {
    reebokDb.queue("reebok_orders", { data: null });
    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(404);
  });

  it("409 si el pedido NO está bloqueado por Switch (se edita directo)", async () => {
    reebokDb.queue("reebok_orders", { data: { id: OID, reemplaza_a: null } });
    reebokDb.queue("reebok_switch_envios", { data: null }); // sin envío activo
    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("no está en Switch");
  });

  it("dedupe: reemplazo activo ya existente → yaExistia=true SIN crear otro", async () => {
    reebokDb.queue(
      "reebok_orders",
      { data: { id: OID, reemplaza_a: null } }, // probe
      { data: { id: NEW_ID, order_number: "PED-201" } }, // reemplazo existente
    );
    reebokDb.queue("reebok_switch_envios", { data: { estado: "enviado", numero_interno: "N1" } });
    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "secretaria" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      id: NEW_ID,
      order_number: "PED-201",
      yaExistia: true,
    });
    expect(reebokDb.rpc).not.toHaveBeenCalled();
  });

  it("reebok happy path: clon vía reebok_create_order (total por categoría) + update reemplaza_a", async () => {
    categoryMap = new Map([[P1, "footwear"]]);
    reebokDb.queue(
      "reebok_orders",
      { data: { id: OID, reemplaza_a: null } }, // probe DDL
      { data: null }, // sin reemplazo existente
      {
        // original con items
        data: {
          id: OID,
          order_number: "PED-100",
          client_name: "Cliente",
          vendor_name: "Vend",
          client_email: null,
          comment: "ojo",
          cliente_switch_id: 7,
          vendedor_switch_id: 2,
          reebok_order_items: [
            { product_id: P1, sku: "S1", name: "P", image_url: null, quantity: 2, unit_price: 10, is_preorder: false },
          ],
        },
      },
      { data: null, error: null }, // update de trazabilidad
    );
    reebokDb.queue("reebok_switch_envios", { data: { estado: "verificado", numero_interno: "N1" } });
    reebokDb.queueRpc({ data: { order_id: NEW_ID, order_number: "PED-202" } });

    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "vendedor" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      id: NEW_ID,
      order_number: "PED-202",
      yaExistia: false,
    });

    const [rpcName, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("reebok_create_order");
    expect(args.p_total).toBe(240); // 2×12×10
    expect(String(args.p_idempotency_key)).toMatch(/^dup-/);

    // Trazabilidad: el último update sobre reebok_orders lleva reemplaza_a +
    // comment + cliente/vendedor del original.
    const chains = reebokDb.chainsFor("reebok_orders");
    const updChain = chains[chains.length - 1];
    const payload = updChain._calls.update[0][0] as Record<string, unknown>;
    expect(payload.reemplaza_a).toBe(OID);
    expect(payload.comment).toBe("ojo");
    expect(payload.cliente_switch_id).toBe(7);
    expect(payload.vendedor_switch_id).toBe(2);
  });

  it("joybees happy path: joybees_create_order con bulto 12 y items sin is_preorder", async () => {
    joybeesDb.queue(
      "joybees_orders",
      { data: { id: OID, reemplaza_a: null } },
      { data: null },
      {
        data: {
          id: OID,
          order_number: "JBP-100",
          client_name: "C",
          vendor_name: null,
          client_email: null,
          comment: null,
          cliente_switch_id: null,
          vendedor_switch_id: null,
          joybees_order_items: [
            { product_id: P1, sku: "S1", name: "P", image_url: null, quantity: 3, unit_price: 5 },
          ],
        },
      },
      { data: null, error: null },
    );
    joybeesDb.queue("joybees_switch_envios", { data: { estado: "enviado", numero_interno: "N2" } });
    joybeesDb.queueRpc({ data: { order_id: NEW_ID, order_number: "JBP-101" } });

    const res = await jDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);
    const [rpcName, args] = joybeesDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("joybees_create_order");
    expect(args.p_total).toBe(180); // 3×12×5
    const pItems = args.p_items as Array<Record<string, unknown>>;
    expect(pItems.every((i) => !("is_preorder" in i))).toBe(true);
  });

  it("400 si el original no tiene productos", async () => {
    reebokDb.queue(
      "reebok_orders",
      { data: { id: OID, reemplaza_a: null } },
      { data: null },
      {
        data: {
          id: OID,
          order_number: "PED-100",
          client_name: "C",
          reebok_order_items: [],
        },
      },
    );
    reebokDb.queue("reebok_switch_envios", { data: { estado: "enviado", numero_interno: "N1" } });
    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(400);
    expect(reebokDb.rpc).not.toHaveBeenCalled();
  });
});
