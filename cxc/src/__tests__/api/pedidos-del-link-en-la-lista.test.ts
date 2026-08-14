// ─────────────────────────────────────────────────────────────────────────────
// EL VENDEDOR VE LOS PEDIDOS QUE LE LLEGAN POR SU PROPIO LINK (14-ago-2026)
//
// Daniel, textual: *"si yo mando el link al público quiero que el que lo use
// pueda hacer su pedido, mandar al vendedor el pedido con nombre… así cuando
// alguien interno le llega el pedido por WhatsApp, pueda entrar al sistema
// interno"*.
//
// 🩸 EL AGUJERO, medido contra producción (`scripts/_diag-pedidos-link.ts`,
// solo lectura, 14-ago-2026): los pedidos del link solo se veían en el panel de
// admin/secretaria (`pedidos-unificado`, que responde 403 al vendedor), así que
// **el vendedor que comparte el link y recibe el WhatsApp no lo encontraba en
// el sistema**. Había 7 pedidos públicos vivos sin convertir —5 de Reebok y 2
// de Joybees— invisibles para él.
//
// Contrato que fija este archivo, en las dos marcas del arnés:
//   · GET /orders devuelve TAMBIÉN los pedidos del link SIN convertir, con
//     `fuente: "publicos"`, `del_link: true`, `en_switch: false` y SIN número
//     (todavía no tiene: se lo pone la conversión),
//   · un pedido del link YA convertido —que vive en <marca>_orders— también
//     sale marcado `del_link: true`,
//   · los ya convertidos y los borrados NO se repiten,
//   · el total se RECALCULA con la fórmula de la marca, nunca el guardado,
//   · FAIL-OPEN: si la tabla de públicos no responde, la lista sale con los
//     pedidos internos de siempre.
//
// 🔴 CANDADOS DE CONDUCTA: se llama al handler REAL y se lee el JSON. Que el
// archivo mencione `publicosTable` no prueba que la fila salga en la respuesta
// — en este repo ya hubo un `return` que calculaba algo y lo tiraba a la basura
// sin que ningún barrido se pusiera rojo.
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

import type { NextRequest } from "next/server";
import { GET as ordersGet } from "@/app/api/catalogo/[marca]/orders/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const rOrders = (req: NextRequest) => ordersGet(req, { params: { marca: "reebok" } });
const jOrders = (req: NextRequest) => ordersGet(req, { params: { marca: "joybees" } });

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const P1 = "11111111-1111-4111-8111-111111111111";

/** Fila interna de <marca>_orders, con la relación de items embebida. */
function ordenInterna(itemsRelation: string, extra: Record<string, unknown> = {}) {
  return {
    id: OID,
    order_number: "PED-021",
    client_name: "Cliente interno",
    vendor_name: "Rey",
    status: "borrador",
    created_at: "2026-08-01T12:00:00Z",
    origen_short_id: null,
    [itemsRelation]: [{ id: "i1", product_id: P1, quantity: 2, unit_price: 10 }],
    ...extra,
  };
}

/** Fila de <marca>_pedidos_publicos tal como la escribe el link. */
function filaPublica(extra: Record<string, unknown> = {}) {
  return {
    short_id: "ab12cd34",
    cliente_nombre: "Nathalie",
    items: [{ product_id: P1, sku: "S1", name: "P", quantity: 3, unit_price: 10 }],
    created_at: "2026-08-10T12:00:00Z",
    convertida: false,
    deleted: false,
    confirmado_cliente_at: "2026-08-10T12:05:00Z",
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  mainDb = makeDb();
  categoryMap = new Map();
});

type Fila = Record<string, unknown>;

