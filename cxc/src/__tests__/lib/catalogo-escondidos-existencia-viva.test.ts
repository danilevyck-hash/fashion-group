// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA EXISTENCIA DE UN PRODUCTO ESCONDIDO NO SE CONGELA (6-sep-2026)
//
// 🩸 QUÉ PASABA. Esconder un producto a mano (`oculto_manual = true`) le pone
// `active = false`. El motor armaba el conjunto de artículos a los que le
// pregunta la existencia a Switch como «está ACTIVO ∪ Switch dice disponible
// ≥ 1», así que un escondido SIN disponible en Switch **no caía en ninguna de
// las dos**: nunca se le volvía a preguntar y su existencia quedaba congelada
// en el número del día que se escondió.
//
// MEDIDO CONTRA PRODUCCIÓN el 6-sep-2026, cruzando cada escondido contra
// `switch_articulo_info`:
//
//   marca     escondidos   el catálogo dice   Switch dice
//   Tommy         16             252              72
//   Calvin         6             121              49
//   Reebok         1              90              90   (coincide hoy)
//   Joybees        2               2               2   (coincide hoy)
//   ───────────────────────────────────────────────────
//   TOTAL         25             465             213
//
// 🔴 ESCONDER SIGUE SIENDO ESCONDER. Preguntar la existencia NO puede volver a
// mostrar nada: la visibilidad la decide `esVisibleEnCatalogo`, donde
// `oculto_manual = true` gana SIEMPRE. Este candado lo exige en las DOS
// direcciones: que al escondido se le PREGUNTE el número, y que siga saliendo
// con `active: false` aunque Switch le mande existencia de sobra.
//
// Se ejercita el motor REAL (`syncCatalogo`) contra un Switch y un Supabase
// simulados; se miran los `/stock` que se pidieron y los payloads escritos.
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

interface Escritura {
  tabla: string;
  op: "update" | "insert";
  payload: Record<string, unknown>;
  id: string | null;
}

/** Supabase simulado: devuelve `existentes` en cada lectura y anota cada
 *  escritura junto con el id al que se le aplicó (`.eq("id", …)`). */
