// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DE CONDUCTA — el sync REAL de Reebok escribe la clasificación que
// dice Switch, y no la que se le ocurra.
//
// Es de CONDUCTA y no de texto a propósito: lo que hay que probar es qué
// PAYLOAD sale hacia la base. Un barrido sobre el .tsx podía darse por
// satisfecho con el comentario que explica lo que debería pasar — este repo ya
// pagó ese error cuatro veces.
//
// Corre `syncCatalogoReebok` de verdad contra un doble de PostgREST que proyecta
// a las columnas pedidas (como PostgREST) y registra cada escritura.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const espias = vi.hoisted(() => ({
  getArticulos: vi.fn(),
  getStock: vi.fn(),
  enviarSistema: vi.fn(async (_t: string) => true),
  fichas: [] as Array<Record<string, unknown>>,
  escrituras: [] as Array<{ tabla: string; op: string; payload: Record<string, unknown> }>,
  productos: [] as Array<Record<string, unknown>>,
  selects: [] as string[],
}));

vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({ getArticulos: espias.getArticulos, getStock: espias.getStock }),
}));
vi.mock("@/lib/switch-api/sync-log", () => ({
  createSwitchSyncLog: vi.fn(async () => "log-1"),
  finishSwitchSyncLog: vi.fn(async () => {}),
}));
vi.mock("@/lib/cron-telemetry", () => ({ logCronError: vi.fn(async () => {}) }));
vi.mock("@/lib/catalogo/cache", () => ({ invalidarCatalogoPublico: vi.fn() }));
vi.mock("@/lib/alertas/canal", () => ({
  enviarSistema: espias.enviarSistema,
  enviarNegocio: vi.fn(async () => true),
}));
vi.mock("@/lib/switch-api/monto-guard-io", () => ({
  calibrarUmbral: vi.fn(async () => 100_000),
  avisarMontosImposibles: vi.fn(async () => {}),
  clavesYaAvisadasPorCampo: vi.fn(async () => [] as string[]),
}));

/** Doble de PostgREST: proyecta a las columnas pedidas y registra escrituras. */
function chainDe(filas: () => Array<Record<string, unknown>>, tabla: string) {
  let cols = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: (c?: string) => { if (typeof c === "string") { cols = c; espias.selects.push(`${tabla}:${c}`); } return chain; },
    eq: () => chain, in: () => chain, or: () => chain, not: () => chain,
    order: () => chain, limit: () => chain, range: () => chain,
    update: (p: Record<string, unknown>) => { espias.escrituras.push({ tabla, op: "update", payload: p }); return chain; },
    insert: (p: Record<string, unknown>) => { espias.escrituras.push({ tabla, op: "insert", payload: p }); return chain; },
    upsert: (p: Record<string, unknown>) => { espias.escrituras.push({ tabla, op: "upsert", payload: p }); return chain; },
    single: async () => ({ data: { id: "nuevo-1" }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then(res: (v: { data: unknown; error: unknown }) => unknown) {
      const nombres = cols.split(",").map((c) => c.trim()).filter(Boolean);
      const data = filas().map((f) => {
        const o: Record<string, unknown> = {};
        for (const c of nombres) if (Object.prototype.hasOwnProperty.call(f, c)) o[c] = f[c];
        return o;
      });
      return Promise.resolve(res({ data, error: null }));
    },
  };
  return chain;
}

vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => chainDe(() => (t === "products" ? espias.productos : []), t) },
}));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => chainDe(() => (t === "switch_articulo_info" ? espias.fichas : []), t) },
}));

import { syncCatalogoReebok } from "@/lib/switch-api/sync-catalogo-reebok";

/** Cuándo se le pidió la ficha a Switch. Fecha FIJA. Lo único que importa es
 *  que NO sea null: una fila de `switch_articulo_info` SIN `ficha_at` existe
 *  desde el barrido de precios y no es una ficha — ver el bloque de la falsa
 *  alarma más abajo. */
const FICHA_AT = "2026-09-02T04:50:00.000Z";

const ART = (over: Record<string, unknown> = {}) => ({
  id: 1, codigo: "SKU1", descripcion: "ZIG DYNAMICA 6", codigoBarraId: 111,
  costo: "20", disponible: "10", precio: "49.90", cantidadPorCaja: "0.0000",
  talla: null, color: null, marcaId: 2, codigoBarra: "EAN1",
  proveedor: "LATIN FITNESS GROUP", ...over,
});

beforeEach(() => {
  espias.escrituras.length = 0;
  espias.selects.length = 0;
  espias.enviarSistema.mockClear();
  espias.getArticulos.mockReset();
  espias.getStock.mockReset();
  espias.getStock.mockResolvedValue({ stock: [{ saldo: "10", disponible: "10" }] });
});

