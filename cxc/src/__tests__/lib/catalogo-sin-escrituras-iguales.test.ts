// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — el sync de catálogo no escribe lo que ya está, y NADA MÁS que eso.
//
// 🩸 EL RIESGO QUE ESTE ARCHIVO VIGILA NO ES ESCRIBIR DE MÁS: ES NO ESCRIBIR
// NUNCA. Si la comparación se equivoca diciendo "igual", el sync se saltea el
// 100% de las actualizaciones y el catálogo se congela **sin un solo error** —
// el "cero silencioso" que este repo ya pagó dos veces. Por eso los tests van
// en las DOS direcciones: que lo idéntico NO se escriba, y —lo que más
// importa— que lo que cambió SÍ se escriba, campo por campo y tipo por tipo.
//
// Y la otra mitad: que este cambio NO haya tocado el write path. En él viven la
// foto (`image_url` / `foto_manual`), el nombre editado (`nombre_manual`), la
// etiqueta (`badge`), el "ocultar" (`oculto_manual`) y el bulto (`bulto_pzas`),
// que son trabajo hecho A MANO y no vuelven de Switch si se pierden.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  campoIgual,
  filaIgual,
  todoSalteado,
  detalleEscrituras,
  centavosDeMonto,
  TIPOS_CAMPO_CATALOGO,
  CAMPO_SKIP_ESCRITURAS,
} from "@/lib/switch-api/catalogo-igualdad";

// ─────────────────────────────────────────────────────────────────────────────
// 1. COMPARACIÓN POR TIPO EXPLÍCITO — los pares que engañan
// ─────────────────────────────────────────────────────────────────────────────

describe("campoIgual — enteros (existencia / disponibilidad / stock / bulto / codigo_barra_id)", () => {
  it('acepta las dos formas en que PostgREST puede devolver un entero: 10 y "10"', () => {
    expect(campoIgual("existencia", 10, 10)).toBe(true);
    expect(campoIgual("existencia", 10, "10")).toBe(true);
    expect(campoIgual("existencia", 10, " 10 ")).toBe(true);
    expect(campoIgual("codigo_barra_id", 7, "007")).toBe(true);
  });

  it("un entero distinto es DISTINTO (y por un solo dígito)", () => {
    expect(campoIgual("existencia", 10, 11)).toBe(false);
    expect(campoIgual("disponibilidad", 0, 1)).toBe(false);
    expect(campoIgual("stock", 345, 344)).toBe(false);
  });

  it("null NO es 0, y 0 NO es null — son estados distintos y escribirlos es un cambio real", () => {
    expect(campoIgual("existencia", 0, null)).toBe(false);
    expect(campoIgual("existencia", null, 0)).toBe(false);
    expect(campoIgual("existencia", null, null)).toBe(true);
  });

  it('null NO es "" ni "" es 0', () => {
    expect(campoIgual("existencia", null, "")).toBe(false);
    expect(campoIgual("existencia", 0, "")).toBe(false);
  });

  it("un decimal NO se da por igual a un entero (ante la duda, se escribe)", () => {
    expect(campoIgual("existencia", 10, "10.0")).toBe(false);
    expect(campoIgual("existencia", 10.5, 10)).toBe(false);
  });

  it("un entero que no entra en un Number seguro no se da por igual", () => {
    expect(campoIgual("codigo_barra_id", Number.MAX_SAFE_INTEGER + 2, "9007199254740994")).toBe(false);
  });
});

