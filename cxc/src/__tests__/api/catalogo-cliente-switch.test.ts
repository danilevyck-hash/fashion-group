// ─────────────────────────────────────────────────────────────────────────────
// EL CLIENTE DE SWITCH DEL PEDIDO — candados del servidor (12-ago-2026).
//
// Daniel, textual: *"un vendedor TIENE que elegir un cliente de switch, todos
// siempre no solo vendedor"*. Tres cosas que este archivo sostiene:
//
//  1. 🔴 EL MAPA marca → empresa CUBRE TODAS LAS MARCAS. Era un literal con
//     reebok/joybees/tommy y cuando entró Calvin nadie lo tocó: el checkout de
//     Calvin respondía 400, la lista de clientes salía VACÍA y TODO pedido de
//     Calvin se iba a Contado sin forma de elegir. Ahora se DERIVA de
//     MARCAS_CONFIG y el test exige que la derivación siga siendo derivación.
//  2. El selector está abierto a los roles que ARMAN pedidos (vendedor
//     incluido), no solo a admin+secretaria — con el vendedor afuera, todo lo
//     que él armaba terminaba en Contado.
//  3. POST /orders y POST /duplicar ACEPTAN y PERSISTEN `cliente_switch_id`, y
//     rechazan un id que no sea del directorio de ESA empresa.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: {
    from: (t: string) => reebokDb.from(t),
    rpc: (...a: unknown[]) => reebokDb.rpc(...a),
  },
}));

let calvinDb: MockDb;
vi.mock("@/lib/calvin-supabase-server", () => ({
  calvinServer: {
    from: (t: string) => calvinDb.from(t),
    rpc: (...a: unknown[]) => calvinDb.rpc(...a),
  },
}));

let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
  },
}));

vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(async () => {}) }));
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => new Map<string, string>()),
}));

import type { NextRequest } from "next/server";
import { EMPRESA_POR_MARCA, MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { clienteSwitchRoles } from "@/lib/catalogo/roles";
import { GET as switchClientesGet } from "@/app/api/catalogo/switch-clientes/route";
import {
  GET as marcaClientesGet,
  PATCH as marcaClientesPatch,
} from "@/app/api/catalogo/[marca]/clientes-switch/route";
import { POST as ordersPost } from "@/app/api/catalogo/[marca]/orders/route";
import { handleDuplicarPedido } from "@/lib/catalogo/duplicar-pedido";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  calvinDb = makeDb();
  mainDb = makeDb();
});

// ─── 1. El mapa marca → empresa ──────────────────────────────────────────────

