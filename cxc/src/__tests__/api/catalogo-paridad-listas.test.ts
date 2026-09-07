// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de pedidos-export.
// (`pedidos-unificado` se retiró el 6-sep-2026 — ver la nota más abajo.)
//
//   · roles admin/secretaria (vendedor 403)
//   · total SIEMPRE re-calculado desde items (nunca el guardado de la vista)
//   · fuente: passthrough de la vista, con fallback origen link→publicos
//   · switch_numero: números de envíos ACTIVOS (enviado/verificado, criterio
//     del candado #236/#237)
//   · export: Excel con Content-Type XLSX y filename por marca
//
// Topología actual: la vista reebok vive en el proyecto PRINCIPAL y los envíos
// en el proyecto Reebok; en joybees todo vive en su client (fallback al
// principal). El refactor debe respetarla.
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

// PR-1: rutas dinámicas [marca] — un solo handler por endpoint; los wrappers
// inyectan la marca del segmento (mismas aserciones que el arnés de PR-0).
import type { NextRequest } from "next/server";
import { POST as exportPost } from "@/app/api/catalogo/[marca]/pedidos-export/route";
const rExport = (req: NextRequest) => exportPost(req, { params: { marca: "reebok" } });
const jExport = (req: NextRequest) => exportPost(req, { params: { marca: "joybees" } });
import { XLSX_MIME } from "@/lib/excel-export";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  mainDb = makeDb();
  categoryMap = new Map();
});

// ⚠️ EL BLOQUE `GET /pedidos-unificado` SE RETIRÓ CON SU RUTA (6-sep-2026).
// La lista de administrar que esa ruta alimentaba se reemplazó el 25-ago-2026
// por `/catalogo/<marca>/pedidos`, y desde entonces la ruta no tenía un solo
// llamador desde `src/` — además de calcular mal la plata (hasta $680 en un
// pedido: no pasaba las piezas por el bulto). Quien impide que vuelva es
// `src/__tests__/lib/rutas-de-catalogo-retiradas.test.ts`. El bloque de
// `pedidos-export` de abajo NO se tocó: esa ruta sigue viva.

describe("POST /pedidos-export — Excel de la lista unificada", () => {
  it("401 sin sesión, 403 vendedor — ambas marcas", async () => {
    for (const post of [rExport, jExport]) {
      expect((await post(makeReq("/x", { method: "POST" }))).status).toBe(401);
      expect((await post(makeReq("/x", { method: "POST", role: "vendedor" }))).status).toBe(403);
    }
  });

  it("reebok: XLSX con filename pedidos-reebok", async () => {
    mainDb.queue("reebok_pedidos_unificado_vw", {
      data: [
        {
          origen: "mio",
          cliente: "C",
          vendor: null,
          created_at: "2026-07-20T10:00:00Z",
          items: [{ product_id: P1, quantity: 1, unit_price: 10 }],
        },
      ],
    });
    const res = await rExport(makeReq("/x", { method: "POST", role: "admin" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(XLSX_MIME);
    expect(res.headers.get("content-disposition")).toContain("pedidos-reebok");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(500);
  });

  it("joybees: XLSX con filename pedidos-joybees", async () => {
    joybeesDb.queue("joybees_pedidos_unificado_vw", {
      data: [
        {
          origen: "link",
          cliente: "C",
          vendor: null,
          created_at: "2026-07-20T10:00:00Z",
          items: [{ quantity: 1, unit_price: 10 }],
        },
      ],
    });
    const res = await jExport(makeReq("/x", { method: "POST", role: "secretaria" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(XLSX_MIME);
    expect(res.headers.get("content-disposition")).toContain("pedidos-joybees");
  });
});