function makeDb(existentes: Record<string, unknown>[]) {
  const escrituras: Escritura[] = [];
  const db = {
    from(tabla: string) {
      let pendiente: { op: "update" | "insert"; payload: Record<string, unknown> } | null = null;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          if (pendiente && col === "id") {
            escrituras.push({ tabla, ...pendiente, id: String(val) });
            pendiente = null;
          }
          return chain;
        },
        in: () => chain,
        or: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        update(payload: Record<string, unknown>) {
          pendiente = { op: "update", payload };
          return chain;
        },
        insert(payload: Record<string, unknown>) {
          escrituras.push({ tabla, op: "insert", payload, id: null });
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

/** Cuatro artículos de Switch, uno por situación. Ninguno tiene `disponible`
 *  salvo el que lo necesita, para que el conjunto se decida por el catálogo. */
const ARTS = [
  { id: "a-esc", codigo: "ESCONDIDO", descripcion: "Escondido a mano", precio: 20, disponible: 0 },
  { id: "a-act", codigo: "ACTIVO", descripcion: "Activo", precio: 30, disponible: 0 },
  { id: "a-dis", codigo: "DISPONIBLE", descripcion: "Con disponible", precio: 40, disponible: 5 },
  { id: "a-off", codigo: "APAGADO", descripcion: "Apagado por existencia 0", precio: 50, disponible: 0 },
];

function fila(extra: Record<string, unknown>) {
  return {
    name: "n",
    price: 1,
    image_url: null,
    badge: null,
    keep_visible: null,
    stock: 999,
    existencia: 999,
    disponibilidad: 999,
    ...extra,
  };
}

/** El catálogo tal como está en producción: un escondido a mano (apagado), un
 *  activo, uno que Switch marca disponible y uno apagado SIN el toggle puesto
 *  (se apagó solo porque llegó a existencia 0). */
const CATALOGO = [
  fila({ id: "p-esc", sku: "ESCONDIDO", active: false, oculto_manual: true }),
  fila({ id: "p-act", sku: "ACTIVO", active: true, oculto_manual: false }),
  fila({ id: "p-dis", sku: "DISPONIBLE", active: false, oculto_manual: false }),
  fila({ id: "p-off", sku: "APAGADO", active: false, oculto_manual: false }),
];

function config(db: unknown) {
  return {
    marca: "tommy" as const,
    syncLogType: "catalogo_test",
    productsTable: "tommy_products",
    db: db as never,
    empresas: [{ empresaKey: "fashion_shoes", categories: [] }] as never,
    articuloFilter: () => true,
    stockFields: (existencia: number, disponibilidad: number) => ({ existencia, disponibilidad, stock: existencia }),
    columnasEscritas: ["existencia", "disponibilidad", "stock"],
  };
}

/** Los códigos a los que se les preguntó la existencia. */
function preguntados(): string[] {
  return getStock.mock.calls
    .map((c) => ARTS.find((a) => a.id === c[0])?.codigo ?? String(c[0]))
    .sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  getArticulos.mockImplementation(async ({ paginaActual }: { paginaActual: number }) => ({
    articulos: paginaActual === 1 ? ARTS : [],
  }));
  // Switch dice que hay 7 piezas de todo — de sobra para mostrar un producto.
  getStock.mockResolvedValue({ stock: [{ saldo: 7, disponible: 7 }] });
});

describe("al escondido a mano SÍ se le pregunta la existencia", () => {
  it("entra al conjunto de /stock aunque esté apagado y Switch no lo dé por disponible", async () => {
    const { db } = makeDb(CATALOGO);
    await syncCatalogo(config(db) as never);
    expect(preguntados()).toContain("ESCONDIDO");
  });

  it("y su existencia se ESCRIBE — deja de estar congelada", async () => {
    const { db, escrituras } = makeDb(CATALOGO);
    await syncCatalogo(config(db) as never);
    const u = escrituras.find((e) => e.op === "update" && e.id === "p-esc");
    expect(u).toBeDefined();
    expect(u!.payload.existencia).toBe(7);
    expect(u!.payload.stock).toBe(7);
    expect(u!.payload.disponibilidad).toBe(7);
  });

  it("🔴 SIGUE ESCONDIDO: el UPDATE lo deja apagado aunque Switch mande existencia de sobra", async () => {
    const { db, escrituras } = makeDb(CATALOGO);
    await syncCatalogo(config(db) as never);
    const u = escrituras.find((e) => e.op === "update" && e.id === "p-esc");
    expect(u!.payload.active).toBe(false);
  });

  it("🔴 ninguna escritura de la corrida vuelve a mostrar al escondido", async () => {
    const { db, escrituras } = makeDb(CATALOGO);
    await syncCatalogo(config(db) as never);
    for (const e of escrituras.filter((x) => x.id === "p-esc")) {
      expect(e.payload.active === true, JSON.stringify(e.payload)).toBe(false);
    }
  });
});

describe("el conjunto no se abrió de más", () => {
  it("CONTROL: al apagado SIN el toggle puesto NO se le pregunta (el criterio no es «todo»)", async () => {
    const { db } = makeDb(CATALOGO);
    await syncCatalogo(config(db) as never);
    expect(preguntados()).not.toContain("APAGADO");
  });

  it("CONTROL: los dos criterios de siempre siguen entrando (activo y disponible ≥ 1)", async () => {
    const { db } = makeDb(CATALOGO);
    await syncCatalogo(config(db) as never);
    expect(preguntados()).toContain("ACTIVO");
    expect(preguntados()).toContain("DISPONIBLE");
  });

  it("son exactamente TRES preguntas: los dos de siempre + el escondido", async () => {
    const { db } = makeDb(CATALOGO);
    await syncCatalogo(config(db) as never);
    expect(preguntados()).toEqual(["ACTIVO", "DISPONIBLE", "ESCONDIDO"]);
  });
});

describe("tolerancia: sin la columna `oculto_manual` todo queda como antes", () => {
  it("una fila que no trae el campo no entra al conjunto", async () => {
    const sinColumna = CATALOGO.map(({ oculto_manual: _o, ...resto }) => resto);
    const { db } = makeDb(sinColumna);
    await syncCatalogo(config(db) as never);
    expect(preguntados()).toEqual(["ACTIVO", "DISPONIBLE"]);
  });
});

describe("la regla vive en el motor, no copiada en cada marca", () => {
  it("el conjunto de /stock nombra `oculto_manual` una sola vez, en sync-catalogo.ts", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/lib/switch-api/sync-catalogo.ts", "utf8");
    expect(src).toContain("ocultosManualSkus");
    for (const marca of ["reebok", "tommy", "calvin", "joybees"]) {
      const m = readFileSync(`src/lib/switch-api/sync-catalogo-${marca}.ts`, "utf8");
      expect(m, marca).not.toContain("ocultosManualSkus");
    }
  });
});