describe("GET /orders — los pedidos del LINK entran a la lista del vendedor", () => {
  it("🔴 reebok: la fila pública sin convertir sale con fuente 'publicos', chip del link y sin número", async () => {
    categoryMap = new Map([[P1, "footwear"]]);
    reebokDb.queue("reebok_orders", { data: [ordenInterna("reebok_order_items")] });
    // Los públicos de Reebok viven en el proyecto PRINCIPAL (quirk heredado).
    mainDb.queue("reebok_pedidos_publicos", { data: [filaPublica()] });

    const res = await rOrders(makeReq("/x", { role: "vendedor" }));
    expect(res.status).toBe(200);
    const filas = (await res.json()) as Fila[];
    expect(filas).toHaveLength(2);

    const delLink = filas.find((f) => f.fuente === "publicos")!;
    expect(delLink).toBeTruthy();
    // El id ES el short_id: con él se convierte, no se abre un detalle que
    // todavía no existe.
    expect(delLink.id).toBe("ab12cd34");
    expect(delLink.order_number).toBeNull();
    expect(delLink.client_name).toBe("Nathalie");
    expect(delLink.del_link).toBe(true);
    // Sin envío no puede estar en la pestaña "Pedidos a Switch".
    expect(delLink.en_switch).toBe(false);
    expect(delLink.switch_numero).toBeNull();
    expect(delLink.item_count).toBe(1);
    // 3 bultos × 12 (footwear) × $10 = $360, con la fórmula de la marca.
    expect(delLink.total).toBe(360);

    const interna = filas.find((f) => f.fuente === "orders")!;
    expect(interna.order_number).toBe("PED-021");
    expect(interna.del_link).toBe(false);
  });

  it("🔴 joybees: mismo contrato (los públicos viven en el client de la marca)", async () => {
    joybeesDb.queue("joybees_orders", { data: [ordenInterna("joybees_order_items")] });
    joybeesDb.queue("joybees_pedidos_publicos", { data: [filaPublica()] });

    const filas = (await (await jOrders(makeReq("/x", { role: "vendedor" }))).json()) as Fila[];
    const delLink = filas.find((f) => f.fuente === "publicos")!;
    expect(delLink.del_link).toBe(true);
    expect(delLink.order_number).toBeNull();
    expect(delLink.en_switch).toBe(false);
    // Joybees es bulto 12 fijo: 3 × 12 × $10.
    expect(delLink.total).toBe(360);
  });

  it("🔴 un pedido del link YA CONVERTIDO sale marcado del_link (y no se repite)", async () => {
    reebokDb.queue("reebok_orders", {
      data: [ordenInterna("reebok_order_items", { origen_short_id: "ab12cd34", client_name: "Nathalie" })],
    });
    // La misma fila pública, ya convertida → NO debe volver a aparecer.
    mainDb.queue("reebok_pedidos_publicos", {
      data: [filaPublica({ convertida: true, ped_order_number: "PED-021" })],
    });

    const filas = (await (await rOrders(makeReq("/x", { role: "vendedor" }))).json()) as Fila[];
    expect(filas).toHaveLength(1);
    expect(filas[0].fuente).toBe("orders");
    expect(filas[0].del_link).toBe(true);
    expect(filas[0].order_number).toBe("PED-021");
  });

  it("un pedido del link BORRADO no aparece", async () => {
    reebokDb.queue("reebok_orders", { data: [] });
    mainDb.queue("reebok_pedidos_publicos", { data: [filaPublica({ deleted: true })] });
    const filas = (await (await rOrders(makeReq("/x", { role: "vendedor" }))).json()) as Fila[];
    expect(filas).toHaveLength(0);
  });

  it("sin nombre escrito, la fila lo dice — no queda en blanco", async () => {
    reebokDb.queue("reebok_orders", { data: [] });
    mainDb.queue("reebok_pedidos_publicos", { data: [filaPublica({ cliente_nombre: null })] });
    const filas = (await (await rOrders(makeReq("/x", { role: "vendedor" }))).json()) as Fila[];
    expect(filas[0].client_name).toBe("Sin nombre");
  });

  it("🔴 FAIL-OPEN: si la tabla de públicos no responde, la lista sale igual que antes", async () => {
    reebokDb.queue("reebok_orders", { data: [ordenInterna("reebok_order_items")] });
    mainDb.queue("reebok_pedidos_publicos", { data: null, error: { message: "down" } });
    const res = await rOrders(makeReq("/x", { role: "vendedor" }));
    expect(res.status).toBe(200);
    const filas = (await res.json()) as Fila[];
    expect(filas).toHaveLength(1);
    expect(filas[0].order_number).toBe("PED-021");
  });

  it("la lista viene ordenada por fecha, lo más nuevo arriba", async () => {
    reebokDb.queue("reebok_orders", {
      data: [
        ordenInterna("reebok_order_items", { id: "o-nuevo", order_number: "PED-030", created_at: "2026-08-12T12:00:00Z" }),
        ordenInterna("reebok_order_items", { id: "o-viejo", order_number: "PED-001", created_at: "2026-05-01T12:00:00Z" }),
      ],
    });
    mainDb.queue("reebok_pedidos_publicos", { data: [filaPublica()] }); // 10-ago
    const filas = (await (await rOrders(makeReq("/x", { role: "vendedor" }))).json()) as Fila[];
    expect(filas.map((f) => f.order_number ?? f.id)).toEqual(["PED-030", "ab12cd34", "PED-001"]);
  });

  it("🔴 BODEGA no ve la lista de pedidos (403), ni la del link ni la interna", async () => {
    for (const get of [rOrders, jOrders]) {
      expect((await get(makeReq("/x", { role: "bodega" }))).status).toBe(403);
    }
  });
});
