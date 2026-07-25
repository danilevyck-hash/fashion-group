// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO de la caché del catálogo público (lib/catalogo/cache.ts).
//
// Cachear el catálogo solo es seguro si CADA write path invalida la tag de su
// marca. El historial manda: #244 (Data Cache sirviendo 153 productos cuando la
// DB tenía 139) y #253 (200 en un pedido ya borrado) fueron exactamente esto.
// Aquí se fija lo que hace segura la caché:
//   · la tag es `catalogo:<marca>` y una marca NO invalida a otra
//   · hay TTL de respaldo (si alguien olvida invalidar, lo viejo caduca solo)
//   · el motor de sync invalida al terminar una corrida REAL, y NO en dry-run
//   · guardar una foto (selector de variantes y carga masiva ZIP) invalida
//   · invalidar nunca puede tumbar la escritura que la llamó
//
// Los write paths HTTP (products PUT/POST/PATCH/DELETE) se prueban en
// api/catalogo-paridad-products.test.ts, donde ya vive su arnés.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
  unstable_cache:
    (cb: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      cb(...a),
}));

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

import {
  catalogoTag,
  invalidarCatalogoPublico,
  CATALOGO_PUBLICO_TTL_SEGUNDOS,
} from "@/lib/catalogo/cache";
import { syncCatalogo } from "@/lib/switch-api/sync-catalogo";
import { guardarFotoElegida } from "@/lib/catalogos/variantes-server";

beforeEach(() => {
  vi.clearAllMocks();
  getArticulos.mockResolvedValue({
    articulos: [{ id: "a1", codigo: "SKU1", descripcion: "Men-Sneakers", precio: 49.9, disponible: 8 }],
  });
  getStock.mockResolvedValue({ stock: [{ saldo: 10, disponible: 8 }] });
});

// ── Tag y TTL ────────────────────────────────────────────────────────────────

describe("tag y TTL", () => {
  it("la tag es catalogo:<marca> y es distinta por marca", () => {
    expect(catalogoTag("reebok")).toBe("catalogo:reebok");
    expect(catalogoTag("joybees")).toBe("catalogo:joybees");
    expect(catalogoTag("tommy")).toBe("catalogo:tommy");
    const tags = new Set(["reebok", "joybees", "tommy"].map(catalogoTag));
    expect(tags.size).toBe(3);
  });

  it("hay TTL de respaldo y es corto (entre 5 y 15 min)", () => {
    // Cinturón de seguridad: un punto de invalidación olvidado no puede servir
    // datos viejos para siempre.
    expect(CATALOGO_PUBLICO_TTL_SEGUNDOS).toBeGreaterThanOrEqual(5 * 60);
    expect(CATALOGO_PUBLICO_TTL_SEGUNDOS).toBeLessThanOrEqual(15 * 60);
  });

  it("invalidar una marca no toca las otras", () => {
    invalidarCatalogoPublico("tommy");
    expect(mockRevalidateTag).toHaveBeenCalledTimes(1);
    expect(mockRevalidateTag).toHaveBeenCalledWith("catalogo:tommy");
  });

  it("si revalidateTag falla, NO rompe la escritura que la llamó", () => {
    mockRevalidateTag.mockImplementationOnce(() => {
      throw new Error("Invariant: static generation store missing in revalidateTag");
    });
    expect(() => invalidarCatalogoPublico("reebok")).not.toThrow();
  });
});

// ── Motor de sync (cubre los 3 crons, "Actualizar ahora" y reconciliación) ───

interface Escritura {
  tabla: string;
  op: "update" | "insert";
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
        update: () => {
          escrituras.push({ tabla, op: "update" });
          return chain;
        },
        insert: () => {
          escrituras.push({ tabla, op: "insert" });
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

function syncConfig(db: unknown, marca: "reebok" | "joybees" | "tommy", tabla: string) {
  return {
    marca,
    syncLogType: `catalogo_${marca}`,
    productsTable: tabla,
    db: db as never,
    empresas: [{ empresaKey: "fashion_shoes", categories: [] }] as never,
    articuloFilter: () => true,
    stockFields: (existencia: number, disponibilidad: number) => ({
      existencia,
      disponibilidad,
      stock: existencia,
    }),
  };
}

describe("motor de sync", () => {
  it("una corrida real invalida la tag de SU marca", async () => {
    const { db } = makeDb([]);
    await syncCatalogo(syncConfig(db, "tommy", "tommy_products") as never);
    expect(mockRevalidateTag).toHaveBeenCalledWith("catalogo:tommy");
    expect(mockRevalidateTag).not.toHaveBeenCalledWith("catalogo:reebok");
    expect(mockRevalidateTag).not.toHaveBeenCalledWith("catalogo:joybees");
  });

  it("cada marca invalida la suya", async () => {
    const a = makeDb([]);
    await syncCatalogo(syncConfig(a.db, "reebok", "products") as never);
    expect(mockRevalidateTag).toHaveBeenCalledWith("catalogo:reebok");

    vi.clearAllMocks();
    const b = makeDb([]);
    await syncCatalogo(syncConfig(b.db, "joybees", "joybees_products") as never);
    expect(mockRevalidateTag).toHaveBeenCalledWith("catalogo:joybees");
  });

  it("un dry-run NO invalida (no escribió nada)", async () => {
    const { db, escrituras } = makeDb([]);
    await syncCatalogo(syncConfig(db, "tommy", "tommy_products") as never, { dryRun: true });
    expect(escrituras).toHaveLength(0);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});

// ── Fotos: selector de variantes + carga masiva ZIP ──────────────────────────

describe("guardar la foto elegida", () => {
  function fotoCfg(marca: "reebok" | "tommy", tabla: string, error: { message: string } | null = null) {
    const db = {
      from: () => {
        const chain: Record<string, unknown> = {
          update: () => chain,
          eq: () => chain,
          select: () => chain,
          maybeSingle: async () => ({ data: error ? null : { id: "p1" }, error }),
        };
        return chain;
      },
    };
    return {
      marca,
      productsTable: tabla,
      products: { idField: "sku", writeDb: async () => db as never },
    } as never;
  }

  it("invalida la marca de la foto que se acaba de guardar", async () => {
    await guardarFotoElegida(fotoCfg("tommy", "tommy_products"), "SKU1", "https://x/f.jpg?v=1", true);
    expect(mockRevalidateTag).toHaveBeenCalledWith("catalogo:tommy");
  });

  it("si el guardado falla, NO invalida (no cambió la foto)", async () => {
    await expect(
      guardarFotoElegida(
        fotoCfg("reebok", "products", { message: "boom" }),
        "SKU1",
        "https://x/f.jpg?v=1",
        true,
      ),
    ).rejects.toThrow();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});
