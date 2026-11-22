// Candado (Daniel, 22-nov-2026): la «Llegada reciente» le llega SOLO al admin.
// Los demás roles internos (secretaria, vendedor, bodega) ni reciben el dato:
// los vendedores a veces muestran su pantalla al cliente.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let anonDb: MockDb;
vi.mock("@/components/reebok/supabase", () => ({ supabase: { from: (t: string) => anonDb.from(t) } }));
let mainDb: MockDb;
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: (t: string) => mainDb.from(t) }) }));
vi.mock("@/lib/catalogo/bulto-renglon-reebok", () => ({ bultoEnRenglon: async () => false, productoConBulto: (p: unknown) => p }));
const marcar = vi.fn(async (_e: string, ps: { sku?: unknown }[]) => ps.map((p) => ({ ...p, nuevo: true })));
vi.mock("@/lib/catalogo/distintivo-nuevo", () => ({ conDistintivoNuevo: (e: string, ps: { sku?: unknown }[]) => marcar(e, ps) }));

import { GET } from "@/app/api/catalogo/[marca]/products/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => { process.env.SESSION_SECRET = TEST_SECRET; });
beforeEach(() => { marcar.mockClear(); anonDb = makeDb(); mainDb = makeDb(); });

const pedir = async (marca: string, tabla: string, db: () => MockDb, role: string) => {
  db().queue(tabla, { data: [{ id: "1", sku: "100262404" }] });
  const r = await GET(makeReq(`/api/catalogo/${marca}/products`, { role }), { params: { marca } });
  expect(r.status).toBe(200);
  return (await r.json()) as Record<string, unknown>[];
};

describe("«Llegada reciente» solo para el admin, decidido en el servidor", () => {
  it("admin la recibe (Reebok y una marca agrupada)", async () => {
    expect((await pedir("reebok", "products", () => anonDb, "admin"))[0].nuevo).toBe(true);
    expect((await pedir("joybees", "joybees_products", () => mainDb, "admin"))[0].nuevo).toBe(true);
  });

  for (const role of ["secretaria", "vendedor", "bodega"]) {
    it(`${role}: el dato ni llega`, async () => {
      const [p] = await pedir("reebok", "products", () => anonDb, role);
      expect("nuevo" in p).toBe(false);
      const [q] = await pedir("tommy", "tommy_products", () => mainDb, role);
      expect("nuevo" in q).toBe(false);
      expect(marcar).not.toHaveBeenCalled();
    });
  }
});
