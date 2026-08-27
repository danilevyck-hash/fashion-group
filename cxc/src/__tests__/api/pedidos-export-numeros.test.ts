// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO — el Excel de Pedidos lleva los DOS números (25-ago-2026)
//
// La pantalla los muestra desde el #593 y el Excel que se baja de ESA MISMA
// lista no los llevaba: para cruzar contra Switch había que volver a la
// pantalla. Este archivo NO mira un objeto en memoria: agarra el buffer que la
// ruta devuelve de verdad, lo abre como un .xlsx y lee las celdas.
//
// Lo que fija:
//   1. Las dos columnas existen, AL FINAL, y las 6 de siempre no se movieron.
//   2. El que no salió DICE que no salió ("No se ha mandado a Switch"), no "—".
//   3. La columna de Switch nombra si fue pedido o COTIZACIÓN.
//   4. 🔴 TOLERANCIA a la DDL 20260824160000: sin la columna `documento` el
//      Excel sale igual y todo se lee como PEDIDO.
//   5. Si la vista no diera `id_natural`/`fuente`, el libro sale como salía
//      antes — SIN las dos columnas. Escribir "No se ha mandado a Switch" en
//      todas las filas sin haberlo mirado sería una mentira en una planilla.
//   6. Las 4 marcas hacen lo mismo (Joybees es espejo exacto de Reebok).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import XLSX from "xlsx-js-style";
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
import { POST as exportPost } from "@/app/api/catalogo/[marca]/pedidos-export/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const post = (marca: string) => (req: NextRequest) => exportPost(req, { params: { marca } });

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

function filaVista(id: string, cliente: string, fuente: "orders" | "publicos" = "orders") {
  return {
    origen: fuente === "publicos" ? "link" : "mio",
    id_natural: id,
    cliente,
    total: 10,
    created_at: "2026-08-20T10:00:00Z",
    vendor: "Rey",
    items: [{ product_id: null, quantity: 1, unit_price: 10 }],
    fuente,
  };
}

const A = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
const HDR_ROW = 0; // los encabezados abren el archivo (27-ago-2026)
const DATA_ROW = 1;

/**
 * 🔴 EL ARCHIVO DE VERDAD. Se toma el body de la respuesta, se abre como .xlsx
 * y se leen las celdas. Un test que mire el workbook en memoria no prueba que
 * el archivo salga bien.
 */
async function hojaDeLaRespuesta(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
  const buf = Buffer.from(await res.arrayBuffer());
  // Firma de un .zip (todo .xlsx lo es): si esto no es "PK", no hay archivo.
  expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  const wb = XLSX.read(buf, { type: "buffer" });
  expect(wb.SheetNames).toEqual(["Pedidos"]);
  return wb.Sheets["Pedidos"];
}

describe("1-3. las dos columnas nuevas, al final, con las palabras de la pantalla", () => {
  it("🔴 el que salió y el que no, cada uno con su texto", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", {
      data: [filaVista(OID, "Sporting Shoes"), filaVista(OID2, "A-Amani")],
    });
    reebokDb.queue("reebok_switch_envios", {
      data: [{ order_id: OID2, numero_interno: "16-000000506", pedido_switch_id: 506, documento: "cotizacion" }],
    });
    reebokDb.queue("reebok_orders", {
      data: [{ id: OID, order_number: "PED-017" }, { id: OID2, order_number: "PED-018" }],
    });

    const ws = await hojaDeLaRespuesta(await post("reebok")(makeReq("/x", { role: "admin" })));

    // Las 6 de siempre, donde estaban.
    expect(["Origen", "Cliente", "Vendedor", "Items", "Total", "Fecha"].map((_, c) => ws[A(HDR_ROW, c)].v))
      .toEqual(["Origen", "Cliente", "Vendedor", "Items", "Total", "Fecha"]);
    // Y las dos nuevas, AL FINAL.
    expect(ws[A(HDR_ROW, 6)].v).toBe("N° pedido");
    expect(ws[A(HDR_ROW, 7)].v).toBe("Switch");
    expect(ws[A(HDR_ROW, 8)]).toBeUndefined();

    // El que NO salió lo dice con palabras, no con un guion.
    expect(ws[A(DATA_ROW, 6)].v).toBe("PED-017");
    expect(ws[A(DATA_ROW, 7)].v).toBe("No se ha mandado a Switch");
    // El que salió dice CUÁL de las dos fue.
    expect(ws[A(DATA_ROW + 1, 6)].v).toBe("PED-018");
    expect(ws[A(DATA_ROW + 1, 7)].v).toBe("Cotización en Switch: 16-000000506");
  });

  it("el pedido del LINK sin convertir dice «Se numera al abrirlo»", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", { data: [filaVista(OID, "Nathalie", "publicos")] });
    const ws = await hojaDeLaRespuesta(await post("reebok")(makeReq("/x", { role: "admin" })));
    expect(ws[A(DATA_ROW, 6)].v).toBe("Se numera al abrirlo");
    expect(ws[A(DATA_ROW, 7)].v).toBe("No se ha mandado a Switch");
    // Y no se le pidió envío a nadie: una fila del link no puede tener uno.
    expect(reebokDb.chainsFor("reebok_switch_envios")).toHaveLength(0);
  });

  it("los números se piden POR LOS IDS de la vista, no barriendo la tabla", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", { data: [filaVista(OID, "C")] });
    reebokDb.queue("reebok_switch_envios", { data: [] });
    reebokDb.queue("reebok_orders", { data: [{ id: OID, order_number: "PED-017" }] });

    await post("reebok")(makeReq("/x", { role: "admin" }));
    expect(reebokDb.chainsFor("reebok_orders")[0]._calls.in).toContainEqual(["id", [OID]]);
    expect(reebokDb.chainsFor("reebok_switch_envios")[0]._calls.in).toContainEqual(["order_id", [OID]]);
  });
});

