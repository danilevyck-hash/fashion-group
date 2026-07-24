// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de /api/catalogo/{reebok,joybees}/orders
// (lista, crear, detalle, editar, borrar) + orders/[id]/item.
//
// Fija el comportamiento ACTUAL antes del refactor a rutas dinámicas [marca]:
//   · auth/roles y códigos exactos (incluye divergencias reales entre marcas)
//   · numeración PED-/JBP- vía RPC {reebok,joybees}_create_order + idempotencia
//   · re-cálculo de total server-side (bulto por categoría / bulto 12)
//   · candado post-envío a Switch #236: bloquea CONTENIDO (409 switchLock),
//     un PUT solo-status pasa sin consultar el candado
//   · DELETE = soft-delete (update deleted=true, nunca .delete())
//
// DIVERGENCIAS ACTUALES capturadas a propósito (el refactor NO debe
// "aprovechar" para cambiarlas sin decisión explícita):
//   · GET lista sin sesión responde 403 (no 401) en ambas marcas
//   · CREATE_ROLES: reebok incluye el rol legacy "cliente"; joybees no
//   · GET lista reebok NO filtra deleted=false en la query; joybees SÍ
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: {
    from: (t: string) => reebokDb.from(t),
    rpc: (...a: unknown[]) => reebokDb.rpc(...a),
  },
}));

let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: {
    from: (t: string) => joybeesDb.from(t),
    rpc: (...a: unknown[]) => joybeesDb.rpc(...a),
  },
}));

const mockTelegram = vi.fn(async () => {});
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: (...a: unknown[]) => mockTelegram(...a),
}));

// Categorías controladas por test (la lookup real pega a la DB de Reebok).
let categoryMap = new Map<string, string>();
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => categoryMap),
}));

import { GET as rListGet, POST as rListPost } from "@/app/api/catalogo/reebok/orders/route";
import { GET as jListGet, POST as jListPost } from "@/app/api/catalogo/joybees/orders/route";
import {
  GET as rOrderGet,
  PUT as rOrderPut,
  DELETE as rOrderDel,
} from "@/app/api/catalogo/reebok/orders/[id]/route";
import {
  PUT as jOrderPut,
  DELETE as jOrderDel,
} from "@/app/api/catalogo/joybees/orders/[id]/route";
import { PATCH as rItemPatch } from "@/app/api/catalogo/reebok/orders/[id]/item/route";
import { PATCH as jItemPatch } from "@/app/api/catalogo/joybees/orders/[id]/item/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  categoryMap = new Map();
});

// ─── GET /orders (lista) ─────────────────────────────────────────────────────

