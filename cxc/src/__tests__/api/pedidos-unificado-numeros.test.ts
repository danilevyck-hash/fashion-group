// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO — la lista unificada trae los DOS números (24-ago-2026)
//
// El número del PROPIO pedido (PED-017) NO vive en la vista unificada: la vista
// expone `id_natural`, que es el uuid. Se lee de la tabla de orders en UNA sola
// query por ids. Y el envío trae, además del número de Switch, QUÉ se mandó
// (`documento`: pedido | cotizacion) — sin eso la pantalla no puede decir si la
// mercancía quedó apartada.
//
// Lo que fija:
//   1. `numero_pedido` sale de la tabla de orders, filtrado por los ids que la
//      vista devolvió (no un barrido de la tabla entera).
//   2. `switch_documento` sale del envío ACTIVO y viaja tal cual.
//   3. 🔴 TOLERANCIA A LA DDL 20260824160000: sin la columna `documento` la
//      lectura se REINTENTA sin ella y todo sale como PEDIDO (lo de siempre).
//      Sin esto la lista se caería entera el día que falte la migración.
//   4. Sin `order_number` la fila sale con null (la pantalla lo dice con
//      palabras) — nunca revienta.
//   5. Las 4 marcas hacen lo mismo.
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
}));
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => new Map<string, string>()),
}));

import type { NextRequest } from "next/server";
import { GET as unificadoGet } from "@/app/api/catalogo/[marca]/pedidos-unificado/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const get = (marca: string) => (req: NextRequest) => unificadoGet(req, { params: { marca } });

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const OID2 = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  tommyDb = makeDb();
  calvinDb = makeDb();
  mainDb = makeDb();
});

function filaVista(id: string, cliente: string) {
  return {
    origen: "mio",
    id_natural: id,
    cliente,
    total: 1,
    created_at: "2026-08-20T10:00:00Z",
    vendor: "Rey",
    items: [{ product_id: null, sku: null, name: "P", image_url: null, quantity: 1, unit_price: 10 }],
    fuente: "orders",
  };
}

describe("1-2. los dos números salen de sus tablas y viajan enteros", () => {
  it("numero_pedido de la tabla de orders + switch_documento del envío", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", { data: [filaVista(OID, "Sporting Shoes"), filaVista(OID2, "A-Amani")] });
    reebokDb.queue("reebok_switch_envios", {
      data: [
        { order_id: OID, numero_interno: "16-000000503", pedido_switch_id: 503, documento: "pedido" },
        { order_id: OID2, numero_interno: "16-000000511", pedido_switch_id: 511, documento: "cotizacion" },
      ],
    });
    reebokDb.queue("reebok_orders", {
      data: [
        { id: OID, order_number: "PED-017" },
        { id: OID2, order_number: "PED-020" },
      ],
    });

    const res = await get("reebok")(makeReq("/x", { role: "admin" }));
    const rows = await res.json();
    expect(rows[0].numero_pedido).toBe("PED-017");
    expect(rows[0].switch_documento).toBe("pedido");
    expect(rows[1].numero_pedido).toBe("PED-020");
    expect(rows[1].switch_documento).toBe("cotizacion");
  });

  it("los order_number se piden POR LOS IDS de la vista, no barriendo la tabla", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", { data: [filaVista(OID, "C")] });
    reebokDb.queue("reebok_switch_envios", { data: [] });
    reebokDb.queue("reebok_orders", { data: [{ id: OID, order_number: "PED-017" }] });

    await get("reebok")(makeReq("/x", { role: "admin" }));
    const chain = reebokDb.chainsFor("reebok_orders")[0];
    expect(chain._calls.in).toContainEqual(["id", [OID]]);
    expect(chain._calls.select[0][0]).toContain("order_number");
  });
});

describe("3. 🔴 tolerancia a la DDL 20260824160000 pendiente", () => {
  it("sin la columna `documento` la lectura se reintenta sin ella y sale como PEDIDO", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", { data: [filaVista(OID, "C")] });
    // 1er intento (con `documento`) falla como falla PostgREST ante una columna
    // que no existe; el 2º, sin ella, responde.
    reebokDb.queue(
      "reebok_switch_envios",
      { data: null, error: { code: "42703", message: 'column "documento" does not exist' } },
      { data: [{ order_id: OID, numero_interno: "16-000000503", pedido_switch_id: 503 }] },
    );
    reebokDb.queue("reebok_orders", { data: [{ id: OID, order_number: "PED-017" }] });

    const res = await get("reebok")(makeReq("/x", { role: "admin" }));
    expect(res.status).toBe(200);
    const rows = await res.json();
    // La lista NO se cae y el número sigue estando.
    expect(rows[0].switch_numero).toBe("16-000000503");
    expect(rows[0].numero_pedido).toBe("PED-017");
    // Sin columna ⇒ pedido, que es lo único que el sistema sabía crear.
    expect(rows[0].switch_documento).toBe("pedido");
    expect(reebokDb.chainsFor("reebok_switch_envios")).toHaveLength(2);
  });
});

describe("4. lo que falta no revienta", () => {
  it("sin order_number la fila sale con null (y la pantalla lo dice con palabras)", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", { data: [filaVista(OID, "C")] });
    reebokDb.queue("reebok_switch_envios", { data: [] });
    reebokDb.queue("reebok_orders", { data: null, error: { message: "boom" } });

    const res = await get("reebok")(makeReq("/x", { role: "admin" }));
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows[0].numero_pedido).toBeNull();
    expect(rows[0].switch_documento).toBeNull();
  });
});

describe("5. las 4 marcas", () => {
  const CASOS = [
    { marca: "reebok", vistaDb: () => mainDb, marcaDb: () => reebokDb, vista: "reebok_pedidos_unificado_vw", envios: "reebok_switch_envios", orders: "reebok_orders", num: "PED-017" },
    { marca: "joybees", vistaDb: () => joybeesDb, marcaDb: () => joybeesDb, vista: "joybees_pedidos_unificado_vw", envios: "joybees_switch_envios", orders: "joybees_orders", num: "JBP-041" },
    { marca: "tommy", vistaDb: () => tommyDb, marcaDb: () => tommyDb, vista: "tommy_pedidos_unificado_vw", envios: "tommy_switch_envios", orders: "tommy_orders", num: "TOM-026" },
    { marca: "calvin", vistaDb: () => calvinDb, marcaDb: () => calvinDb, vista: "calvin_pedidos_unificado_vw", envios: "calvin_switch_envios", orders: "calvin_orders", num: "CKP-005" },
  ];

  for (const c of CASOS) {
    it(`${c.marca}: devuelve numero_pedido y switch_documento`, async () => {
      c.vistaDb().queue(c.vista, { data: [filaVista(OID, "C")] });
      c.marcaDb().queue(c.envios, {
        data: [{ order_id: OID, numero_interno: "16-000000999", pedido_switch_id: 999, documento: "cotizacion" }],
      });
      c.marcaDb().queue(c.orders, { data: [{ id: OID, order_number: c.num }] });

      const res = await get(c.marca)(makeReq("/x", { role: "admin" }));
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(rows[0].numero_pedido).toBe(c.num);
      expect(rows[0].switch_numero).toBe("16-000000999");
      expect(rows[0].switch_documento).toBe("cotizacion");
    });
  }
});