describe("marca → empresa Switch", () => {
  it("🔴 cubre TODAS las marcas de MARCAS_CONFIG (el bug de Calvin no puede volver)", () => {
    for (const cfg of Object.values(MARCAS_CONFIG)) {
      expect(EMPRESA_POR_MARCA[cfg.marca]).toBe(cfg.empresaKey);
    }
    // Y no tiene marcas de más (una entrada huérfana apuntaría a la nada).
    expect(Object.keys(EMPRESA_POR_MARCA).sort()).toEqual(
      Object.values(MARCAS_CONFIG).map((m) => m.marca).sort(),
    );
  });

  it("calvin apunta a vistana — el caso concreto que estaba roto", () => {
    expect(EMPRESA_POR_MARCA.calvin).toBe("vistana");
  });

  it("el mapa se DERIVA, no se escribe a mano (candado estático)", () => {
    const marcas = readFileSync(path.join(process.cwd(), "src/lib/catalogo/marcas.ts"), "utf8");
    expect(marcas).toMatch(/EMPRESA_POR_MARCA[\s\S]{0,200}Object\.values\(MARCAS_CONFIG\)[\s\S]{0,120}empresaKey/);
    // Y el route lo IMPORTA en vez de tener su propio literal — que es
    // exactamente lo que dejó a Calvin afuera.
    const route = readFileSync(
      path.join(process.cwd(), "src/app/api/catalogo/switch-clientes/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/import \{[^}]*EMPRESA_POR_MARCA[^}]*\} from "@\/lib\/catalogo\/marcas"/);
    expect(route).not.toMatch(/reebok:\s*"active_shoes"/);
    expect(route).not.toMatch(/tommy:\s*"fashion_shoes"/);
  });

  it("?marca=calvin devuelve el directorio (200), ya no 400", async () => {
    mainDb.queue("switch_clientes", {
      data: [{ cliente_switch_id: 9, codigo: "D-9", nombre: "Cliente CK" }],
    });
    const res = await switchClientesGet(makeReq("/api/catalogo/switch-clientes?marca=calvin", { role: "vendedor" }));
    expect(res.status).toBe(200);
    expect((await res.json()).clientes).toEqual([{ id: 9, codigo: "D-9", nombre: "Cliente CK" }]);
    // Consultó la empresa correcta.
    const eqArgs = mainDb.chainsFor("switch_clientes")[0]._calls.eq.flat();
    expect(eqArgs).toContain("vistana");
  });

  it("una marca que no existe sigue siendo 400", async () => {
    const res = await switchClientesGet(makeReq("/api/catalogo/switch-clientes?marca=nike", { role: "admin" }));
    expect(res.status).toBe(400);
  });
});

// ─── 2. Roles: el que arma el pedido elige el cliente ────────────────────────

const mGet = (req: NextRequest, marca: string) => marcaClientesGet(req, { params: { marca } });
const mPatch = (req: NextRequest, marca: string) => marcaClientesPatch(req, { params: { marca } });

describe("roles del selector de cliente", () => {
  it("🔴 el VENDEDOR puede listar y asignar (antes 403 → todo se iba a Contado)", async () => {
    mainDb.queue("switch_clientes", { data: [{ cliente_switch_id: 42, codigo: "D-42", nombre: "Sporting" }] });
    const res = await mGet(makeReq("/api/catalogo/reebok/clientes-switch?q=spo", { role: "vendedor" }), "reebok");
    expect(res.status).toBe(200);

    mainDb.queue("switch_clientes", { data: { codigo: "D-42", nombre: "Sporting" } });
    reebokDb.queue("reebok_switch_envios", { data: null });
    reebokDb.queue("reebok_orders", { data: null, error: null });
    const p = await mPatch(
      makeReq("/x", { method: "PATCH", role: "vendedor", body: { orderId: OID, clienteSwitchId: 42 } }),
      "reebok",
    );
    expect(p.status).toBe(200);
    expect(await p.json()).toMatchObject({ ok: true, clienteSwitchId: 42, nombre: "Sporting" });
  });

  it("bodega y contabilidad siguen afuera (no arman pedidos)", async () => {
    for (const role of ["bodega", "contabilidad"]) {
      expect((await mGet(makeReq("/x", { role }), "reebok")).status).toBe(403);
      expect(
        (await mPatch(makeReq("/x", { method: "PATCH", role, body: { orderId: OID } }), "reebok")).status,
      ).toBe(403);
    }
  });

  it("sin sesión no entra nadie (el endpoint nunca queda abierto)", async () => {
    expect((await mGet(makeReq("/x"), "reebok")).status).toBe(401);
    expect((await switchClientesGet(makeReq("/api/catalogo/switch-clientes?marca=calvin"))).status).toBe(401);
  });

  it("el rol 'cliente' legacy de Reebok NO recibe el directorio de la empresa", async () => {
    // Está en createRoles (quirk heredado) pero es el camino del comprador:
    // darle la lista entera de clientes sería una fuga.
    expect(MARCAS_CONFIG.reebok.createRoles).toContain("cliente");
    expect(clienteSwitchRoles(MARCAS_CONFIG.reebok.createRoles)).not.toContain("cliente");
    expect((await mGet(makeReq("/x", { role: "cliente" }), "reebok")).status).toBe(403);
  });

  it("los roles salen de createRoles de la marca, no de una lista suelta", () => {
    for (const cfg of Object.values(MARCAS_CONFIG)) {
      const roles = clienteSwitchRoles(cfg.createRoles);
      expect(roles).toContain("vendedor");
      expect(roles).toContain("admin");
      expect(roles).toContain("secretaria");
    }
  });
});

// ─── 3. El cliente elegido llega al pedido ───────────────────────────────────

const rPost = (req: NextRequest) => ordersPost(req, { params: { marca: "reebok" } });

function colaCrearPedido(db: MockDb) {
  db.queue("products", { data: [] });
  db.queueRpc({ data: { order_id: OID, order_number: "PED-9", already_created: false } });
}

describe("POST /orders — cliente_switch_id", () => {
  const ITEMS = [{ product_id: P1, sku: "S1", name: "N1", quantity: 1, unit_price: 10 }];

  it("guarda el cliente elegido en el pedido recién creado", async () => {
    mainDb.queue("switch_clientes", { data: { codigo: "D-42", nombre: "Sporting" } });
    colaCrearPedido(reebokDb);
    reebokDb.queue("reebok_orders", { data: null, error: null }, { data: { id: OID, order_number: "PED-9" } });

    const res = await rPost(
      makeReq("/x", {
        method: "POST",
        role: "vendedor",
        body: { client_name: "Sporting", items: ITEMS, cliente_switch_id: 42 },
      }),
    );
    expect(res.status).toBe(200);
    const updates = reebokDb
      .chainsFor("reebok_orders")
      .flatMap((c) => (c._calls.update || []).map((a: unknown[]) => a[0]));
    expect(updates).toContainEqual({ cliente_switch_id: 42 });
  });

  it("Contado (null) también se escribe — es una ELECCIÓN, no la ausencia de una", async () => {
    colaCrearPedido(reebokDb);
    reebokDb.queue("reebok_orders", { data: null, error: null }, { data: { id: OID, order_number: "PED-9" } });
    const res = await rPost(
      makeReq("/x", {
        method: "POST",
        role: "vendedor",
        body: { client_name: "Mostrador", items: ITEMS, cliente_switch_id: null },
      }),
    );
    expect(res.status).toBe(200);
    const updates = reebokDb
      .chainsFor("reebok_orders")
      .flatMap((c) => (c._calls.update || []).map((a: unknown[]) => a[0]));
    expect(updates).toContainEqual({ cliente_switch_id: null });
    // Y no se consultó el directorio: Contado no necesita resolverse.
    expect(mainDb.tables()).not.toContain("switch_clientes");
  });

  it("un id que NO está en el directorio de la empresa se rechaza ANTES de crear nada", async () => {
    mainDb.queue("switch_clientes", { data: null });
    const res = await rPost(
      makeReq("/x", {
        method: "POST",
        role: "vendedor",
        body: { client_name: "X", items: ITEMS, cliente_switch_id: 999999 },
      }),
    );
    expect(res.status).toBe(404);
    expect(reebokDb.rpc).not.toHaveBeenCalled();
  });

  it("un id basura es 400 y no crea el pedido", async () => {
    const res = await rPost(
      makeReq("/x", {
        method: "POST",
        role: "vendedor",
        body: { client_name: "X", items: ITEMS, cliente_switch_id: "abc" },
      }),
    );
    expect(res.status).toBe(400);
    expect(reebokDb.rpc).not.toHaveBeenCalled();
  });

  it("sin el campo (POST histórico) el pedido se crea igual y NO se toca la columna", async () => {
    colaCrearPedido(reebokDb);
    reebokDb.queue("reebok_orders", { data: { id: OID, order_number: "PED-9" } });
    const res = await rPost(
      makeReq("/x", { method: "POST", role: "vendedor", body: { client_name: "X", items: ITEMS } }),
    );
    expect(res.status).toBe(200);
    const updates = reebokDb
      .chainsFor("reebok_orders")
      .flatMap((c) => (c._calls.update || []).map((a: unknown[]) => a[0]));
    expect(updates).toEqual([]);
  });
});

// ─── 4. Duplicar: se ELIGE, no se arrastra ───────────────────────────────────

function colaDuplicar(db: MockDb, clienteOriginal: number | null) {
  db.queue("reebok_orders",
    { data: { id: OID, reemplaza_a: null } },            // probe DDL
    { data: null },                                       // reemplazo activo?
    { data: {                                             // original + items
        id: OID, order_number: "PED-1", client_name: "Original", vendor_name: "V",
        client_email: null, comment: null,
        cliente_switch_id: clienteOriginal, vendedor_switch_id: 7,
        reebok_order_items: [{ product_id: P1, sku: "S1", name: "N1", image_url: null, quantity: 1, unit_price: 10 }],
      } },
    { data: null, error: null },                          // update de traza
  );
  db.queue("reebok_switch_envios", { data: { id: "e1", estado: "enviado" } });
  db.queue("products", { data: [] });
  db.queueRpc({ data: { order_id: "44444444-4444-4444-8444-444444444444", order_number: "PED-2" } });
}

function updateDeTraza(db: MockDb): Record<string, unknown> | undefined {
  const updates = db
    .chainsFor("reebok_orders")
    .flatMap((c) => (c._calls.update || []).map((a: unknown[]) => a[0] as Record<string, unknown>));
  return updates.find((u) => "reemplaza_a" in u);
}

describe("POST /duplicar — cliente_switch_id explícito", () => {
  const dup = (body: unknown) =>
    handleDuplicarPedido(makeReq("/x", { method: "POST", role: "vendedor", body }) as NextRequest, "reebok", OID);

  it("la elección MANDA aunque el nombre no cambie (antes se heredaba el viejo)", async () => {
    mainDb.queue("switch_clientes", { data: { codigo: "D-77", nombre: "Otro" } });
    colaDuplicar(reebokDb, 42);
    const res = await dup({ client_name: "Original", cliente_switch_id: 77 });
    expect(res.status).toBe(200);
    expect(updateDeTraza(reebokDb)).toMatchObject({ cliente_switch_id: 77, vendedor_switch_id: 7 });
  });

  it("Contado explícito borra el cliente heredado", async () => {
    colaDuplicar(reebokDb, 42);
    const res = await dup({ client_name: "Original", cliente_switch_id: null });
    expect(res.status).toBe(200);
    expect(updateDeTraza(reebokDb)).toMatchObject({ cliente_switch_id: null });
  });

  it("SIN el campo se CONSERVA la regla vieja: nombre cambiado → no hereda", async () => {
    colaDuplicar(reebokDb, 42);
    const res = await dup({ client_name: "Cliente Nuevo" });
    expect(res.status).toBe(200);
    expect(updateDeTraza(reebokDb)!.cliente_switch_id).toBeUndefined();
  });

  it("SIN el campo y con el mismo nombre se hereda como siempre", async () => {
    colaDuplicar(reebokDb, 42);
    const res = await dup({ client_name: "Original" });
    expect(res.status).toBe(200);
    expect(updateDeTraza(reebokDb)).toMatchObject({ cliente_switch_id: 42 });
  });

  it("el pedido nuevo nace con el NOMBRE del cliente elegido (no con el del viejo)", async () => {
    // Desde el 12-ago-2026 el modal no tiene campo de texto libre: manda el par
    // (nombre del cliente elegido, su id). El original se llama "Original" y el
    // clon tiene que quedar a nombre de "Otro", que es a quien se le eligió.
    mainDb.queue("switch_clientes", { data: { codigo: "D-77", nombre: "Otro" } });
    colaDuplicar(reebokDb, 42);
    const res = await dup({ client_name: "Otro", cliente_switch_id: 77 });
    expect(res.status).toBe(200);
    expect(reebokDb.rpc).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ p_client_name: "Otro" }),
    );
    expect(updateDeTraza(reebokDb)).toMatchObject({ cliente_switch_id: 77 });
  });

  it("un id de otra empresa se rechaza antes de clonar nada", async () => {
    mainDb.queue("switch_clientes", { data: null });
    colaDuplicar(reebokDb, 42);
    const res = await dup({ client_name: "Original", cliente_switch_id: 999999 });
    expect(res.status).toBe(404);
    expect(reebokDb.rpc).not.toHaveBeenCalled();
  });
});

// ─── 5. Lo que NO se toca ────────────────────────────────────────────────────

describe("candados que no se pueden aflojar", () => {
  it("cambiar el cliente de un pedido YA enviado sigue siendo 409", async () => {
    mainDb.queue("switch_clientes", { data: { codigo: "D-42", nombre: "Sporting" } });
    reebokDb.queue("reebok_switch_envios", { data: { id: "e1" } });
    const res = await mPatch(
      makeReq("/x", { method: "PATCH", role: "vendedor", body: { orderId: OID, clienteSwitchId: 42 } }),
      "reebok",
    );
    expect(res.status).toBe(409);
    // Y no escribió nada en el pedido.
    expect(reebokDb.chainsFor("reebok_orders")).toEqual([]);
  });

  it("el candado at-most-once de Switch no se tocó en este cambio", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/catalogo/switch-lock.ts"), "utf8");
    expect(src).toContain("switchLockResponse");
    // El envío sigue exigiendo el pedido confirmado (el front encadena, el
    // server no relajó nada).
    const envio = readFileSync(path.join(process.cwd(), "src/lib/catalogo/enviar-switch-route.ts"), "utf8");
    expect(envio).toContain('"confirmado"');
  });
});
