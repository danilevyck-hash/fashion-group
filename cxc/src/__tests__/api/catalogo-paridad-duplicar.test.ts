// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de orders/[id]/duplicar ("Duplicar y
// corregir" un pedido bloqueado por Switch). Handler compartido por marca:
//   · roles admin/secretaria/vendedor
//   · 503 si la DDL de reemplaza_a no corrió; 404 pedido inexistente
//   · 409 si el pedido NO está en Switch (se edita directo, no se duplica)
//   · dedupe: reemplazo activo existente → lo devuelve (yaExistia=true) sin RPC
//   · clon vía RPC {reebok,joybees,tommy}_create_order con el calcTotal de la
//     marca (Tommy: bulto_pzas del estilo — NO la fórmula de Joybees) y
//     trazabilidad reemplaza_a en el update posterior
//   · body {client_name}: nombre CAMBIADO → clon con nombre nuevo y SIN
//     cliente_switch_id; nombre igual (espacios/mayúsculas) → se copia
//   · vendedor: el de QUIEN DUPLICA (13-ago-2026) y, sin mapeo en esa empresa,
//     el del original — nunca null
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: { from: (t: string) => joybeesDb.from(t), rpc: (...a: unknown[]) => joybeesDb.rpc(...a) },
}));
let tommyDb: MockDb;
vi.mock("@/lib/tommy-supabase-server", () => ({
  tommyServer: { from: (t: string) => tommyDb.from(t), rpc: (...a: unknown[]) => tommyDb.rpc(...a) },
}));

// Proyecto PRINCIPAL: ahí vive fg_user_switch_vendedor (el mapeo login →
// vendedor de Switch). Sin cola, `.maybeSingle()` devuelve {data:null} = quien
// duplica NO tiene vendedor mapeado en esa empresa.
let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) },
}));

let categoryMap = new Map<string, string>();
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => categoryMap),
}));

// El "Duplicar" de la lista crea con POST /orders, que avisa por Telegram.
vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(async () => {}) }));

// PR-1: rutas dinámicas [marca] — un solo handler por endpoint; los wrappers
// inyectan la marca del segmento (mismas aserciones que el arnés de PR-0).
import type { NextRequest } from "next/server";
import { POST as duplicarPost } from "@/app/api/catalogo/[marca]/orders/[id]/duplicar/route";
type IdCtx = { params: { id: string } };
const rDuplicar = (req: NextRequest, ctx: IdCtx) => duplicarPost(req, { params: { marca: "reebok", ...ctx.params } });
const jDuplicar = (req: NextRequest, ctx: IdCtx) => duplicarPost(req, { params: { marca: "joybees", ...ctx.params } });
const tDuplicar = (req: NextRequest, ctx: IdCtx) => duplicarPost(req, { params: { marca: "tommy", ...ctx.params } });
import { POST as ordersPost } from "@/app/api/catalogo/[marca]/orders/route";
const rCrear = (req: NextRequest) => ordersPost(req, { params: { marca: "reebok" } });
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
  tommyDb = makeDb();
  mainDb = makeDb();
  categoryMap = new Map();
});

/** Cola estándar de un original de Reebok bloqueado por Switch (probe DDL,
 *  sin reemplazo, original con cliente_switch_id, update de trazabilidad). */