/** Corre el sync con un universo de Switch, un catálogo guardado y unas fichas. */
async function correr(opts: {
  articulos: Array<Record<string, unknown>>;
  productos?: Array<Record<string, unknown>>;
  fichas?: Array<Record<string, unknown>>;
}) {
  espias.productos = opts.productos ?? [];
  espias.fichas = opts.fichas ?? [];
  espias.getArticulos.mockImplementation(async ({ paginaActual }: { paginaActual: number }) =>
    paginaActual === 1 ? { articulos: opts.articulos } : { articulos: [] },
  );
  return syncCatalogoReebok({ triggeredBy: "manual" });
}

const escrituraA = (tabla: string, op: string) =>
  espias.escrituras.find((e) => e.tabla === tabla && e.op === op)?.payload;

describe("🔴 producto NUEVO: entra clasificado por Switch, no por un default", () => {
  it("con ficha: category y gender salen del rubro y el subrubro", async () => {
    await correr({
      articulos: [ART()],
      fichas: [{ codigo: "SKU1", rubro: "SHOES", subrubro: "FEMALE", marca: "FOOTWEAR", ficha_at: FICHA_AT }],
    });
    const ins = escrituraA("products", "insert")!;
    expect(ins.category).toBe("footwear");
    expect(ins.gender).toBe("female");
  });

  it("🩸 SIN ficha: NO entra como footwear/male — entra al cajón neutro", async () => {
    await correr({ articulos: [ART()], fichas: [] });
    const ins = escrituraA("products", "insert")!;
    expect(ins.category).not.toBe("footwear");
    expect(ins.gender).not.toBe("male");
    expect(ins.category).toBe("otros");
    expect(ins.gender).toBe("sin_clasificar");
  });

  it("🔴 el INSERT NOMBRA la columna gender — sin eso decide el DEFAULT de Postgres", async () => {
    await correr({ articulos: [ART()], fichas: [] });
    const ins = escrituraA("products", "insert")!;
    expect(Object.prototype.hasOwnProperty.call(ins, "gender")).toBe(true);
  });

  it("UNISEX sin señal en el nombre entra como hombre (decisión de Daniel)", async () => {
    await correr({
      articulos: [ART({ descripcion: "BIG LOGO TEE" })],
      fichas: [{ codigo: "SKU1", rubro: "APPAREL", subrubro: "UNISEX", marca: "APPAREL", ficha_at: FICHA_AT }],
    });
    expect(escrituraA("products", "insert")!.gender).toBe("male");
  });

  it("🔴 UNISEX + el nombre dice WOMEN → mujer, y llega hasta el payload", async () => {
    await correr({
      articulos: [ART({ descripcion: "WOMEN BIG LOGO TEE" })],
      fichas: [{ codigo: "SKU1", rubro: "APPAREL", subrubro: "UNISEX", marca: "APPAREL", ficha_at: FICHA_AT }],
    });
    expect(escrituraA("products", "insert")!.gender).toBe("female");
  });

  it("🩸 …y la W de LOW no cuenta: REEBOK TERRAIN EDGE LOW sigue siendo hombre", async () => {
    await correr({
      articulos: [ART({ descripcion: "REEBOK TERRAIN EDGE LOW" })],
      fichas: [{ codigo: "SKU1", rubro: "SHOES", subrubro: "UNISEX", marca: "FOOTWEAR", ficha_at: FICHA_AT }],
    });
    expect(escrituraA("products", "insert")!.gender).toBe("male");
  });

  it("🔴 un MALE explícito de Switch NO lo contradice el nombre, ni en el payload real", async () => {
    await correr({
      articulos: [ART({ descripcion: "WOMEN BIG LOGO TEE" })],
      fichas: [{ codigo: "SKU1", rubro: "APPAREL", subrubro: "MALE", marca: "APPAREL", ficha_at: FICHA_AT }],
    });
    expect(escrituraA("products", "insert")!.gender).toBe("male");
  });

  it("💸 🔴 cuando rubro y marca se CONTRADICEN, manda la marca — y con eso el bulto", async () => {
    // No pasa hoy (456/456 · 10/10 · 1/1 sin una sola contradicción), pero el
    // día que pase decide si una zapatilla se cobra de 12 o de 6.
    await correr({
      articulos: [ART()],
      fichas: [{ codigo: "SKU1", rubro: "BAGS", subrubro: "MALE", marca: "FOOTWEAR", ficha_at: FICHA_AT }],
    });
    expect(escrituraA("products", "insert")!.category).toBe("footwear");
  });

  it("🔴 la MARCA gana sobre un rubro basura, en el payload real", async () => {
    // 274 renglones reales traen rubro="REEBOK CLASSICS CORE FTW MEN".
    await correr({
      articulos: [ART()],
      fichas: [{ codigo: "SKU1", rubro: "REEBOK CLASSICS CORE FTW MEN", subrubro: "MALE", marca: "FOOTWEAR", ficha_at: FICHA_AT }],
    });
    expect(escrituraA("products", "insert")!.category).toBe("footwear");
    // …y no avisa: la marca resolvió, no hay nada desconocido que reportar.
    expect(espias.enviarSistema).not.toHaveBeenCalled();
  });

  it("medias: rubro SOCKS entra como ROPA, no como accesorio", async () => {
    await correr({
      articulos: [ART()],
      fichas: [{ codigo: "SKU1", rubro: "SOCKS", subrubro: "UNISEX", marca: "APPAREL", ficha_at: FICHA_AT }],
    });
    expect(escrituraA("products", "insert")!.category).toBe("apparel");
  });
});

