// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO: el sync de catálogo NUNCA pisa la foto de un producto.
//
// Es la garantía que hace real la semántica de `foto_manual` (DDL
// 20260725120000): si alguien eligió la foto a mano en el admin, ninguna
// corrida del cron puede cambiarla. El motor lo consigue OMITIENDO `image_url`
// del UPDATE — este test lo fija para que un refactor no lo reintroduzca por
// accidente (sería invisible: el sync corre solo, 2×/día, sin nadie mirando).
//
// Se ejercita el motor REAL (syncCatalogo) contra un Switch y un Supabase
// simulados, y se inspeccionan los payloads exactos de cada escritura.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const getArticulos = vi.fn();
const getStock = vi.fn();

vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({ getArticulos, getStock }),
}));
vi.mock("@/lib/switch-api/sync-log", () => ({
  createSwitchSyncLog: vi.fn(async () => "log-1"),
  finishSwitchSyncLog: vi.fn(async () => {}),
}));
vi.mock("@/lib/cron-telemetry", () => ({ logCronError: vi.fn(async () => {}) }));

import { syncCatalogo } from "@/lib/switch-api/sync-catalogo";

// ── Supabase simulado: registra los payloads de update/insert ────────────────

interface Escritura {
  tabla: string;
  op: "update" | "insert";
  payload: Record<string, unknown>;
}

function makeDb(existentes: Record<string, unknown>[]) {
  const escrituras: Escritura[] = [];
  const db = {
    from(tabla: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        or: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        update(payload: Record<string, unknown>) {
          escrituras.push({ tabla, op: "update", payload });
          return chain;
        },
        insert(payload: Record<string, unknown>) {
          escrituras.push({ tabla, op: "insert", payload });
          return chain;
        },
        upsert: () => chain,
        single: async () => ({ data: { id: "nuevo-1" }, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then(res: (v: { data: unknown; error: null }) => unknown) {
          return Promise.resolve(res({ data: existentes, error: null }));
        },
      };
      return chain;
    },
  };
  return { db: db as never, escrituras };
}

const ART = {
  id: "a1",
  codigo: "FM0FM04474BDS",
  descripcion: "Men-Sneakers",
  precio: 49.9,
  disponible: 8, // >= 1 → entra al set de /stock aunque no exista en la tabla
};

function config(db: unknown) {
  return {
    syncLogType: "catalogo_test",
    productsTable: "tommy_products",
    db: db as never,
    empresas: [{ empresaKey: "fashion_shoes", categories: [] }] as never,
    articuloFilter: () => true,
    stockFields: (existencia: number, disponibilidad: number) => ({ existencia, disponibilidad, stock: existencia }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getArticulos.mockResolvedValue({ articulos: [ART] });
  // Forma real de /stock: filas por bodega que el motor suma.
  getStock.mockResolvedValue({ stock: [{ saldo: 10, disponible: 8 }] });
});

describe("el sync NUNCA pisa image_url", () => {
  it("el UPDATE de un producto existente NO lleva image_url (con foto elegida a mano)", async () => {
    const { db, escrituras } = makeDb([
      {
        id: "p1",
        sku: "FM0FM04474BDS",
        name: "Men-Sneakers",
        price: 49.9,
        active: true,
        image_url: "https://x/product-images/tommy/_v/fm0fm04474bds/6.jpg?v=1",
        badge: null,
        keep_visible: null,
        oculto_manual: false,
        foto_manual: true,
      },
    ]);

    await syncCatalogo(config(db) as never);

    const updates = escrituras.filter((e) => e.op === "update" && e.tabla === "tommy_products");
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) {
      expect(u.payload).not.toHaveProperty("image_url");
      // category tampoco se pisa (misma garantía histórica).
      expect(u.payload).not.toHaveProperty("category");
    }
  });

  it("tampoco lo lleva cuando la foto la puso el proceso automático (foto_manual=false)", async () => {
    const { db, escrituras } = makeDb([
      {
        id: "p1",
        sku: "FM0FM04474BDS",
        name: "Men-Sneakers",
        price: 10,
        active: true,
        image_url: "https://x/product-images/tommy/_v/fm0fm04474bds/1.jpg",
        badge: null,
        keep_visible: null,
        oculto_manual: false,
        foto_manual: false,
      },
    ]);

    await syncCatalogo(config(db) as never);

    for (const u of escrituras.filter((e) => e.op === "update")) {
      expect(u.payload).not.toHaveProperty("image_url");
    }
  });

  it("un producto NUEVO entra sin foto (image_url null), nunca con una inventada", async () => {
    const { db, escrituras } = makeDb([]);

    await syncCatalogo(config(db) as never);

    const inserts = escrituras.filter((e) => e.op === "insert" && e.tabla === "tommy_products");
    expect(inserts.length).toBe(1);
    expect(inserts[0].payload.image_url).toBeNull();
  });

  it("el sync SÍ sigue actualizando lo suyo (precio, stock, visibilidad)", async () => {
    const { db, escrituras } = makeDb([
      {
        id: "p1", sku: "FM0FM04474BDS", name: "Men-Sneakers", price: 1,
        active: true, image_url: "https://x/foto.jpg", badge: null,
        keep_visible: null, oculto_manual: false, foto_manual: true,
      },
    ]);

    await syncCatalogo(config(db) as never);

    const u = escrituras.find((e) => e.op === "update" && e.tabla === "tommy_products")!;
    expect(u.payload.price).toBe(49.9);
    expect(u.payload.active).toBe(true);
    expect(u.payload.existencia).toBe(10);
  });
});