describe("GET /orders — lista", () => {
  it("sin sesión responde 403 (contrato ACTUAL: no distingue 401) — ambas marcas", async () => {
    expect((await rListGet(makeReq("/api/catalogo/reebok/orders"))).status).toBe(403);
    expect((await jListGet(makeReq("/api/catalogo/joybees/orders"))).status).toBe(403);
  });

  it("bodega no ve pedidos (403) — ambas marcas", async () => {
    expect((await rListGet(makeReq("/x", { role: "bodega" }))).status).toBe(403);
    expect((await jListGet(makeReq("/x", { role: "bodega" }))).status).toBe(403);
  });

  it("reebok: 200 con total re-calculado por categoría e items colapsados a item_count", async () => {
    categoryMap = new Map([
      [P1, "footwear"],
      [P2, "apparel"],
    ]);
    reebokDb.queue("reebok_orders", {
      data: [
        {
          id: OID,
          order_number: "PED-001",
          client_name: "Cliente",
          status: "borrador",
          total: 999999, // guardado stale — NO debe salir
          reebok_order_items: [
            { id: "i1", product_id: P1, quantity: 2, unit_price: 10 }, // 2×12×10=240
            { id: "i2", product_id: P2, quantity: 1, unit_price: 5 }, // 1×6×5=30
          ],
        },
      ],
    });
    const res = await rListGet(makeReq("/x", { role: "vendedor" }));
    expect(res.status).toBe(200);
    const [o] = await res.json();
    expect(o.total).toBe(270);
    expect(o.item_count).toBe(2);
    expect(o.reebok_order_items).toBeUndefined();
    expect(o.order_number).toBe("PED-001");
  });

  it("reebok: producto sin category resoluble usa fallback apparel (bulto 6, nunca infla)", async () => {
    reebokDb.queue("reebok_orders", {
      data: [
        {
          id: OID,
          order_number: "PED-002",
          reebok_order_items: [{ id: "i1", product_id: P1, quantity: 1, unit_price: 10 }],
        },
      ],
    });
    const res = await rListGet(makeReq("/x", { role: "admin" }));
    const [o] = await res.json();
    expect(o.total).toBe(60); // 1×6×10, no 120
  });

  it("joybees: 200 con total bulto 12 y filtro deleted=false en la query", async () => {
    joybeesDb.queue("joybees_orders", {
      data: [
        {
          id: OID,
          order_number: "JBP-001",
          joybees_order_items: [{ id: "i1", product_id: P1, quantity: 2, unit_price: 10 }],
        },
      ],
    });
    const res = await jListGet(makeReq("/x", { role: "admin" }));
    expect(res.status).toBe(200);
    const [o] = await res.json();
    expect(o.total).toBe(240);
    expect(o.joybees_order_items).toBeUndefined();
    const chain = joybeesDb.chainsFor("joybees_orders")[0];
    expect(chain._calls.eq).toContainEqual(["deleted", false]);
  });

  it("DIVERGENCIA actual: la lista reebok NO filtra deleted en la query (joybees sí)", async () => {
    reebokDb.queue("reebok_orders", { data: [] });
    await rListGet(makeReq("/x", { role: "admin" }));
    const chain = reebokDb.chainsFor("reebok_orders")[0];
    expect(chain._calls.eq ?? []).not.toContainEqual(["deleted", false]);
  });
});

// ─── POST /orders (crear) ────────────────────────────────────────────────────