describe("producto EXISTENTE: la clasificación se refresca desde Switch", () => {
  const GUARDADO = {
    id: "p1", sku: "SKU1", name: "ZIG", price: 49.9, active: true, image_url: null,
    badge: null, keep_visible: false, oculto_manual: false,
    existencia: 10, disponibilidad: 10, codigo_barra_id: 111,
    category: "accessories", gender: "unisex",
  };

  it("los 7 ACCS0xx: Switch dice SOCKS ⇒ el UPDATE los mueve a apparel", async () => {
    await correr({
      articulos: [ART()],
      productos: [GUARDADO],
      fichas: [{ codigo: "SKU1", rubro: "SOCKS", subrubro: "UNISEX", marca: "APPAREL", ficha_at: FICHA_AT }],
    });
    const upd = escrituraA("products", "update")!;
    expect(upd.category).toBe("apparel");
    expect(upd.gender).toBe("male");
  });

  it("💸 un rubro DESCONOCIDO no pisa la categoría guardada — el bulto no se mueve", async () => {
    await correr({
      articulos: [ART()],
      productos: [{ ...GUARDADO, category: "footwear", gender: "male" }],
      fichas: [{ codigo: "SKU1", rubro: "RUBRO NUEVO", subrubro: "SUBRUBRO NUEVO", marca: "MARCA NUEVA", ficha_at: FICHA_AT }],
    });
    // No hay escritura, o si la hay conserva footwear: en ninguno de los dos
    // casos el producto pasa a bulto 6.
    const upd = escrituraA("products", "update");
    if (upd) expect(upd.category).toBe("footwear");
    expect(espias.productos[0].category).toBe("footwear");
  });

  it("no se escribe lo que ya está: si la clasificación no cambió, no hay UPDATE", async () => {
    await correr({
      articulos: [ART()],
      productos: [{ ...GUARDADO, category: "footwear", gender: "male" }],
      fichas: [{ codigo: "SKU1", rubro: "SHOES", subrubro: "MALE", marca: "FOOTWEAR", ficha_at: FICHA_AT }],
    });
    expect(escrituraA("products", "update")).toBeUndefined();
  });

  it("category y gender se LEEN en la misma consulta (si no, se escribirían siempre)", async () => {
    await correr({ articulos: [ART()], productos: [GUARDADO], fichas: [] });
    const sel = espias.selects.find((s) => s.startsWith("products:") && s.includes("keep_visible"))!;
    expect(sel).toContain("category");
    expect(sel).toContain("gender");
  });
});