function queueOriginalReebok() {
  reebokDb.queue(
    "reebok_orders",
    { data: { id: OID, reemplaza_a: null } },
    { data: null },
    {
      data: {
        id: OID,
        order_number: "PED-100",
        client_name: "Cliente Original",
        vendor_name: "Vend",
        client_email: null,
        comment: null,
        cliente_switch_id: 7,
        vendedor_switch_id: 2,
        reebok_order_items: [
          { product_id: P1, sku: "S1", name: "P", image_url: null, quantity: 2, unit_price: 10, is_preorder: false },
        ],
      },
    },
    { data: null, error: null },
  );
  reebokDb.queue("reebok_switch_envios", { data: { estado: "enviado", numero_interno: "N1" } });
  reebokDb.queueRpc({ data: { order_id: NEW_ID, order_number: "PED-202" } });
}

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

  it("tommy: total con el calcTotal de la marca (bulto_pzas 8 del estilo, no 12 fijo)", async () => {
    tommyDb.queue(
      "tommy_orders",
      { data: { id: OID, reemplaza_a: null } },
      { data: null },
      {
        data: {
          id: OID,
          order_number: "TOM-100",
          client_name: "C",
          vendor_name: null,
          client_email: null,
          comment: null,
          cliente_switch_id: null,
          vendedor_switch_id: null,
          tommy_order_items: [
            { product_id: P1, sku: "FM0FM05537YBS", name: "P", image_url: null, quantity: 2, unit_price: 10 },
          ],
        },
      },
      { data: null, error: null },
    );
    tommyDb.queue("tommy_switch_envios", { data: { estado: "enviado", numero_interno: "N3" } });
    // El estilo está marcado en 8 piezas por bulto (el caso TOM-003).
    tommyDb.queue("tommy_products", { data: [{ id: P1, category: null, bulto_pzas: 8 }] });
    tommyDb.queueRpc({ data: { order_id: NEW_ID, order_number: "TOM-101" } });

    const res = await tDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);
    const [rpcName, args] = tommyDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("tommy_create_order");
    // 2 bultos × 8 pzas × $10 — la fórmula de Joybees (12 fijo) daría 240.
    expect(args.p_total).toBe(160);
    const pItems = args.p_items as Array<Record<string, unknown>>;
    expect(pItems.every((i) => !("is_preorder" in i))).toBe(true);
  });

  it("nombre CAMBIADO en el body → clon con el nombre nuevo y SIN cliente_switch_id (sin mapeo, el vendedor del original)", async () => {
    queueOriginalReebok();
    const res = await rDuplicar(
      makeReq("/x", { method: "POST", role: "secretaria", body: { client_name: "Otro Cliente" } }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);

    const [, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_client_name).toBe("Otro Cliente");

    const chains = reebokDb.chainsFor("reebok_orders");
    const payload = chains[chains.length - 1]._calls.update[0][0] as Record<string, unknown>;
    expect(payload.reemplaza_a).toBe(OID);
    // El candado de este PR: con OTRO cliente, el id de Switch del viejo NO
    // puede viajar — el pedido saldría a Switch bajo el cliente equivocado.
    expect("cliente_switch_id" in payload).toBe(false);
    expect(payload.vendedor_switch_id).toBe(2);
  });

  it("nombre IGUAL (espacios y mayúsculas no cuentan) → cliente_switch_id se copia como siempre", async () => {
    queueOriginalReebok();
    const res = await rDuplicar(
      makeReq("/x", { method: "POST", role: "secretaria", body: { client_name: "  cliente original " } }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);

    const [, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_client_name).toBe("Cliente Original");

    const chains = reebokDb.chainsFor("reebok_orders");
    const payload = chains[chains.length - 1]._calls.update[0][0] as Record<string, unknown>;
    expect(payload.cliente_switch_id).toBe(7);
    expect(payload.vendedor_switch_id).toBe(2);
  });

  it("nombre vacío en el body → se trata como 'sin cambio' (nombre y cliente del original)", async () => {
    queueOriginalReebok();
    const res = await rDuplicar(
      makeReq("/x", { method: "POST", role: "admin", body: { client_name: "   " } }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);
    const [, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_client_name).toBe("Cliente Original");
    const chains = reebokDb.chainsFor("reebok_orders");
    const payload = chains[chains.length - 1]._calls.update[0][0] as Record<string, unknown>;
    expect(payload.cliente_switch_id).toBe(7);
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL VENDEDOR DEL CLON — LAS DOS DIRECCIONES (13-ago-2026)
//
// Daniel: *"al duplicar el pedido el vendedor debe de ser el mismo que el otro
// por default, si lo quiere cambiar que lo cambie despues"*. Un duplicado es el
// MISMO pedido otra vez: la venta sigue siendo de quien la hizo, y quien lo
// duplica puede ser una secretaria que no vende. Las dos direcciones importan y
// las dos están acá:
//   · ORIGINAL CON vendedor → ése, con su nombre — aunque quien duplica tenga
//     mapeo propio en esa empresa.
//   · ORIGINAL SIN vendedor (pedidos viejos, pedidos del link público) → el de
//     quien duplica, con su nombre LITERAL. NUNCA se deja en null a propósito:
//     un clon sin vendedor queda bloqueado al enviarlo a Switch (422
//     SIN_VENDEDOR).
// ─────────────────────────────────────────────────────────────────────────────

/** El mapeo de quien duplica en la empresa de la marca. */
function queueMiVendedor(id: number, nombre: string | null) {
  mainDb.queue("fg_user_switch_vendedor", { data: { vendedor_id: id, vendedor_nombre: nombre } });
}

/** Un original SIN vendedor propio (pedido viejo o del link público). */
function queueOriginalReebokSinVendedor() {
  reebokDb.queue(
    "reebok_orders",
    { data: { id: OID, reemplaza_a: null } },
    { data: null },
    {
      data: {
        id: OID,
        order_number: "PED-100",
        client_name: "Cliente Original",
        vendor_name: "Vend",
        client_email: null,
        comment: null,
        cliente_switch_id: 7,
        vendedor_switch_id: null,
        reebok_order_items: [
          { product_id: P1, sku: "S1", name: "P", image_url: null, quantity: 2, unit_price: 10, is_preorder: false },
        ],
      },
    },
    { data: null, error: null },
  );
  reebokDb.queue("reebok_switch_envios", { data: { estado: "enviado", numero_interno: "N1" } });
  reebokDb.queueRpc({ data: { order_id: NEW_ID, order_number: "PED-202" } });
}

/** El último update sobre reebok_orders (el de trazabilidad). */
function ultimoUpdateReebok(): Record<string, unknown> {
  const chains = reebokDb.chainsFor("reebok_orders");
  return chains[chains.length - 1]._calls.update[0][0] as Record<string, unknown>;
}

describe("POST /orders/[id]/duplicar — el vendedor del clon", () => {
  it("🔴 el clon lleva el vendedor del ORIGINAL, aunque quien duplica tenga el suyo", async () => {
    queueOriginalReebok(); // el original es del vendedor 2, vendor_name "Vend"
    queueMiVendedor(9, "Beto Ruiz"); // quien duplica SÍ tiene mapeo propio

    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "vendedor" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);

    expect(ultimoUpdateReebok().vendedor_switch_id).toBe(2);
    // Y el nombre que se ve en el pedido acompaña al id — si se copiara el de
    // quien duplica, la pantalla diría un vendedor y la comisión iría a otro.
    const [, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_vendor_name).toBe("Vend");
  });

  it("🔴 con el original ya identificado, el mapeo de quien duplica NI SE CONSULTA", async () => {
    queueOriginalReebok();
    queueMiVendedor(9, "Beto Ruiz");

    await rDuplicar(makeReq("/x", { method: "POST", role: "vendedor" }), { params: { id: OID } });

    // No hay nada que resolver: preguntarlo sería una consulta cuyo resultado
    // no se puede usar (y la puerta por la que se colaría el vendedor de otro).
    expect(mainDb.chainsFor("fg_user_switch_vendedor")).toHaveLength(0);
  });

  it("🔴 ORIGINAL SIN vendedor: entra el de quien duplica — nunca queda sin vendedor", async () => {
    queueOriginalReebokSinVendedor();
    queueMiVendedor(9, "Beto Ruiz");

    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "secretaria" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);

    const payload = ultimoUpdateReebok();
    expect(payload.vendedor_switch_id).toBe(9);
    expect(payload.vendedor_switch_id).not.toBeNull();
    const [, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_vendor_name).toBe("Beto Ruiz");
  });

  it("⚠️ el nombre se guarda LITERAL: joystep tiene 'DANIEL LEVY ' CON espacio final y Switch parea contra eso", async () => {
    joybeesDb.queue(
      "joybees_orders",
      { data: { id: OID, reemplaza_a: null } },
      { data: null },
      {
        data: {
          id: OID,
          order_number: "JBP-100",
          client_name: "C",
          vendor_name: "Otro",
          client_email: null,
          comment: null,
          cliente_switch_id: null,
          vendedor_switch_id: null, // sin vendedor propio → entra el del mapeo
          joybees_order_items: [
            { product_id: P1, sku: "S1", name: "P", image_url: null, quantity: 1, unit_price: 5 },
          ],
        },
      },
      { data: null, error: null },
    );
    joybeesDb.queue("joybees_switch_envios", { data: { estado: "enviado", numero_interno: "N2" } });
    joybeesDb.queueRpc({ data: { order_id: NEW_ID, order_number: "JBP-101" } });
    queueMiVendedor(1, "DANIEL LEVY ");

    const res = await jDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);
    const [, args] = joybeesDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_vendor_name).toBe("DANIEL LEVY ");
  });

  it("el mapeo se busca por user_id Y por la empresa de ESA marca (los ids de vendedor son por empresa)", async () => {
    queueOriginalReebokSinVendedor();
    queueMiVendedor(9, "Beto Ruiz");
    await rDuplicar(makeReq("/x", { method: "POST", role: "vendedor" }), { params: { id: OID } });

    const chain = mainDb.chainsFor("fg_user_switch_vendedor")[0];
    expect(chain._calls.eq).toEqual([
      ["user_id", "u-test"],
      ["empresa_key", "active_shoes"], // la empresa Switch de Reebok
    ]);
  });

  it("mapeo sin nombre → cae al nombre de la sesión, NUNCA al del vendedor del original", async () => {
    queueOriginalReebokSinVendedor(); // vendor_name del original: "Vend"
    queueMiVendedor(9, null);

    await rDuplicar(makeReq("/x", { method: "POST", role: "vendedor" }), { params: { id: OID } });

    expect(ultimoUpdateReebok().vendedor_switch_id).toBe(9);
    const [, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_vendor_name).toBe("Tester");
  });

  it("original SIN vendedor y quien duplica SIN mapeo → el clon sale como salía antes (sin la columna)", async () => {
    reebokDb.queue(
      "reebok_orders",
      { data: { id: OID, reemplaza_a: null } },
      { data: null },
      {
        data: {
          id: OID,
          order_number: "PED-100",
          client_name: "Cliente",
          vendor_name: null,
          client_email: null,
          comment: null,
          cliente_switch_id: null,
          vendedor_switch_id: null,
          reebok_order_items: [
            { product_id: P1, sku: "S1", name: "P", image_url: null, quantity: 1, unit_price: 10 },
          ],
        },
      },
      { data: null, error: null },
    );
    reebokDb.queue("reebok_switch_envios", { data: { estado: "enviado", numero_interno: "N1" } });
    reebokDb.queueRpc({ data: { order_id: NEW_ID, order_number: "PED-202" } });

    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);
    // Nada que heredar y nada que asignar: el update no escribe un null encima.
    expect("vendedor_switch_id" in ultimoUpdateReebok()).toBe(false);
  });

  it("el mapeo NO se consulta cuando el duplicado ni siquiera se crea (dedupe)", async () => {
    reebokDb.queue(
      "reebok_orders",
      { data: { id: OID, reemplaza_a: null } },
      { data: { id: NEW_ID, order_number: "PED-201" } }, // reemplazo ya existente
    );
    reebokDb.queue("reebok_switch_envios", { data: { estado: "enviado", numero_interno: "N1" } });
    queueMiVendedor(9, "Beto Ruiz");

    const res = await rDuplicar(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect((await res.json()).yaExistia).toBe(true);
    expect(mainDb.chainsFor("fg_user_switch_vendedor")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL OTRO CAMINO DE DUPLICAR: el botón de la LISTA (POST /orders)
//
// No pasa por `/duplicar` (ése exige un pedido bloqueado por Switch): copia los
// items y crea con `POST /orders`. Es el camino de todos los días —el ícono de
// duplicar de cada fila— y tiene que llevar el MISMO vendedor.
// ─────────────────────────────────────────────────────────────────────────────

const ITEMS_NUEVO = [{ product_id: P1, sku: "S1", name: "N1", quantity: 1, unit_price: 10 }];

/** Cola de la creación (categorías por producto + la RPC que numera). */
function colaCrearReebok() {
  reebokDb.queue("products", { data: [] });
  reebokDb.queueRpc({ data: { order_id: NEW_ID, order_number: "PED-9", already_created: false } });
}

/** Lo que se escribió sobre reebok_orders después de crear. */
function updatesReebok(): Record<string, unknown>[] {
  return reebokDb
    .chainsFor("reebok_orders")
    .flatMap((c) => (c._calls.update || []).map((a: unknown[]) => a[0] as Record<string, unknown>));
}

describe("POST /orders — el vendedor cuando se duplica desde la lista", () => {
  it("🔴 con `duplicar_de`, el pedido nuevo lleva el vendedor del ORIGINAL", async () => {
    colaCrearReebok();
    reebokDb.queue(
      "reebok_orders",
      { data: { vendedor_switch_id: 2, vendor_name: "Vend" } }, // el original
      { data: null, error: null }, // update del vendedor heredado
      { data: { id: NEW_ID, order_number: "PED-9" } }, // respuesta al front
    );
    queueMiVendedor(9, "Beto Ruiz"); // quien duplica tiene otro vendedor

    const res = await rCrear(
      makeReq("/x", {
        method: "POST",
        role: "vendedor",
        body: { client_name: "Otro Cliente", items: ITEMS_NUEVO, vendor_name: "Beto Ruiz", duplicar_de: OID },
      }),
    );
    expect(res.status).toBe(200);

    expect(updatesReebok()).toContainEqual(
      expect.objectContaining({ vendedor_switch_id: 2, vendor_name: "Vend" }),
    );
    // Y el nombre del pedido acompaña al id: el que mandó el navegador (el de
    // quien duplica) NO puede pisar al del vendedor que se hereda.
    const [, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_vendor_name).toBe("Vend");
  });

  it("🔴 el original SIN vendedor → el de quien duplica (nunca queda sin vendedor)", async () => {
    colaCrearReebok();
    reebokDb.queue(
      "reebok_orders",
      { data: { vendedor_switch_id: null, vendor_name: "Vend" } },
      { data: null, error: null },
      { data: { id: NEW_ID, order_number: "PED-9" } },
    );
    queueMiVendedor(9, "Beto Ruiz");

    const res = await rCrear(
      makeReq("/x", {
        method: "POST",
        role: "vendedor",
        body: { client_name: "Otro Cliente", items: ITEMS_NUEVO, duplicar_de: OID },
      }),
    );
    expect(res.status).toBe(200);
    expect(updatesReebok()).toContainEqual(
      expect.objectContaining({ vendedor_switch_id: 9, vendor_name: "Beto Ruiz" }),
    );
  });

  it("un pedido NUEVO (sin `duplicar_de`) no cambia en nada: ni lee un original ni escribe vendedor", async () => {
    colaCrearReebok();
    reebokDb.queue("reebok_orders", { data: { id: NEW_ID, order_number: "PED-9" } });

    const res = await rCrear(
      makeReq("/x", {
        method: "POST",
        role: "vendedor",
        body: { client_name: "Cliente", items: ITEMS_NUEVO, vendor_name: "Angela" },
      }),
    );
    expect(res.status).toBe(200);
    expect(updatesReebok()).toEqual([]);
    const [, args] = reebokDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_vendor_name).toBe("Angela");
    expect(mainDb.chainsFor("fg_user_switch_vendedor")).toHaveLength(0);
  });

  it("si el original no se puede leer, el duplicado se crea igual (no se tumba por el vendedor)", async () => {
    colaCrearReebok();
    reebokDb.queue(
      "reebok_orders",
      { data: null }, // el original no apareció
      { data: { id: NEW_ID, order_number: "PED-9" } },
    );

    const res = await rCrear(
      makeReq("/x", {
        method: "POST",
        role: "vendedor",
        body: { client_name: "Cliente", items: ITEMS_NUEVO, vendor_name: "Angela", duplicar_de: OID },
      }),
    );
    expect(res.status).toBe(200);
    expect(updatesReebok()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UNA SOLA DEFINICIÓN de "cuál es mi vendedor" y de "a nombre de quién queda
//    un duplicado"
//
// El checkout resuelve "mi vendedor" con `vendedorDelUsuario`, y los DOS
// caminos de duplicar —el "Duplicar" de la lista (`POST /orders`) y el
// "Duplicar y corregir" (`POST /duplicar`)— resuelven el vendedor del clon con
// `vendedorParaDuplicado`. Escritas por separado, dos reglas equivalentes se
// separan de verdad con el tiempo, y lo que se decide acá es a quién se le paga
// la comisión.
// ─────────────────────────────────────────────────────────────────────────────
const LEER = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("🔴 candado: una sola resolución del vendedor", () => {
  const ARCHIVOS = {
    duplicar: "src/lib/catalogo/duplicar-pedido.ts",
    checkout: "src/app/api/catalogo/checkout/route.ts",
    orders: "src/app/api/catalogo/[marca]/orders/route.ts",
  } as const;

  it("ninguno consulta fg_user_switch_vendedor por su cuenta", () => {
    for (const [nombre, ruta] of Object.entries(ARCHIVOS)) {
      // Nombrar la tabla en un comentario está bien; consultarla acá NO.
      expect(LEER(ruta).replace(/\/\/.*$/gm, ""), nombre).not.toMatch(/fg_user_switch_vendedor/);
    }
  });

  it("el checkout resuelve MI vendedor con la función compartida", () => {
    expect(LEER(ARCHIVOS.checkout)).toContain("vendedorDelUsuario");
  });

  it("🔴 los DOS caminos de duplicar usan la MISMA regla del vendedor del clon", () => {
    for (const ruta of [ARCHIVOS.duplicar, ARCHIVOS.orders]) {
      expect(LEER(ruta), ruta).toContain("vendedorParaDuplicado");
    }
    // Y ninguno decide por su cuenta qué pasa cuando el original no tiene
    // vendedor: esa rama vive en `vendedor-switch.ts` y en ningún otro lado.
    for (const ruta of [ARCHIVOS.duplicar, ARCHIVOS.orders]) {
      expect(LEER(ruta).replace(/\/\/.*$/gm, ""), ruta).not.toMatch(/vendedor_switch_id\s*!=\s*null\s*\?/);
    }
  });

  it("🔴 el 'Duplicar' de la lista NO acepta el id del vendedor desde el navegador", () => {
    // De ese id depende la COMISIÓN: el servidor lo LEE del pedido original
    // (`duplicar_de`), nunca lo recibe hecho.
    const orders = LEER(ARCHIVOS.orders).replace(/\/\/.*$/gm, "");
    expect(orders).toContain("body.duplicar_de");
    expect(orders).not.toMatch(/body\.vendedor_switch_id|body\.vendedor_id/);
    const lista = LEER("src/components/catalogo/ComprobantesPanel.tsx").replace(/\/\/.*$/gm, "");
    expect(lista).toContain("duplicar_de: pedido.id_natural");
    expect(lista).not.toMatch(/vendedor_switch_id|vendedor_id/);
  });
});
