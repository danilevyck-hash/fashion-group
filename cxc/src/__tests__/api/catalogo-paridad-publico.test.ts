// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO del flujo PÚBLICO (sin sesión):
//   POST /pedido-publico            (crear pedido del link, re-preciado server)
//   GET  /pedido-publico/[id]       (link compartible, estado_cliente)
//   POST /pedido-publico/[id]/confirmar (auto-conversión idempotente + stock)
//
// Comportamiento clave que el refactor debe preservar:
//   · NADA del body se confía: precio y (en Reebok) category se reemplazan por
//     los de la DB; product_id desconocido → 400
//   · short_id de 8 chars base36
//   · rate-limit por IP fail-open (429 solo cuando el conteo real lo dice)
//   · GET 404 si no existe o está soft-deleted; nunca expone `deleted`
//   · confirmar: idempotente; SIN 409 de stock (25-jul-2026: se quitó el modal
//     y el aceptar_stock) — confirma directo y devuelve la FOTO del stock
//     (`stock`) con la cantidad REAL; Telegram SOLO en conversión real
//
// Topología de DB ACTUAL (fijada a propósito): las tablas *_pedidos_publicos
// viven en el proyecto PRINCIPAL (client creado con createClient en el route);
// products/inventory viven en el client de cada marca.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

// Client PRINCIPAL creado a nivel de módulo en los routes públicos vía
// createClient(...) → se intercepta el paquete entero.
let mainDb: MockDb;
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
  }),
}));

// supabaseServer (GET reebok + confirmar reebok) delega en el mismo mainDb.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
  },
}));

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
  shortError: (m: string) => m,
}));

// Envío al ERP: aquí solo interesa QUE se dispare y con qué cliente/vendedor.
// El motor tiene sus propios tests (catalogo-paridad-enviar-switch).
const mockEnviar = vi.fn(async () => ({ kind: "ok" as const, numeroInterno: "16-000000999", pedidoSwitchId: 1, verificado: true, warnings: [] }));
vi.mock("@/lib/catalogo/switch-envio", () => ({
  enviarPedidoSwitch: (...a: unknown[]) => mockEnviar(...(a as [])),
}));
const mockLogout = vi.fn(async () => {});
vi.mock("@/lib/switch-api/client", () => ({
  logoutAllSwitchSessions: () => mockLogout(),
  createSwitchClient: () => ({}),
}));

let categoryMap = new Map<string, string>();
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => categoryMap),
}));

// PR-1: rutas dinámicas [marca] — un solo handler por endpoint; los wrappers
// inyectan la marca del segmento (mismas aserciones que el arnés de PR-0).
import type { NextRequest } from "next/server";
import { POST as pubPost } from "@/app/api/catalogo/[marca]/pedido-publico/route";
import { GET as pubGet } from "@/app/api/catalogo/[marca]/pedido-publico/[id]/route";
import { POST as confirmarPost } from "@/app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route";
type IdCtx = { params: { id: string } };
const rPubPost = (req: NextRequest) => pubPost(req, { params: { marca: "reebok" } });
const jPubPost = (req: NextRequest) => pubPost(req, { params: { marca: "joybees" } });
const rPubGet = (req: NextRequest, ctx: IdCtx) => pubGet(req, { params: { marca: "reebok", ...ctx.params } });
const jPubGet = (req: NextRequest, ctx: IdCtx) => pubGet(req, { params: { marca: "joybees", ...ctx.params } });
const rConfirmar = (req: NextRequest, ctx: IdCtx) => confirmarPost(req, { params: { marca: "reebok", ...ctx.params } });
const jConfirmar = (req: NextRequest, ctx: IdCtx) => confirmarPost(req, { params: { marca: "joybees", ...ctx.params } });
import { makeReq } from "../helpers/catalogo-request";

const P1 = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const P2 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mainDb = makeDb();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  categoryMap = new Map();
  mockEnviar.mockResolvedValue({
    kind: "ok", numeroInterno: "16-000000999", pedidoSwitchId: 1, verificado: true, warnings: [],
  });
});

/** Deja listo lo que necesita el envío a Switch del pedido del link: la fila
 *  del pedido recién numerado y los ids REALES de cliente/vendedor (contado
 *  TCKCTA + vendedor DEFAULT) que resuelve publico-switch-actor. */