describe("POST /orders — crear con numeración RPC e idempotencia", () => {
  const items = [
    { product_id: P1, sku: "S1", name: "Zapato", quantity: 2, unit_price: 10 },
    { product_id: P2, sku: "S2", name: "Camisa", quantity: 1, unit_price: 5 },
  ];

  it("roles: bodega 403 en ambas; rol legacy 'cliente' pasa en reebok pero NO en joybees (divergencia actual)", async () => {
    expect(
      (await rListPost(makeReq("/x", { method: "POST", body: {}, role: "bodega" }))).status,
    ).toBe(403);
    expect(
      (await jListPost(makeReq("/x", { method: "POST", body: {}, role: "bodega" }))).status,
    ).toBe(403);

    // joybees: cliente rechazado sin tocar la DB
    const jRes = await jListPost(
      makeReq("/x", { method: "POST", body: { client_name: "C", items }, role: "cliente" }),
    );
    expect(jRes.status).toBe(403);
    expect(joybeesDb.rpc).not.toHaveBeenCalled();

    // reebok: cliente pasa la puerta de roles (llega hasta la RPC)
    reebokDb.queueRpc({
      data: { order_id: OID, order_number: "PED-009", already_created: false },
    });
    reebokDb.queue("reebok_orders", { data: { id: OID, order_number: "PED-009" } });
    const rRes = await rListPost(
      makeReq("/x", { method: "POST", body: { client_name: "C", items }, role: "cliente" }),
    );
    expect(rRes.status).toBe(200);
  });

  it("400 sin client_name / sin items / items vacíos — ambas marcas", async () => {
    for (const post of [rListPost, jListPost]) {
      expect(
        (await post(makeReq("/x", { method: "POST", body: { items }, role: "admin" }))).status,
      ).toBe(400);
      expect(
        (await post(makeReq("/x", { method: "POST", body: { client_name: "C" }, role: "admin" })))
          .status,
      ).toBe(400);
      expect(
        (
          await post(
            makeReq("/x", { method: "POST", body: { client_name: "C", items: [] }, role: "admin" }),
          )
        ).status,
      ).toBe(400);
    }
  });

  it("400 si algún unit_price no es > 0 — ambas marcas", async () => {
    const bad = [{ product_id: P1, quantity: 1, unit_price: 0 }];
    for (const post of [rListPost, jListPost]) {
      const res = await post(
        makeReq("/x", { method: "POST", body: { client_name: "C", items: bad }, role: "admin" }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("mayor a cero");
    }
  });

  it("reebok: RPC reebok_create_order con p_total por categoría + is_preorder; Telegram al crear", async () => {
    categoryMap = new Map([
      [P1, "footwear"],
      [P2, "apparel"],
    ]);
    reebokDb.queueRpc({
      data: { order_id: OID, order_number: "PED-101", already_created: false },
    });
    reebokDb.queue("reebok_orders", { data: { id: OID, order_number: "PED-101" } });

    const res = await rListPost(
      makeReq("/x", {
        method: "POST",
        body: {
          client_name: "Cliente X",
          items: [{ ...items[0], is_preorder: true }, items[1]],
          idempotency_key: "k1",
        },
        role: "secretaria",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: OID, order_number: "PED-101" });

    expect(reebokDb.rpc).toHaveBeenCalledTimes(1);
    const [rpcName, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("reebok_create_order");
    expect(args.p_total).toBe(270); // 2×12×10 + 1×6×5
    expect(args.p_idempotency_key).toBe("k1");
    const pItems = args.p_items as Array<Record<string, unknown>>;
    expect(pItems[0].is_preorder).toBe(true);
    expect(pItems[1].is_preorder).toBe(false);

    expect(mockTelegram).toHaveBeenCalledTimes(1);
    expect(String(mockTelegram.mock.calls[0][0])).toContain("PED-101");
  });

  it("reebok: retry idempotente (already_created=true) NO re-alerta a Telegram", async () => {
    reebokDb.queueRpc({
      data: { order_id: OID, order_number: "PED-101", already_created: true },
    });
    reebokDb.queue("reebok_orders", { data: { id: OID, order_number: "PED-101" } });
    const res = await rListPost(
      makeReq("/x", {
        method: "POST",
        body: { client_name: "C", items, idempotency_key: "k1" },
        role: "admin",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockTelegram).not.toHaveBeenCalled();
  });

  it("joybees: RPC joybees_create_order con p_total bulto 12 y p_items SIN is_preorder", async () => {
    joybeesDb.queueRpc({
      data: { order_id: OID, order_number: "JBP-055", already_created: false },
    });
    joybeesDb.queue("joybees_orders", { data: { id: OID, order_number: "JBP-055" } });

    const res = await jListPost(
      makeReq("/x", { method: "POST", body: { client_name: "C", items }, role: "vendedor" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: OID, order_number: "JBP-055" });

    const [rpcName, args] = joybeesDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("joybees_create_order");
    expect(args.p_total).toBe(300); // 2×12×10 + 1×12×5
    const pItems = args.p_items as Array<Record<string, unknown>>;
    expect(pItems.every((i) => !("is_preorder" in i))).toBe(true);
    expect(String(mockTelegram.mock.calls[0][0])).toContain("Joybees");
  });

  it("RPC con error responde 500 'Error interno' — ambas marcas", async () => {
    reebokDb.queueRpc({ data: null, error: { message: "boom" } });
    joybeesDb.queueRpc({ data: null, error: { message: "boom" } });
    for (const post of [rListPost, jListPost]) {
      const res = await post(
        makeReq("/x", { method: "POST", body: { client_name: "C", items }, role: "admin" }),
      );
      expect(res.status).toBe(500);
    }
  });
});

// ─── GET /orders/[id] (detalle) ──────────────────────────────────────────────

describe("GET /orders/[id] — detalle reebok", () => {
  it("401 sin sesión", async () => {
    const res = await rOrderGet(makeReq("/x"), { params: { id: OID } });
    expect(res.status).toBe(401);
  });

  it("pedido inexistente responde 500 (contrato ACTUAL — no hay 404 en este GET)", async () => {
    reebokDb.queue("reebok_orders", { data: null, error: { message: "no rows" } });
    const res = await rOrderGet(makeReq("/x", { role: "admin" }), { params: { id: OID } });
    expect(res.status).toBe(500);
  });

  it("total re-calculado, items enriquecidos con category y trazabilidad de reemplazo en null", async () => {
    categoryMap = new Map([[P1, "footwear"]]);
    reebokDb.queue(
      "reebok_orders",
      // 1º: el select principal (.single())
      {
        data: {
          id: OID,
          order_number: "PED-010",
          client_name: "C",
          status: "borrador",
          total: 1,
          reebok_order_items: [
            { id: "i1", order_id: OID, product_id: P1, sku: "S1", quantity: 2, unit_price: 10 },
            { id: "i2", order_id: OID, product_id: P2, sku: "S2", quantity: 1, unit_price: 5 },
          ],
        },
      },
      // 2º: probe reemplaza_a (fetchReemplazoInfo)
      { data: { reemplaza_a: null } },
      // 3º: query inversa "reemplazado por"
      { data: null },
    );
    const res = await rOrderGet(makeReq("/x", { role: "vendedor" }), { params: { id: OID } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(270); // 240 footwear + 30 fallback apparel
    expect(json.reebok_order_items[0].category).toBe("footwear");
    expect(json.reebok_order_items[1].category).toBe("apparel"); // fallback
    expect(json.reemplaza_a).toBeNull();
    expect(json.reemplazado_por).toBeNull();
    expect(json.original).toBeNull();
  });
});

// ─── PUT /orders/[id] — candado #236 ─────────────────────────────────────────

describe("PUT /orders/[id] — candado post-envío a Switch (#236)", () => {
  it("403 para bodega — ambas marcas", async () => {
    expect(
      (await rOrderPut(makeReq("/x", { method: "PUT", body: {}, role: "bodega" }), {
        params: { id: OID },
      })).status,
    ).toBe(403);
    expect(
      (await jOrderPut(makeReq("/x", { method: "PUT", body: {}, role: "bodega" }), {
        params: { id: OID },
      })).status,
    ).toBe(403);
  });

  it("contenido con envío activo → 409 switchLock con el número de Switch — ambas marcas", async () => {
    reebokDb.queue("reebok_switch_envios", {
      data: { estado: "enviado", numero_interno: "16-000000489", pedido_switch_id: 489 },
    });
    const rRes = await rOrderPut(
      makeReq("/x", { method: "PUT", body: { client_name: "Otro" }, role: "admin" }),
      { params: { id: OID } },
    );
    expect(rRes.status).toBe(409);
    const rJson = await rRes.json();
    expect(rJson.switchLock).toBe(true);
    expect(rJson.error).toContain("16-000000489");

    joybeesDb.queue("joybees_switch_envios", {
      data: { estado: "verificado", numero_interno: "23-000000012", pedido_switch_id: 12 },
    });
    const jRes = await jOrderPut(
      makeReq("/x", { method: "PUT", body: { items: [] }, role: "admin" }),
      { params: { id: OID } },
    );
    expect(jRes.status).toBe(409);
    expect((await jRes.json()).switchLock).toBe(true);
  });

  it("PUT solo-status NO consulta el candado y pasa (flujo 'Editar y re-enviar')", async () => {
    // Aunque haya envío activo, un PUT de solo status debe pasar sin mirar envíos.
    reebokDb.queue("reebok_switch_envios", {
      data: { estado: "enviado", numero_interno: "16-000000489" },
    });
    reebokDb.queue("reebok_orders", { data: null, error: null });
    const res = await rOrderPut(
      makeReq("/x", { method: "PUT", body: { status: "confirmado" }, role: "admin" }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(reebokDb.tables()).not.toContain("reebok_switch_envios");
    // El update escalar lleva status + updated_at
    const payload = reebokDb.chainsFor("reebok_orders")[0]._calls.update[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.status).toBe("confirmado");
    expect(typeof payload.updated_at).toBe("string");
  });

  it("reebok: reemplazo de items vía RPC reebok_order_replace_items con total re-calculado", async () => {
    categoryMap = new Map([[P1, "footwear"]]);
    reebokDb.queue("reebok_switch_envios", { data: null }); // sin envío → sin candado
    reebokDb.queueRpc({ data: null, error: null });
    reebokDb.queue("reebok_orders", { data: null, error: null });

    const res = await rOrderPut(
      makeReq("/x", {
        method: "PUT",
        body: { items: [{ product_id: P1, quantity: 3, unit_price: 10 }] },
        role: "secretaria",
      }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);
    const [rpcName, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("reebok_order_replace_items");
    expect(args.p_order_id).toBe(OID);
    expect(args.p_total).toBe(360); // 3×12×10
  });

  it("joybees: reemplazo de items vía RPC joybees_order_replace_items con bulto 12", async () => {
    joybeesDb.queue("joybees_switch_envios", { data: null });
    joybeesDb.queueRpc({ data: null, error: null });
    joybeesDb.queue("joybees_orders", { data: null, error: null });

    const res = await jOrderPut(
      makeReq("/x", {
        method: "PUT",
        body: { items: [{ product_id: P1, quantity: 2, unit_price: 5 }] },
        role: "admin",
      }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);
    const [rpcName, args] = joybeesDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("joybees_order_replace_items");
    expect(args.p_total).toBe(120); // 2×12×5
  });
});

// ─── DELETE /orders/[id] — soft-delete ───────────────────────────────────────

describe("DELETE /orders/[id] — soft-delete", () => {
  it("vendedor no puede eliminar (403, solo admin/secretaria) — ambas marcas", async () => {
    expect(
      (await rOrderDel(makeReq("/x", { method: "DELETE", role: "vendedor" }), {
        params: { id: OID },
      })).status,
    ).toBe(403);
    expect(
      (await jOrderDel(makeReq("/x", { method: "DELETE", role: "vendedor" }), {
        params: { id: OID },
      })).status,
    ).toBe(403);
  });

  it("soft-delete: update {deleted, deleted_at}, NUNCA .delete() físico — ambas marcas", async () => {
    reebokDb.queue("reebok_orders", { data: null, error: null });
    const rRes = await rOrderDel(makeReq("/x", { method: "DELETE", role: "secretaria" }), {
      params: { id: OID },
    });
    expect(rRes.status).toBe(200);
    expect(await rRes.json()).toEqual({ ok: true });
    const rChain = reebokDb.chainsFor("reebok_orders")[0];
    const rPayload = rChain._calls.update[0][0] as Record<string, unknown>;
    expect(rPayload.deleted).toBe(true);
    expect(typeof rPayload.deleted_at).toBe("string");
    expect(rChain._calls.delete).toBeUndefined();

    joybeesDb.queue("joybees_orders", { data: null, error: null });
    const jRes = await jOrderDel(makeReq("/x", { method: "DELETE", role: "admin" }), {
      params: { id: OID },
    });
    expect(jRes.status).toBe(200);
    const jChain = joybeesDb.chainsFor("joybees_orders")[0];
    expect((jChain._calls.update[0][0] as Record<string, unknown>).deleted).toBe(true);
    expect(jChain._calls.delete).toBeUndefined();
  });
});

// ─── PATCH /orders/[id]/item ─────────────────────────────────────────────────

describe("PATCH /orders/[id]/item — upsert/eliminar una línea", () => {
  it("401 sin sesión y 403 bodega — ambas marcas", async () => {
    for (const patch of [rItemPatch, jItemPatch]) {
      expect(
        (await patch(makeReq("/x", { method: "PATCH", body: { product_id: P1 } }), {
          params: { id: OID },
        })).status,
      ).toBe(401);
      expect(
        (await patch(makeReq("/x", { method: "PATCH", body: { product_id: P1 }, role: "bodega" }), {
          params: { id: OID },
        })).status,
      ).toBe(403);
    }
  });

  it("400 sin product_id — ambas marcas", async () => {
    for (const patch of [rItemPatch, jItemPatch]) {
      const res = await patch(makeReq("/x", { method: "PATCH", body: {}, role: "admin" }), {
        params: { id: OID },
      });
      expect(res.status).toBe(400);
    }
  });

  it("candado: envío activo → 409 switchLock — ambas marcas", async () => {
    reebokDb.queue("reebok_switch_envios", { data: { estado: "enviado", numero_interno: "N1" } });
    const rRes = await rItemPatch(
      makeReq("/x", { method: "PATCH", body: { product_id: P1, quantity: 1 }, role: "admin" }),
      { params: { id: OID } },
    );
    expect(rRes.status).toBe(409);
    expect((await rRes.json()).switchLock).toBe(true);

    joybeesDb.queue("joybees_switch_envios", { data: { estado: "enviado", numero_interno: "N2" } });
    const jRes = await jItemPatch(
      makeReq("/x", { method: "PATCH", body: { product_id: P1, quantity: 1 }, role: "admin" }),
      { params: { id: OID } },
    );
    expect(jRes.status).toBe(409);
  });

  it("estado 'pendiente' o 'error' del envío NO bloquea (candado solo enviado/verificado)", async () => {
    // El helper getEnvioActivo filtra .in(estado, [enviado, verificado]) — la
    // fila pendiente/error simplemente no matchea → data null → sin candado.
    reebokDb.queue("reebok_switch_envios", { data: null });
    reebokDb.queue("reebok_order_items", { data: null, error: null });
    const res = await rItemPatch(
      makeReq("/x", { method: "PATCH", body: { product_id: P1, quantity: 1, unit_price: 3 }, role: "admin" }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);
    const enviosChain = reebokDb.chainsFor("reebok_switch_envios")[0];
    expect(enviosChain._calls.in).toContainEqual(["estado", ["enviado", "verificado"]]);
  });

  it("quantity <= 0 elimina la línea (delete por order_id + product_id)", async () => {
    reebokDb.queue("reebok_switch_envios", { data: null });
    reebokDb.queue("reebok_order_items", { data: null, error: null });
    const res = await rItemPatch(
      makeReq("/x", { method: "PATCH", body: { product_id: P1, quantity: 0 }, role: "admin" }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);
    const chain = reebokDb.chainsFor("reebok_order_items")[0];
    expect(chain._calls.delete).toBeDefined();
    expect(chain._calls.eq).toContainEqual(["order_id", OID]);
    expect(chain._calls.eq).toContainEqual(["product_id", P1]);
  });

  it("upsert con onConflict order_id,product_id; reebok lleva is_preorder y joybees NO", async () => {
    reebokDb.queue("reebok_switch_envios", { data: null });
    reebokDb.queue("reebok_order_items", { data: null, error: null });
    await rItemPatch(
      makeReq("/x", {
        method: "PATCH",
        body: { product_id: P1, quantity: 2, unit_price: 9, is_preorder: true },
        role: "admin",
      }),
      { params: { id: OID } },
    );
    const rChain = reebokDb.chainsFor("reebok_order_items")[0];
    const [rPayload, rOpts] = rChain._calls.upsert[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(rPayload.is_preorder).toBe(true);
    expect(rPayload.unit_price).toBe(9);
    expect(rOpts.onConflict).toBe("order_id,product_id");

    joybeesDb.queue("joybees_switch_envios", { data: null });
    joybeesDb.queue("joybees_order_items", { data: null, error: null });
    await jItemPatch(
      makeReq("/x", {
        method: "PATCH",
        body: { product_id: P1, quantity: 2, unit_price: 9 },
        role: "admin",
      }),
      { params: { id: OID } },
    );
    const jChain = joybeesDb.chainsFor("joybees_order_items")[0];
    const [jPayload, jOpts] = jChain._calls.upsert[0] as [Record<string, unknown>, Record<string, unknown>];
    expect("is_preorder" in jPayload).toBe(false);
    expect(jOpts.onConflict).toBe("order_id,product_id");
  });
});