describe("campoIgual — montos (price)", () => {
  it('0 y "0.00" son la misma plata', () => {
    expect(campoIgual("price", 0, "0.00")).toBe(true);
    expect(campoIgual("price", 0, 0)).toBe(true);
  });

  it("compara al CENTAVO, que es la precisión con que la base guarda numeric(10,2)", () => {
    expect(campoIgual("price", 49.9, "49.90")).toBe(true);
    expect(campoIgual("price", 49.9, "49.900000")).toBe(true);
    expect(campoIgual("price", 16.555, "16.56")).toBe(true); // 16.555 se guarda como 16.56
    expect(campoIgual("price", 49.9, "49.91")).toBe(false);
    expect(campoIgual("price", 49.9, "49.89")).toBe(false);
  });

  it("un centavo de diferencia SÍ se escribe", () => {
    expect(campoIgual("price", 27.0, "26.99")).toBe(false);
  });

  it("null no es 0.00", () => {
    expect(campoIgual("price", 0, null)).toBe(false);
    expect(campoIgual("price", null, "0.00")).toBe(false);
  });

  it("basura no es un monto: ante la duda, distinto", () => {
    expect(campoIgual("price", 49.9, "cuarenta")).toBe(false);
    expect(campoIgual("price", NaN, NaN)).toBe(false);
    expect(campoIgual("price", 49.9, {} as unknown)).toBe(false);
  });

  it("centavosDeMonto no usa coma flotante: 16.555 → 1656, no 1655", () => {
    expect(centavosDeMonto("16.555")).toBe(1656);
    expect(centavosDeMonto(16.555)).toBe(1656);
    expect(centavosDeMonto("1.005")).toBe(101);
    expect(centavosDeMonto("0")).toBe(0);
    expect(centavosDeMonto("-3.456")).toBe(-346);
    expect(centavosDeMonto("x")).toBe(null);
  });
});

describe("campoIgual — textos (name / category / gender)", () => {
  it("compara EXACTO: un espacio de más es un cambio real y se escribe", () => {
    expect(campoIgual("name", "Women-Sandals", "Women-Sandals")).toBe(true);
    expect(campoIgual("name", "Women-Sandals", "Women-Sandals ")).toBe(false);
    expect(campoIgual("category", "sandals", "Sandals")).toBe(false);
    expect(campoIgual("category", "sandals", "sandal")).toBe(false);
  });

  it('null NO es "" (uno es "sin dato" y el otro es un texto vacío)', () => {
    expect(campoIgual("gender", null, "")).toBe(false);
    expect(campoIgual("gender", "", null)).toBe(false);
    expect(campoIgual("gender", null, null)).toBe(true);
    expect(campoIgual("gender", "", "")).toBe(true);
  });

  it('"10" (texto) no se compara como número', () => {
    expect(campoIgual("name", "10", 10)).toBe(false);
    expect(campoIgual("name", 10 as unknown, "10")).toBe(false);
  });
});

describe("campoIgual — booleanos (active)", () => {
  it("true/false exactos", () => {
    expect(campoIgual("active", true, true)).toBe(true);
    expect(campoIgual("active", false, false)).toBe(true);
    expect(campoIgual("active", true, false)).toBe(false);
  });

  it('"true", 1 y null no son booleanos: ante la duda, se escribe', () => {
    expect(campoIgual("active", true, "true" as unknown)).toBe(false);
    expect(campoIgual("active", true, 1 as unknown)).toBe(false);
    expect(campoIgual("active", true, null)).toBe(false);
    expect(campoIgual("active", false, null)).toBe(false);
  });
});