describe("4. 🔴 tolerancia a la DDL 20260824160000 pendiente", () => {
  it("sin la columna `documento` el Excel sale igual y se lee como PEDIDO", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", { data: [filaVista(OID, "C")] });
    reebokDb.queue(
      "reebok_switch_envios",
      { data: null, error: { code: "42703", message: 'column "documento" does not exist' } },
      { data: [{ order_id: OID, numero_interno: "16-000000503", pedido_switch_id: 503 }] },
    );
    reebokDb.queue("reebok_orders", { data: [{ id: OID, order_number: "PED-017" }] });

    const ws = await hojaDeLaRespuesta(await post("reebok")(makeReq("/x", { role: "admin" })));
    expect(ws[A(DATA_ROW, 7)].v).toBe("Pedido en Switch: 16-000000503");
    expect(reebokDb.chainsFor("reebok_switch_envios")).toHaveLength(2);
  });
});

describe("5. 🔴 sin los datos, NO se inventa: el libro sale como salía antes", () => {
  it("si la vista no da id_natural/fuente, el Excel vuelve a sus 6 columnas", async () => {
    mainDb.queue(
      "reebok_pedidos_unificado_vw",
      { data: null, error: { code: "42703", message: 'column "id_natural" does not exist' } },
      { data: [{ origen: "mio", cliente: "C", vendor: "Rey", items: [{ product_id: null, quantity: 1, unit_price: 10 }], created_at: "2026-08-20T10:00:00Z" }] },
    );

    const ws = await hojaDeLaRespuesta(await post("reebok")(makeReq("/x", { role: "admin" })));
    expect(ws[A(HDR_ROW, 5)].v).toBe("Fecha");
    // NADA en la columna 6: mejor sin columna que con una mentira.
    expect(ws[A(HDR_ROW, 6)]).toBeUndefined();
    // Y no se le preguntó a la tabla de envíos por ids que no se tienen.
    expect(reebokDb.chainsFor("reebok_switch_envios")).toHaveLength(0);
  });
});

describe("6. las 4 marcas", () => {
  const CASOS = [
    { marca: "reebok", vistaDb: () => mainDb, marcaDb: () => reebokDb, vista: "reebok_pedidos_unificado_vw", envios: "reebok_switch_envios", orders: "reebok_orders", num: "PED-017" },
    { marca: "joybees", vistaDb: () => joybeesDb, marcaDb: () => joybeesDb, vista: "joybees_pedidos_unificado_vw", envios: "joybees_switch_envios", orders: "joybees_orders", num: "JBP-041" },
    { marca: "tommy", vistaDb: () => tommyDb, marcaDb: () => tommyDb, vista: "tommy_pedidos_unificado_vw", envios: "tommy_switch_envios", orders: "tommy_orders", num: "TOM-026" },
    { marca: "calvin", vistaDb: () => calvinDb, marcaDb: () => calvinDb, vista: "calvin_pedidos_unificado_vw", envios: "calvin_switch_envios", orders: "calvin_orders", num: "CKP-005" },
  ];

  for (const c of CASOS) {
    it(`${c.marca}: el Excel trae los dos números y nombra la cotización`, async () => {
      c.vistaDb().queue(c.vista, { data: [filaVista(OID, "C")] });
      c.marcaDb().queue(c.envios, {
        data: [{ order_id: OID, numero_interno: "16-000000999", pedido_switch_id: 999, documento: "cotizacion" }],
      });
      c.marcaDb().queue(c.orders, { data: [{ id: OID, order_number: c.num }] });

      const ws = await hojaDeLaRespuesta(await post(c.marca)(makeReq("/x", { role: "admin" })));
      expect(ws[A(HDR_ROW, 6)].v).toBe("N° pedido");
      expect(ws[A(DATA_ROW, 6)].v).toBe(c.num);
      expect(ws[A(DATA_ROW, 7)].v).toBe("Cotización en Switch: 16-000000999");
    });
  }
});
