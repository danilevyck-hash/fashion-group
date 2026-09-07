// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DE COMPROBANTES DICE EL MISMO TOTAL QUE LA PANTALLA (6-sep-2026)
//
// 🩸 EL DEFECTO. El botón «Descargar Excel» de Comprobantes calculaba el total
// SIN las piezas por bulto del estilo, así que todo lo marcado en 8 se cobraba
// como si fuera de 12. La pantalla sí las leía. Medido contra producción, seis
// pedidos de Tommy salían inflados — **$1.516,00 de más**:
//
//   TOM-020  10.408,00 → 11.088,00      TOM-018  7.548,00 → 7.764,00
//   TOM-032   4.480,00 →  4.704,00      TOM-001  1.472,00 → 1.584,00
//   TOM-024   3.100,00 →  3.324,00      TOM-016  1.020,00 → 1.080,00
//
// Es la MISMA familia del caso TOM-003: la multiplicación por el bulto se
// arregla en una superficie y sigue viva en la de al lado. Por eso lo que este
// archivo fija NO es "el Excel ahora suma bien", sino que **las dos superficies
// llaman a la MISMA función** y que ninguna puede volver a armar el total por
// su cuenta.
//
// El caso que se congela es TOM-001, tal como está en producción:
//   2 estilos sin marcar × $52 × 12  +  1 estilo de 8 × $28  =  $1.472,00
//   (con el bulto por defecto en los tres daba $1.584,00 — el defecto)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import XLSX from "xlsx-js-style";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let tommyDb: MockDb;
vi.mock("@/lib/tommy-supabase-server", () => ({
  tommyServer: { from: (t: string) => tommyDb.from(t), rpc: (...a: unknown[]) => tommyDb.rpc(...a) },
}));
let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: { from: (t: string) => joybeesDb.from(t), rpc: (...a: unknown[]) => joybeesDb.rpc(...a) },
}));
let calvinDb: MockDb;
vi.mock("@/lib/calvin-supabase-server", () => ({
  calvinServer: { from: (t: string) => calvinDb.from(t), rpc: (...a: unknown[]) => calvinDb.rpc(...a) },
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
import { POST as exportPost } from "@/app/api/catalogo/[marca]/pedidos-export/route";
import { GET as ordersGet } from "@/app/api/catalogo/[marca]/orders/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const exportar = (marca: string) => (req: NextRequest) => exportPost(req, { params: { marca } });
const listar = (marca: string) => (req: NextRequest) => ordersGet(req, { params: { marca } });

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const RUTA_EXCEL = "src/app/api/catalogo/[marca]/pedidos-export/route.ts";
const RUTA_PANTALLA = "src/app/api/catalogo/[marca]/orders/route.ts";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

// TOM-001 tal cual está en producción.
const OID = "d49837d2-5095-442a-8077-c1267d5c362e";
const P_12A = "146c96a2-3497-4b93-a8f6-beb801e274bc"; // sin marcar → 12
const P_12B = "93a62bac-5a3d-4079-a0dc-7bb2845f7432"; // sin marcar → 12
const P_8 = "046d9bc4-98d4-4406-a1ad-6acb3ccbb754"; // marcado en 8

const ITEMS_TOM001 = [
  { product_id: P_12A, sku: "FW0FW091080GH", name: "A", image_url: null, quantity: 1, unit_price: 52 },
  { product_id: P_12B, sku: "FW0FW091080GG", name: "B", image_url: null, quantity: 1, unit_price: 52 },
  { product_id: P_8, sku: "FM0FM05530YBS", name: "C", image_url: null, quantity: 1, unit_price: 28 },
];
const PRODUCTOS_TOM001 = [
  { id: P_12A, category: null, bulto_pzas: null },
  { id: P_12B, category: null, bulto_pzas: null },
  { id: P_8, category: null, bulto_pzas: 8 },
];

const TOTAL_BUENO = 1472; // 52×12 + 52×12 + 28×8
const TOTAL_DEL_DEFECTO = 1584; // los tres en 12

beforeEach(() => {
  vi.clearAllMocks();
  tommyDb = makeDb();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  calvinDb = makeDb();
  mainDb = makeDb();
  categoryMap = new Map();
});

/** El archivo de VERDAD: se abre el .xlsx que devuelve la ruta y se lee la celda. */
async function totalDelExcel(res: Response): Promise<number> {
  expect(res.status).toBe(200);
  const buf = Buffer.from(await res.arrayBuffer());
  expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  const ws = XLSX.read(buf, { type: "buffer" }).Sheets["Pedidos"];
  // Encabezados en la fila 1; la columna «Total» es la quinta.
  expect(ws[XLSX.utils.encode_cell({ r: 0, c: 4 })].v).toBe("Total");
  return Number(ws[XLSX.utils.encode_cell({ r: 1, c: 4 })].v);
}

function prepararTommy() {
  tommyDb.queue("tommy_pedidos_unificado_vw", {
    data: [
      {
        origen: "mio",
        id_natural: OID,
        cliente: "Contado",
        vendor: "Rey",
        created_at: "2026-08-06T15:41:10Z",
        items: ITEMS_TOM001,
        fuente: "orders",
      },
    ],
  });
  tommyDb.queue("tommy_orders", {
    data: [
      {
        id: OID,
        order_number: "TOM-001",
        client_name: "Contado",
        vendor_name: "Rey",
        client_email: null,
        comment: null,
        total: TOTAL_DEL_DEFECTO, // el guardado, que la pantalla NO usa
        created_at: "2026-08-06T15:41:10Z",
        updated_at: "2026-08-06T15:41:10Z",
        idempotency_key: null,
        status: "confirmado",
        tommy_order_items: ITEMS_TOM001,
      },
    ],
  });
  tommyDb.queue("tommy_products", { data: PRODUCTOS_TOM001 });
}

describe("🔴 TOM-001: el Excel deja de cobrar el estilo de 8 como si fuera de 12", () => {
  it("el Excel dice $1.472,00, no los $1.584,00 del defecto", async () => {
    prepararTommy();
    const total = await totalDelExcel(await exportar("tommy")(makeReq("/x", { method: "POST", role: "admin" })));
    expect(total).toBe(TOTAL_BUENO);
    expect(total).not.toBe(TOTAL_DEL_DEFECTO);
  });

  it("la pantalla dice lo mismo — y NO el total guardado", async () => {
    prepararTommy();
    const res = await listar("tommy")(makeReq("/x", { role: "admin" }));
    expect(res.status).toBe(200);
    const filas = await res.json();
    expect(filas[0].total).toBe(TOTAL_BUENO);
  });

  it("🔴 el Excel y la pantalla dan el MISMO número con los MISMOS datos", async () => {
    prepararTommy();
    const delExcel = await totalDelExcel(
      await exportar("tommy")(makeReq("/x", { method: "POST", role: "admin" })),
    );
    prepararTommy();
    const dePantalla = (await (await listar("tommy")(makeReq("/x", { role: "admin" }))).json())[0].total;
    expect(delExcel).toBe(dePantalla);
  });

  it("el Excel lee las piezas por bulto de la tabla de PRODUCTOS de la marca", async () => {
    prepararTommy();
    await exportar("tommy")(makeReq("/x", { method: "POST", role: "admin" }));
    expect(tommyDb.tables()).toContain("tommy_products");
  });

  it("⚠️ sin la columna `bulto_pzas` (DDL pendiente) el Excel sale con el default, no se cae", async () => {
    tommyDb.queue("tommy_pedidos_unificado_vw", {
      data: [
        {
          origen: "mio",
          id_natural: OID,
          cliente: "Contado",
          vendor: null,
          created_at: "2026-08-06T15:41:10Z",
          items: ITEMS_TOM001,
          fuente: "orders",
        },
      ],
    });
    tommyDb.queue(
      "tommy_products",
      { data: null, error: { message: 'column "bulto_pzas" does not exist' } },
      { data: PRODUCTOS_TOM001.map(({ id, category }) => ({ id, category })) },
    );
    const total = await totalDelExcel(await exportar("tommy")(makeReq("/x", { method: "POST", role: "admin" })));
    expect(total).toBe(TOTAL_DEL_DEFECTO); // todo en 12: el comportamiento de antes
  });
});

describe("🔴 las otras tres marcas no cambian", () => {
  it("reebok: footwear sigue en 12 y apparel en 6", async () => {
    const P1 = "11111111-1111-4111-8111-111111111111";
    const P2 = "22222222-2222-4222-8222-222222222222";
    categoryMap = new Map([[P1, "footwear"], [P2, "apparel"]]);
    mainDb.queue("reebok_pedidos_unificado_vw", {
      data: [
        {
          origen: "mio",
          id_natural: OID,
          cliente: "C",
          vendor: null,
          created_at: "2026-08-20T10:00:00Z",
          items: [
            { product_id: P1, quantity: 2, unit_price: 10 },
            { product_id: P2, quantity: 1, unit_price: 5 },
          ],
          fuente: "orders",
        },
      ],
    });
    const total = await totalDelExcel(await exportar("reebok")(makeReq("/x", { method: "POST", role: "admin" })));
    expect(total).toBe(2 * 12 * 10 + 1 * 6 * 5); // 270
  });

  it("joybees: todo en 12", async () => {
    joybeesDb.queue("joybees_pedidos_unificado_vw", {
      data: [
        {
          origen: "link",
          id_natural: "abc12345",
          cliente: "C",
          vendor: null,
          created_at: "2026-08-20T10:00:00Z",
          items: [{ product_id: null, quantity: 2, unit_price: 10 }],
          fuente: "publicos",
        },
      ],
    });
    expect(
      await totalDelExcel(await exportar("joybees")(makeReq("/x", { method: "POST", role: "admin" }))),
    ).toBe(240);
  });

  it("calvin: el bulto por estilo también llega al Excel", async () => {
    const P = "55555555-5555-4555-8555-555555555555";
    calvinDb.queue("calvin_pedidos_unificado_vw", {
      data: [
        {
          origen: "mio",
          id_natural: OID,
          cliente: "C",
          vendor: null,
          created_at: "2026-08-20T10:00:00Z",
          items: [{ product_id: P, quantity: 1, unit_price: 20 }],
          fuente: "orders",
        },
      ],
    });
    calvinDb.queue("calvin_products", { data: [{ id: P, category: null, bulto_pzas: 8 }] });
    expect(
      await totalDelExcel(await exportar("calvin")(makeReq("/x", { method: "POST", role: "admin" }))),
    ).toBe(160); // 1×8×20, no 1×12×20
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL CANDADO QUE SOSTIENE TODO LO DE ARRIBA: una sola fórmula, no dos.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 una sola fuente para el total de la lista", () => {
  it("el Excel y la pantalla llaman a las MISMAS dos funciones", () => {
    for (const ruta of [RUTA_EXCEL, RUTA_PANTALLA]) {
      const src = leer(ruta);
      expect(src, ruta).toContain('from "@/lib/catalogo/totales-lista"');
      expect(src, ruta).toContain("contextoDeLineas(");
    }
    expect(leer(RUTA_EXCEL)).toContain("totalDeLaLista(");
    expect(leer(RUTA_PANTALLA)).toContain("totalDeLaLista(");
  });

  it("ninguna de las dos arma el total por su cuenta con `calcTotal`", () => {
    // Era exactamente el defecto: `cfg.calcTotal` no recibe las piezas por bulto
    // si quien llama no se las busca, y el Excel no se las buscaba.
    for (const ruta of [RUTA_EXCEL, RUTA_PANTALLA]) {
      expect(leer(ruta), ruta).not.toContain("calcTotal");
    }
  });

  it("ninguna de las dos arma su propio contexto de líneas", () => {
    // Copiar el objeto `{ bultoSize, categoryByProduct, bultoPzasByProduct }` es
    // cómo se separan otra vez las dos superficies.
    for (const ruta of [RUTA_EXCEL, RUTA_PANTALLA]) {
      expect(leer(ruta), ruta).not.toContain("bultoPzasByProduct");
      expect(leer(ruta), ruta).not.toContain("cfg.bultoSize");
    }
  });

  it("la función compartida sí lee categoría y piezas juntas", () => {
    const src = leer("src/lib/catalogo/totales-lista.ts");
    expect(src).toContain("leerCategoriaYBulto");
    expect(src).toContain("resumirDesdeItems");
  });

  it("⚠️ el barrido mira archivos de verdad (si no, pasaría en verde vacío)", () => {
    for (const ruta of [RUTA_EXCEL, RUTA_PANTALLA, "src/lib/catalogo/totales-lista.ts"]) {
      expect(leer(ruta).length, ruta).toBeGreaterThan(500);
    }
  });
});