describe("campoIgual — lo que NO se puede afirmar", () => {
  it("una columna NO declarada nunca se da por igual (aunque los valores coincidan)", () => {
    expect(campoIgual("columna_nueva_de_mañana", 5, 5)).toBe(false);
    expect(campoIgual("image_url", "https://x/1.jpg", "https://x/1.jpg")).toBe(false);
  });

  it('una columna que no se leyó (undefined) nunca es "igual"', () => {
    expect(campoIgual("existencia", 10, undefined)).toBe(false);
    expect(campoIgual("price", null, undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. filaIgual — la fila entera
// ─────────────────────────────────────────────────────────────────────────────

describe("filaIgual", () => {
  const guardada = {
    id: "p1",
    sku: "A1",
    name: "Women-Sandals",
    price: "49.90",
    active: true,
    existencia: 10,
    disponibilidad: 8,
    stock: 10,
    image_url: "https://x/1.jpg",
    oculto_manual: false,
  };

  it("todo igual → igual", () => {
    expect(
      filaIgual({ price: 49.9, name: "Women-Sandals", active: true, existencia: 10, disponibilidad: 8, stock: 10 }, guardada),
    ).toEqual({ igual: true });
  });

  it("una sola columna distinta → NO igual, y dice cuál", () => {
    const r = filaIgual(
      { price: 49.9, name: "Women-Sandals", active: true, existencia: 10, disponibilidad: 9, stock: 10 },
      guardada,
    );
    expect(r.igual).toBe(false);
    expect(r.motivo).toContain("disponibilidad");
  });

  it("una columna del payload que NO se leyó de la base → NO igual (nunca se saltea a ciegas)", () => {
    const r = filaIgual({ name: "Women-Sandals", category: "sandals" }, guardada);
    expect(r.igual).toBe(false);
    expect(r.motivo).toContain("category");
    expect(r.motivo).toContain("no se leyó");
  });

  it("sin fila guardada → NO igual", () => {
    expect(filaIgual({ name: "x" }, null).igual).toBe(false);
    expect(filaIgual({ name: "x" }, undefined).igual).toBe(false);
  });

  it("payload vacío → NO igual (no existe el caso 'nada que comparar, está todo bien')", () => {
    expect(filaIgual({}, guardada).igual).toBe(false);
  });

  it("una columna con valor undefined en la fila guardada → NO igual", () => {
    expect(filaIgual({ existencia: 10 }, { ...guardada, existencia: undefined }).igual).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Guard de sanidad + contadores
// ─────────────────────────────────────────────────────────────────────────────

describe("guard de sanidad: saltearse el 100%", () => {
  it("se marca cuando no se escribió NADA habiendo productos", () => {
    expect(todoSalteado({ comparados: 455, escrituras: 0, sinCambios: 455 })).toBe(true);
  });

  it("no se marca si se escribió aunque sea una", () => {
    expect(todoSalteado({ comparados: 455, escrituras: 1, sinCambios: 454 })).toBe(false);
  });

  it("no se marca cuando no había productos que comparar (no es lo mismo que congelarse)", () => {
    expect(todoSalteado({ comparados: 0, escrituras: 0, sinCambios: 0 })).toBe(false);
  });

  it("el detalle que va a switch_sync_log lleva los tres números y su propia marca", () => {
    const d = detalleEscrituras({ comparados: 455, escrituras: 54, sinCambios: 401 });
    expect(d.campo).toBe(CAMPO_SKIP_ESCRITURAS);
    expect(d.valorCrudo).toEqual({ comparados: 455, escrituras: 54, sinCambios: 401, todoSalteado: false });
  });

  it("su marca NO se pisa con las de los guards de montos (que leen skip_details por `campo`)", () => {
    expect(CAMPO_SKIP_ESCRITURAS).not.toMatch(/^monto_imposible/);
    expect(CAMPO_SKIP_ESCRITURAS).not.toMatch(/^costo_sospechoso/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. EL MOTOR REAL — conducta, no texto
// ─────────────────────────────────────────────────────────────────────────────

const getArticulos = vi.fn();
const getStock = vi.fn();

vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({ getArticulos, getStock }),
}));
const finishLog = vi.fn(async () => {});
vi.mock("@/lib/switch-api/sync-log", () => ({
  createSwitchSyncLog: vi.fn(async () => "log-1"),
  finishSwitchSyncLog: (...args: unknown[]) => finishLog(...(args as [])),
}));
vi.mock("@/lib/cron-telemetry", () => ({ logCronError: vi.fn(async () => {}) }));

import { syncCatalogo } from "@/lib/switch-api/sync-catalogo";

interface Escritura {
  tabla: string;
  op: "update" | "insert" | "upsert";
  payload: Record<string, unknown>;
}

/** Doble de PostgREST que registra QUÉ columnas se piden y QUÉ se escribe.
 *  `erroresDeSelect` permite simular una columna que todavía no existe. */
function makeDb(existentes: Record<string, unknown>[], erroresDeSelect: (string | null)[] = []) {
  const escrituras: Escritura[] = [];
  const selects: string[] = [];
  const db = {
    from(tabla: string) {
      let colsPedidas = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: (cols?: string) => {
          if (typeof cols === "string") {
            colsPedidas = cols;
            selects.push(cols);
          }
          return chain;
        },
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
        upsert(payload: Record<string, unknown>) {
          escrituras.push({ tabla, op: "upsert", payload });
          return chain;
        },
        single: async () => ({ data: { id: "nuevo-1" }, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then(res: (v: { data: unknown; error: unknown }) => unknown) {
          // Solo la lectura de productos (la que pide varias columnas) puede
          // fallar por columna ausente; el resto contesta normal.
          const falla = colsPedidas.includes("keep_visible") ? erroresDeSelect.shift() ?? null : null;
          if (falla) return Promise.resolve(res({ data: null, error: { message: falla } }));
          // 🩸 SE PROYECTA A LAS COLUMNAS PEDIDAS, como hace PostgREST de
          // verdad. Devolver la fila entera sin importar el `select` haría que
          // el motor "viera" columnas que en producción no le llegan, y este
          // arnés daría por comparable algo que no lo es — justo el error que
          // convierte un test en una mentira tranquilizadora.
          const cols = colsPedidas.split(",").map((c) => c.trim()).filter(Boolean);
          const data = existentes.map((f) => {
            const o: Record<string, unknown> = {};
            for (const c of cols) if (Object.prototype.hasOwnProperty.call(f, c)) o[c] = f[c];
            return o;
          });
          return Promise.resolve(res({ data, error: null }));
        },
      };
      return chain;
    },
  };
  return { db: db as never, escrituras, selects };
}

const ART = {
  id: "a1",
  codigo: "FM0FM04474BDS",
  descripcion: "Men-Sneakers",
  precio: "49.90",
  disponible: "8",
};

/** Config equivalente a la de Joybees/Tommy (stock en el producto). */
function config(db: unknown, extra: Record<string, unknown> = {}) {
  return {
    marca: "tommy" as const,
    syncLogType: "catalogo_test",
    productsTable: "tommy_products",
    db: db as never,
    empresas: [{ empresaKey: "fashion_shoes", categories: [] }] as never,
    articuloFilter: () => true,
    stockFields: (existencia: number, disponibilidad: number) => ({ existencia, disponibilidad, stock: existencia }),
    columnasEscritas: ["existencia", "disponibilidad", "stock"],
    ...extra,
  };
}

/** Fila guardada que coincide EXACTAMENTE con lo que el sync escribiría. */
function filaIdentica(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    sku: "FM0FM04474BDS",
    name: "Men-Sneakers",
    price: "49.90",
    active: true,
    image_url: "https://x/product-images/tommy/_v/fm0fm04474bds/6.jpg?v=1",
    badge: null,
    keep_visible: null,
    oculto_manual: false,
    existencia: 10,
    disponibilidad: 8,
    stock: 10,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getArticulos.mockImplementation(async ({ paginaActual }: { paginaActual: number }) => ({
    articulos: paginaActual === 1 ? [ART] : [],
  }));
  getStock.mockResolvedValue({ stock: [{ saldo: "10", disponible: "8" }] });
});

describe("el motor NO escribe cuando escribiría lo mismo", () => {
  it("fila idéntica → CERO UPDATE, y los contadores lo dicen", async () => {
    const { db, escrituras } = makeDb([filaIdentica()]);
    const r = await syncCatalogo(config(db) as never);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
    expect(r.empresas[0].comparados).toBe(1);
    expect(r.empresas[0].sinCambios).toBe(1);
    expect(r.empresas[0].escrituras).toBe(0);
  });

  it("los contadores de siempre NO cambian de significado: el producto sigue contando como actualizado", async () => {
    const { db } = makeDb([filaIdentica()]);
    const r = await syncCatalogo(config(db) as never);
    expect(r.empresas[0].actualizados).toBe(1);
    expect(r.empresas[0].agregados).toBe(0);
    expect(r.empresas[0].ocultados).toBe(0);
    expect(r.empresas[0].stockChecks).toBe(1);
  });

  it("los tres números viajan a switch_sync_log en cada corrida", async () => {
    const { db } = makeDb([filaIdentica()]);
    await syncCatalogo(config(db) as never);
    const detalles = (finishLog.mock.calls[0] as unknown[])[2] as { skipDetails?: Record<string, unknown>[] };
    const fila = detalles.skipDetails?.find((d) => d.campo === CAMPO_SKIP_ESCRITURAS);
    expect(fila?.valorCrudo).toEqual({ comparados: 1, escrituras: 0, sinCambios: 1, todoSalteado: true });
  });
});

describe("🔴 lo que SÍ cambió, SÍ se escribe", () => {
  it("cambió la disponibilidad en Switch → UPDATE con el payload COMPLETO de siempre", async () => {
    getStock.mockResolvedValue({ stock: [{ saldo: "10", disponible: "3" }] });
    const { db, escrituras } = makeDb([filaIdentica()]);
    const r = await syncCatalogo(config(db) as never);
    const updates = escrituras.filter((e) => e.op === "update");
    expect(updates).toHaveLength(1);
    // El payload es el MISMO que antes de este cambio: nada se recortó.
    expect(updates[0].payload).toEqual({
      price: 49.9,
      name: "Men-Sneakers",
      active: true,
      existencia: 10,
      disponibilidad: 3,
      stock: 10,
    });
    expect(r.empresas[0].escrituras).toBe(1);
    expect(r.empresas[0].sinCambios).toBe(0);
  });

  it("cambió la existencia → se escribe", async () => {
    getStock.mockResolvedValue({ stock: [{ saldo: "0", disponible: "0" }] });
    const { db, escrituras } = makeDb([filaIdentica()]);
    await syncCatalogo(config(db) as never);
    const u = escrituras.filter((e) => e.op === "update");
    expect(u).toHaveLength(1);
    expect(u[0].payload).toMatchObject({ existencia: 0, active: false });
  });

  it("cambió SOLO el precio (un centavo) → se escribe", async () => {
    getArticulos.mockImplementation(async ({ paginaActual }: { paginaActual: number }) => ({
      articulos: paginaActual === 1 ? [{ ...ART, precio: "49.91" }] : [],
    }));
    const { db, escrituras } = makeDb([filaIdentica()]);
    await syncCatalogo(config(db) as never);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(1);
  });

  it("cambió SOLO el nombre en Switch (producto sin nombre local) → se escribe", async () => {
    const { db, escrituras } = makeDb([filaIdentica({ name: "" })]);
    await syncCatalogo(config(db) as never);
    const u = escrituras.filter((e) => e.op === "update");
    expect(u).toHaveLength(1);
    expect(u[0].payload).toMatchObject({ name: "Men-Sneakers" });
  });

  it("el producto se está ocultando/reactivando → se escribe", async () => {
    const { db, escrituras } = makeDb([filaIdentica({ active: false })]);
    const r = await syncCatalogo(config(db) as never);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(1);
    expect(r.empresas[0].reactivados).toBe(1);
  });

  it("un producto NUEVO se inserta igual que siempre (la comparación no lo toca)", async () => {
    const { db, escrituras } = makeDb([]);
    const r = await syncCatalogo(config(db) as never);
    expect(escrituras.filter((e) => e.op === "insert")).toHaveLength(1);
    expect(r.empresas[0].agregados).toBe(1);
    expect(r.empresas[0].comparados).toBe(0);
  });
});

describe("🩸 sin poder comparar, se escribe (el comportamiento de ayer)", () => {
  it("si la marca no declara columnasEscritas, el stock no se lee y SIEMPRE se escribe", async () => {
    const { db, escrituras } = makeDb([filaIdentica()]);
    await syncCatalogo(config(db, { columnasEscritas: undefined }) as never);
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(1);
  });

  it("una columna del payload que la base todavía no tiene → se escribe siempre", async () => {
    // `category` está en el payload (hook derive) pero no en columnasEscritas.
    const { db, escrituras } = makeDb([filaIdentica()]);
    await syncCatalogo(
      config(db, {
        derive: { insertFields: () => ({}), updateFields: () => ({ category: "sneakers" }) },
      }) as never,
    );
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(1);
  });

  it("🔴 si una columna de comparación no existe, la escalera NO se lleva puesto `nombre_manual`", async () => {
    // Pre-DDL: el primer SELECT falla porque falta bulto_pzas. El segundo (sin
    // las columnas de comparación pero CON nombre_manual) tiene que funcionar,
    // porque sin nombre_manual el sync pisaría el nombre editado a mano.
    const { db, escrituras, selects } = makeDb(
      [filaIdentica({ name: "Sandalia bonita", nombre_manual: true })],
      ['column tommy_products.bulto_pzas does not exist'],
    );
    await syncCatalogo(
      config(db, {
        columnasEscritas: ["existencia", "disponibilidad", "stock", "bulto_pzas"],
        derive: {
          extraCols: ["nombre_manual"],
          insertFields: () => ({}),
          updateFields: (_a: unknown, ex: Record<string, unknown>) =>
            ex.nombre_manual === true ? {} : { name: "Men-Sneakers" },
        },
      }) as never,
    );
    const lecturas = selects.filter((s) => s.includes("keep_visible"));
    expect(lecturas).toHaveLength(2);
    expect(lecturas[0]).toContain("bulto_pzas");
    expect(lecturas[1]).not.toContain("bulto_pzas");
    expect(lecturas[1]).toContain("nombre_manual"); // ← lo que protege el nombre
    const u = escrituras.filter((e) => e.op === "update");
    expect(u).toHaveLength(1); // sin poder comparar, se escribe
    expect(u[0].payload.name).toBe("Sandalia bonita"); // el nombre a mano intacto
  });

  it("un error AJENO de la lectura (permisos, red) se propaga y NO se escribe nada", async () => {
    const { db, escrituras } = makeDb([filaIdentica()], ["permission denied for table tommy_products"]);
    const r = await syncCatalogo(config(db) as never);
    expect(r.empresas[0].error).toContain("permission denied");
    expect(escrituras).toHaveLength(0);
  });
});

describe("⛔ el write path NO se tocó", () => {
  it("el UPDATE sigue SIN image_url, foto_manual, badge, oculto_manual ni keep_visible", async () => {
    getStock.mockResolvedValue({ stock: [{ saldo: "10", disponible: "3" }] });
    const { db, escrituras } = makeDb([filaIdentica({ foto_manual: true })]);
    await syncCatalogo(config(db) as never);
    const u = escrituras.filter((e) => e.op === "update");
    expect(u).toHaveLength(1);
    for (const prohibida of ["image_url", "foto_manual", "badge", "oculto_manual", "keep_visible", "nombre_manual", "sku", "id"]) {
      expect(u[0].payload).not.toHaveProperty(prohibida);
    }
  });

  it("las escrituras siguen siendo DE A UNA por id — nada de lotes ni upsert masivo", async () => {
    getStock.mockResolvedValue({ stock: [{ saldo: "10", disponible: "3" }] });
    const { db, escrituras } = makeDb([filaIdentica()]);
    await syncCatalogo(config(db) as never);
    for (const e of escrituras.filter((x) => x.op === "update")) {
      expect(Array.isArray(e.payload)).toBe(false);
    }
    expect(escrituras.some((e) => e.op === "upsert" && e.tabla === "tommy_products")).toBe(false);
  });

  it("el inventario de Reebok se sigue escribiendo aunque el producto no cambie", async () => {
    const { db, escrituras } = makeDb([filaIdentica()]);
    await syncCatalogo(
      config(db, {
        productsTable: "products",
        inventoryTable: "inventory",
        columnasEscritas: ["existencia", "disponibilidad", "stock"],
      }) as never,
    );
    expect(escrituras.filter((e) => e.op === "update")).toHaveLength(0);
    expect(escrituras.filter((e) => e.tabla === "inventory" && e.op === "upsert")).toHaveLength(1);
  });

  it("en dryRun no se escribe nada, pero los contadores igual dicen cuánto se habría escrito", async () => {
    getStock.mockResolvedValue({ stock: [{ saldo: "10", disponible: "3" }] });
    const { db, escrituras } = makeDb([filaIdentica()]);
    const r = await syncCatalogo(config(db) as never, { dryRun: true });
    expect(escrituras).toHaveLength(0);
    expect(r.empresas[0].escrituras).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Las 4 marcas REALES: toda columna que se escribe se puede comparar
// ─────────────────────────────────────────────────────────────────────────────

describe("las 4 marcas declaran lo que escriben", () => {
  const MARCAS = [
    { key: "reebok", modulo: "@/lib/switch-api/sync-catalogo-reebok", fn: "syncCatalogoReebok", server: "@/lib/reebok-supabase-server", exportar: "reebokServer", tabla: "products" },
    { key: "joybees", modulo: "@/lib/switch-api/sync-catalogo-joybees", fn: "syncCatalogoJoybees", server: "@/lib/joybees-supabase-server", exportar: "joybeesServer", tabla: "joybees_products" },
    { key: "tommy", modulo: "@/lib/switch-api/sync-catalogo-tommy", fn: "syncCatalogoTommy", server: "@/lib/tommy-supabase-server", exportar: "tommyServer", tabla: "tommy_products" },
    { key: "calvin", modulo: "@/lib/switch-api/sync-catalogo-calvin", fn: "syncCatalogoCalvin", server: "@/lib/calvin-supabase-server", exportar: "calvinServer", tabla: "calvin_products" },
  ] as const;

  for (const m of MARCAS) {
    it(`${m.key}: cada columna del UPDATE está declarada Y se lee (si no, se escribiría siempre)`, async () => {
      vi.resetModules();
      // Artículo que pasa TODOS los filtros de marca a la vez.
      const art = {
        id: "a1",
        codigo: "FM0FM04474BDS",
        descripcion: "Men-Sneakers",
        precio: "49.90",
        disponible: "8",
        proveedor: m.key === "joybees" ? "JCBBRANDS" : "LATIN FITNESS GROUP",
        marcaId: m.key === "calvin" ? 8 : 3,
        codigoBarraId: 12345,
        cantidadPorCaja: "12.0000",
      };
      getArticulos.mockImplementation(async ({ paginaActual }: { paginaActual: number }) => ({
        articulos: paginaActual === 1 ? [art] : [],
      }));
      getStock.mockResolvedValue({ stock: [{ saldo: "10", disponible: "3" }] });
      const { db, escrituras, selects } = makeDb([filaIdentica({ nombre_manual: false, category: "x", gender: "y", bulto_pzas: 1, codigo_barra_id: 1 })]);
      vi.doMock(m.server, () => ({ [m.exportar]: db }));
      const mod = (await import(m.modulo)) as Record<string, () => Promise<unknown>>;
      await mod[m.fn]();

      const updates = escrituras.filter((e) => e.op === "update" && e.tabla === m.tabla);
      expect(updates.length).toBeGreaterThan(0);
      const lectura = selects.find((s) => s.includes("keep_visible"))!;
      const leidas = new Set(lectura.split(",").map((c) => c.trim()));
      for (const col of Object.keys(updates[0].payload)) {
        // Declarada con su tipo…
        expect(TIPOS_CAMPO_CATALOGO, `columna "${col}" sin tipo declarado`).toHaveProperty(col);
        // …y pedida en la MISMA lectura, para poder compararla.
        expect(leidas.has(col), `columna "${col}" no se lee: nunca se podría saltear`).toBe(true);
      }
    });
  }
});