function seedEnvio(marcaDb: MockDb, ordersTable: string, orderNumber: string) {
  marcaDb.queue(ordersTable, { data: { id: ORDER_ID, order_number: orderNumber } });
  marcaDb.queue(`${ordersTable.replace("_orders", "")}_order_items`, {
    data: [{ product_id: P1, sku: "S1", name: "P", quantity: 2, unit_price: 10 }],
  });
  mainDb.queue("switch_clientes", { data: { cliente_switch_id: 1, nombre: "Contado" } });
  mainDb.queue("vendedores", { data: { switch_id: 3, nombre: "DEFAULT" } });
}

// ─── POST /pedido-publico ────────────────────────────────────────────────────

describe("POST /pedido-publico — crear pedido del link (público)", () => {
  const validItems = [{ product_id: P1, name: "Producto", quantity: 2, unit_price: 10 }];

  it("400 con body inválido (sin items / nombre corto) — ambas marcas", async () => {
    for (const post of [rPubPost, jPubPost]) {
      expect(
        (await post(makeReq("/x", { method: "POST", body: { cliente_nombre: "AB", items: [] } })))
          .status,
      ).toBe(400);
      expect(
        (
          await post(
            makeReq("/x", { method: "POST", body: { cliente_nombre: "A", items: validItems } }),
          )
        ).status,
      ).toBe(400);
    }
  });

  it("reebok: RE-PRECIADO server-side — precio y category del cliente se ignoran; short_id 8 chars base36", async () => {
    // El cliente manda precio manipulado 0.01 y category apparel (bulto 6);
    // la DB dice price=25 y footwear (bulto 12) → total 2×12×25 = 600.
    reebokDb.queue("products", { data: [{ id: P1, price: 25, category: "footwear" }] });
    mainDb.queue("reebok_pedidos_publicos", { data: null, error: null });

    const res = await rPubPost(
      makeReq("/x", {
        method: "POST",
        body: {
          cliente_nombre: "Cliente Real",
          items: [{ product_id: P1, name: "P", quantity: 2, unit_price: 0.01, category: "apparel" }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const { short_id } = await res.json();
    expect(short_id).toMatch(/^[0-9a-z]{8}$/);

    const insert = mainDb.chainsFor("reebok_pedidos_publicos")[0]._calls.insert[0][0] as Record<
      string,
      unknown
    >;
    expect(insert.total).toBe(600);
    expect(insert.cliente_nombre).toBe("Cliente Real");
    const items = insert.items as Array<Record<string, unknown>>;
    expect(items[0].unit_price).toBe(25);
    expect(items[0].category).toBe("footwear");
    expect(insert.short_id).toBe(short_id);
  });

  it("joybees: re-preciado con bulto 12 fijo (sin category)", async () => {
    joybeesDb.queue("joybees_products", { data: [{ id: P1, price: 8 }] });
    mainDb.queue("joybees_pedidos_publicos", { data: null, error: null });

    const res = await jPubPost(
      makeReq("/x", {
        method: "POST",
        body: {
          cliente_nombre: "Cliente",
          items: [{ product_id: P1, name: "P", quantity: 3, unit_price: 1 }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const insert = mainDb.chainsFor("joybees_pedidos_publicos")[0]._calls.insert[0][0] as Record<
      string,
      unknown
    >;
    expect(insert.total).toBe(288); // 3×12×8
    expect((insert.items as Array<Record<string, unknown>>)[0].unit_price).toBe(8);
  });

  it("400 si el product_id no existe en la DB (carrito forjado) — ambas marcas", async () => {
    reebokDb.queue("products", { data: [] });
    joybeesDb.queue("joybees_products", { data: [] });
    for (const post of [rPubPost, jPubPost]) {
      const res = await post(
        makeReq("/x", { method: "POST", body: { cliente_nombre: "Cliente", items: validItems } }),
      );
      expect(res.status).toBe(400);
    }
  });

  it("rate-limit por IP: 5+ pedidos en la ventana → 429 sin insertar (reebok)", async () => {
    // 1ª query a la tabla = conteo por ip_hash → count 5 alcanza el máximo.
    mainDb.queue("reebok_pedidos_publicos", { data: null, error: null, count: 5 });
    const res = await rPubPost(
      makeReq("/x", {
        method: "POST",
        body: { cliente_nombre: "Spammer", items: validItems },
        headers: { "x-forwarded-for": "1.2.3.4" },
      }),
    );
    expect(res.status).toBe(429);
    const chains = mainDb.chainsFor("reebok_pedidos_publicos");
    expect(chains).toHaveLength(1); // solo el conteo — nunca insertó
    expect(chains[0]._calls.insert).toBeUndefined();
  });

  it("rate-limit FAIL-OPEN: error del conteo (columna ip_hash ausente) deja pasar sin ip_hash", async () => {
    reebokDb.queue("products", { data: [{ id: P1, price: 10, category: "footwear" }] });
    mainDb.queue(
      "reebok_pedidos_publicos",
      { data: null, error: { message: "column ip_hash does not exist" } },
      { data: null, error: null },
    );
    const res = await rPubPost(
      makeReq("/x", {
        method: "POST",
        body: { cliente_nombre: "Cliente", items: validItems },
        headers: { "x-forwarded-for": "1.2.3.4" },
      }),
    );
    expect(res.status).toBe(200);
    const insert = mainDb.chainsFor("reebok_pedidos_publicos")[1]._calls.insert[0][0] as Record<
      string,
      unknown
    >;
    expect("ip_hash" in insert).toBe(false);
  });
});

// ─── GET /pedido-publico/[id] ────────────────────────────────────────────────

describe("GET /pedido-publico/[id] — link compartible", () => {
  const baseRow = {
    short_id: "abc12345",
    cliente_nombre: "Cliente",
    items: [],
    total: 100,
    convertida: false,
    convertida_at: null,
    ped_order_number: null,
    created_at: "2026-07-20T10:00:00Z",
    id: "row-1",
    deleted: false,
    confirmado_cliente_at: null,
  };

  it("404 si no existe — ambas marcas", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: null });
    const rRes = await rPubGet(makeReq("/x"), { params: { id: "nope" } });
    expect(rRes.status).toBe(404);

    joybeesDb.queue("joybees_pedidos_publicos", { data: null });
    const jRes = await jPubGet(makeReq("/x"), { params: { id: "nope" } });
    expect(jRes.status).toBe(404);
  });

  it("404 si está soft-deleted (el link muere al borrar) — ambas marcas", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: { ...baseRow, deleted: true } });
    expect((await rPubGet(makeReq("/x"), { params: { id: "abc12345" } })).status).toBe(404);

    joybeesDb.queue("joybees_pedidos_publicos", { data: { ...baseRow, deleted: true } });
    expect((await jPubGet(makeReq("/x"), { params: { id: "abc12345" } })).status).toBe(404);
  });

  it("200: shape público SIN la columna deleted; sin convertir → estado_cliente null", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: { ...baseRow } });
    const res = await rPubGet(makeReq("/x"), { params: { id: "abc12345" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.short_id).toBe("abc12345");
    expect(json.estado_cliente).toBeNull();
    expect(json.confirmado_cliente_at).toBeNull();
    expect("deleted" in json).toBe(false);
  });

  it("convertida + pedido en borrador → 'Confirmado'; pedido avanzado → 'En proceso' (reebok)", async () => {
    mainDb.queue("reebok_pedidos_publicos", {
      data: { ...baseRow, convertida: true, ped_order_number: "PED-020" },
    });
    mainDb.queue("reebok_orders", { data: { status: "borrador" } });
    let json = await (await rPubGet(makeReq("/x"), { params: { id: "abc12345" } })).json();
    expect(json.estado_cliente).toBe("Confirmado");

    // 'confirmado' es el estado con el que ENTRA un pedido del link (lo pone la
    // confirmación pública antes de mandarlo a Switch): para el cliente sigue
    // siendo "Confirmado". Solo un estado más avanzado dice "En proceso".
    mainDb.queue("reebok_pedidos_publicos", {
      data: { ...baseRow, convertida: true, ped_order_number: "PED-020" },
    });
    mainDb.queue("reebok_orders", { data: { status: "confirmado" } });
    json = await (await rPubGet(makeReq("/x"), { params: { id: "abc12345" } })).json();
    expect(json.estado_cliente).toBe("Confirmado");

    mainDb.queue("reebok_pedidos_publicos", {
      data: { ...baseRow, convertida: true, ped_order_number: "PED-020" },
    });
    mainDb.queue("reebok_orders", { data: { status: "enviado" } });
    json = await (await rPubGet(makeReq("/x"), { params: { id: "abc12345" } })).json();
    expect(json.estado_cliente).toBe("En proceso");
  });

  it("joybees espejo: convertida en borrador → 'Confirmado' (lee joybees_orders del client de marca)", async () => {
    joybeesDb.queue("joybees_pedidos_publicos", {
      data: { ...baseRow, convertida: true, ped_order_number: "JBP-020" },
    });
    joybeesDb.queue("joybees_orders", { data: { status: "borrador" } });
    const json = await (await jPubGet(makeReq("/x"), { params: { id: "abc12345" } })).json();
    expect(json.estado_cliente).toBe("Confirmado");
  });
});

// ─── POST /pedido-publico/[id]/confirmar ─────────────────────────────────────

describe("POST /pedido-publico/[id]/confirmar — auto-conversión del cliente", () => {
  const pedidoRow = (extra: Record<string, unknown> = {}) => ({
    short_id: "abc12345",
    cliente_nombre: "Cliente",
    convertida: false,
    ped_order_number: null,
    deleted: false,
    items: [
      { product_id: P1, sku: "S1", name: "P", quantity: 2, unit_price: 10, category: "footwear" },
    ],
    ...extra,
  });

  it("404 si el pedido no existe o está borrado — ambas marcas", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: null });
    expect((await rConfirmar(makeReq("/x", { method: "POST", body: {} }), { params: { id: "z" } })).status).toBe(404);

    joybeesDb.queue("joybees_pedidos_publicos", { data: pedidoRow({ deleted: true }) });
    expect((await jConfirmar(makeReq("/x", { method: "POST", body: {} }), { params: { id: "z" } })).status).toBe(404);
  });

  it("reebok: stock corto CONFIRMA IGUAL (sin modal) y guarda la cantidad REAL", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: pedidoRow() }, { data: null, error: null });
    // Necesita 2 bultos × 12 = 24 piezas; inventory solo tiene 8.
    reebokDb.queue("inventory", { data: [{ product_id: P1, quantity: 8 }] });
    categoryMap = new Map([[P1, "footwear"]]);
    mainDb.queueRpc({ data: { order_number: "PED-050", already_converted: false } });
    seedEnvio(reebokDb, "reebok_orders", "PED-050");

    const res = await rConfirmar(makeReq("/x", { method: "POST", body: {} }), {
      params: { id: "abc12345" },
    });
    expect(res.status).toBe(200); // NO 409: el modal se eliminó
    const json = await res.json();
    expect(json).toMatchObject({ numero: "PED-050", estado: "confirmado", ya_confirmado: false });
    expect(json.stock).toHaveLength(1);
    expect(json.stock[0]).toMatchObject({ pedido_pzas: 24, disponible_pzas: 8, bulto_pzas: 12 });

    // La foto queda GUARDADA con el pedido (stock_confirmacion), no recalculada.
    const updates = mainDb
      .chainsFor("reebok_pedidos_publicos")
      .flatMap((c) => (c._calls.update || []) as unknown[][]);
    const patch = updates[0]?.[0] as Record<string, unknown>;
    expect(patch).toHaveProperty("confirmado_cliente_at");
    expect((patch.stock_confirmacion as unknown[])[0]).toMatchObject({ disponible_pzas: 8 });

    const [rpcName, args] = mainDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("convert_reebok_pedido_publico");
    expect(args.p_short_id).toBe("abc12345");
    expect(args.p_total).toBe(240); // 2×12×10 server-side
    // 2 avisos: la confirmación + el aviso de piezas faltantes al equipo.
    expect(mockTelegram).toHaveBeenCalledTimes(2);
    expect(String(mockTelegram.mock.calls[0][0])).toContain("PED-050");
    expect(String(mockTelegram.mock.calls[1][0])).toContain("pidió 2 bultos, hay 8 pzas");
  });

  it("reebok: con stock suficiente confirma directo", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: pedidoRow() }, { data: null, error: null });
    reebokDb.queue("inventory", { data: [{ product_id: P1, quantity: 24 }] });
    categoryMap = new Map([[P1, "footwear"]]);
    mainDb.queueRpc({ data: { order_number: "PED-051", already_converted: false } });
    const res = await rConfirmar(makeReq("/x", { method: "POST", body: {} }), {
      params: { id: "abc12345" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).numero).toBe("PED-051");
  });

  it("idempotente: ya convertido devuelve el número existente, ya_confirmado=true, SIN RPC ni Telegram", async () => {
    mainDb.queue("reebok_pedidos_publicos", {
      data: pedidoRow({ convertida: true, ped_order_number: "PED-040" }),
    });
    seedEnvio(reebokDb, "reebok_orders", "PED-040");
    const res = await rConfirmar(makeReq("/x", { method: "POST", body: {} }), {
      params: { id: "abc12345" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      numero: "PED-040",
      estado: "confirmado",
      ya_confirmado: true,
      stock: [],
    });
    expect(mainDb.rpc).not.toHaveBeenCalled();
    expect(mockTelegram).not.toHaveBeenCalled();
    // …pero el envío al ERP SÍ se reintenta: es idempotente aguas abajo, así se
    // recupera solo un pedido que se convirtió y nunca llegó a Switch.
    expect(mockEnviar).toHaveBeenCalledOnce();
  });

  it("fail-open de stock: si inventory no responde, confirma sin aviso (reebok)", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: pedidoRow() }, { data: null, error: null });
    reebokDb.queue("inventory", { data: null, error: { message: "down" } });
    categoryMap = new Map([[P1, "footwear"]]);
    mainDb.queueRpc({ data: { order_number: "PED-052", already_converted: false } });
    const res = await rConfirmar(makeReq("/x", { method: "POST", body: {} }), {
      params: { id: "abc12345" },
    });
    expect(res.status).toBe(200);
  });

  it("joybees: stock desde joybees_products.stock, bulto 12; RPC convert_joybees_pedido_publico", async () => {
    const row = pedidoRow();
    joybeesDb.queue("joybees_pedidos_publicos", { data: row }, { data: null, error: null });
    // 2 bultos × 12 = 24 piezas, stock 30 → sin aviso.
    joybeesDb.queue("joybees_products", { data: [{ id: P1, stock: 30 }] });
    joybeesDb.queueRpc({ data: { order_number: "JBP-050", already_converted: false } });

    const res = await jConfirmar(makeReq("/x", { method: "POST", body: {} }), {
      params: { id: "abc12345" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).numero).toBe("JBP-050");
    const [rpcName, args] = joybeesDb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("convert_joybees_pedido_publico");
    expect(args.p_total).toBe(240); // 2×12×10
    expect(String(mockTelegram.mock.calls[0][0])).toContain("JBP-050");
  });

  it("joybees: stock corto confirma igual y devuelve la cantidad REAL (espejo de Reebok)", async () => {
    joybeesDb.queue("joybees_pedidos_publicos", { data: pedidoRow() }, { data: null, error: null });
    joybeesDb.queue("joybees_products", { data: [{ id: P1, stock: 3 }] });
    joybeesDb.queueRpc({ data: { order_number: "JBP-051", already_converted: false } });
    const res = await jConfirmar(makeReq("/x", { method: "POST", body: {} }), {
      params: { id: "abc12345" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.numero).toBe("JBP-051");
    expect(json.stock[0]).toMatchObject({ pedido_pzas: 24, disponible_pzas: 3, bulto_pzas: 12 });
  });

  it("500 amigable si la RPC de conversión falla (reebok)", async () => {
    mainDb.queue("reebok_pedidos_publicos", { data: pedidoRow() }, { data: null, error: null });
    reebokDb.queue("inventory", { data: [{ product_id: P1, quantity: 100 }] });
    categoryMap = new Map([[P1, "footwear"]]);
    mainDb.queueRpc({ data: null, error: { message: "rpc down" } });
    const res = await rConfirmar(makeReq("/x", { method: "POST", body: {} }), {
      params: { id: "abc12345" },
    });
    expect(res.status).toBe(500);
  });
});