describe("🔴 la consulta de productos NO filtra por categoría", () => {
  it("un producto en el cajón neutro tiene que seguir siendo visible para el motor", async () => {
    // Con `categories: ["footwear","apparel","accessories"]`, un producto en
    // `otros` desaparecía de la lectura y el motor lo trataba como inexistente:
    // lo re-insertaba duplicado o lo dejaba huérfano y oculto.
    await correr({
      articulos: [ART()],
      productos: [{ id: "p1", sku: "SKU1", name: "ZIG", price: 49.9, active: true, image_url: null, badge: null, keep_visible: false, oculto_manual: false, category: "otros", gender: "sin_clasificar", existencia: 10, disponibilidad: 10, codigo_barra_id: 111 }],
      fichas: [{ codigo: "SKU1", rubro: "SHOES", subrubro: "MALE", marca: "FOOTWEAR", ficha_at: FICHA_AT }],
    });
    // Lo encontró: lo actualiza, no lo inserta de nuevo.
    expect(escrituraA("products", "insert")).toBeUndefined();
    expect(escrituraA("products", "update")!.category).toBe("footwear");
  });

  it("y el archivo del sync no vuelve a enumerar categorías", () => {
    const src = fs
      .readFileSync(path.resolve(__dirname, "../../..", "src/lib/switch-api/sync-catalogo-reebok.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src).toMatch(/categories:\s*\[\]/);
  });
});

describe("🔴 lo desconocido AVISA por SISTEMA", () => {
  it("un rubro que Switch estrena dispara el aviso", async () => {
    await correr({
      articulos: [ART()],
      fichas: [{ codigo: "SKU1", rubro: "RUBRO RECIEN INVENTADO", subrubro: "MALE", marca: "MARCA RARA", ficha_at: FICHA_AT }],
    });
    expect(espias.enviarSistema).toHaveBeenCalledTimes(1);
    expect(espias.enviarSistema.mock.calls[0][0]).toContain("RUBRO RECIEN INVENTADO");
  });

  it("un catálogo entero bien clasificado NO avisa nada", async () => {
    await correr({
      articulos: [ART()],
      fichas: [{ codigo: "SKU1", rubro: "SHOES", subrubro: "MALE", marca: "FOOTWEAR", ficha_at: FICHA_AT }],
    });
    expect(espias.enviarSistema).not.toHaveBeenCalled();
  });

  it("un producto SIN ficha todavía no avisa: no preguntamos ≠ Switch mandó algo raro", async () => {
    await correr({ articulos: [ART()], fichas: [] });
    expect(espias.enviarSistema).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 LA FALSA ALARMA DE LAS 233 — 2-sep-2026, 2:52 PM, y por qué este candado
// es de CONDUCTA y está acá, en el sync REAL.
//
// El test de arriba («un producto SIN ficha todavía no avisa») pasaba en verde
// mientras el aviso salía a Telegram, y no era un test mentiroso: su fixture era
// `fichas: []` —el producto NO tenía fila—. Producción tenía la otra forma, que
// nadie había escrito: **la fila EXISTE** (la crea el barrido de precios, mucho
// antes de que nadie le pida la ficha a Switch) y sus tres campos están en NULL.
// El sync la levantaba como si fuera una ficha vacía y avisaba por 233
// artículos que no tenían absolutamente nada malo.
//
// 🔑 Por eso lo que se prueba acá es la fila que producción sí tenía, y se
// prueba contra `enviarSistema` —el Telegram— y no contra la función pura.
// ─────────────────────────────────────────────────────────────────────────────

describe("🩸🔴 una fila SIN ficha_at no es una ficha: no avisa nunca", () => {
  /** La fila que produjo la falsa alarma: existe, sin ficha pedida. */
  const FILA_SIN_FICHA = { codigo: "SKU1", rubro: null, subrubro: null, marca: null, ficha_at: null };

  it("🔴 los 233: fila con los tres campos en NULL y sin ficha_at ⇒ CERO Telegram", async () => {
    await correr({ articulos: [ART()], fichas: [FILA_SIN_FICHA] });
    expect(espias.enviarSistema).not.toHaveBeenCalled();
  });

  it("🔴 tampoco avisa por un producto YA clasificado, que era el caso real", async () => {
    await correr({
      articulos: [ART()],
      productos: [{
        id: "p1", sku: "SKU1", name: "ZIG", price: 49.9, active: true, image_url: null,
        badge: null, keep_visible: false, oculto_manual: false, existencia: 10,
        disponibilidad: 10, codigo_barra_id: 111, category: "footwear", gender: "male",
      }],
      fichas: [FILA_SIN_FICHA],
    });
    expect(espias.enviarSistema).not.toHaveBeenCalled();
    // …y no lo degrada: sin preguntar no se reclasifica a nadie.
    const upd = escrituraA("products", "update");
    if (upd) expect(upd.category).toBe("footwear");
  });

  it("🔑 la MISMA fila, ya traída de Switch, SÍ avisa — ésa es toda la diferencia", async () => {
    await correr({ articulos: [ART()], fichas: [{ ...FILA_SIN_FICHA, ficha_at: FICHA_AT }] });
    expect(espias.enviarSistema).toHaveBeenCalledTimes(1);
    expect(espias.enviarSistema.mock.calls[0][0]).toContain("(vacío)");
  });

  it("🔴 el sync LEE ficha_at — sin esa columna la distinción no existe", async () => {
    await correr({ articulos: [ART()], fichas: [FILA_SIN_FICHA] });
    const sel = espias.selects.find((s) => s.startsWith("switch_articulo_info:"))!;
    expect(sel).toContain("ficha_at");
  });
});
