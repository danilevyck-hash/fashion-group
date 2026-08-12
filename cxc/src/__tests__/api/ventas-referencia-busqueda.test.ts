// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del route /api/ventas/referencia — UNA SOLA RESOLUCIÓN DE BÚSQUEDA.
//
// 🩸 EL BUG (12-ago-2026): con VARIOS códigos la búsqueda era `.in()` EXACTO y
// con UNO era prefijo. Daniel pegó su lista real de modelos (el código real
// lleva el color al final: `4D5029G` → `4D5029G002`) y el modo pedido contestó
// "No encontré los códigos … ni en ventas ni en compras" para TODOS — mientras
// `4D5029G` buscado solo devolvía su tarjeta perfecta. Acá se llama al handler
// REAL con cookie firmada, contra un doble en memoria de PostgREST que entiende
// `in` / `like` / `or(...)` — si alguien devuelve la búsqueda múltiple al match
// exacto, la lista real de Daniel vuelve a dar 0 y esto se pone ROJO.
//
// También el gate de roles: admin/vendedor/bodega entran; vendedor/bodega
// reciben `margenVisible: false` (Daniel: *"quita margen, lo demas dejalo"*).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import type { ComprasApiResp } from "@/lib/ventas/compras";

// La lista REAL que pegó Daniel, tal cual (duplicados y guiones incluidos).
const LISTA_REAL_DANIEL =
  "4D5029G 4D5029G 4D5077G 4D5077G 4D5077G- 4D5173G 4D5173G 4D5175G 4D5175G 4D5175G 4D5179G 4D5179G 4D5179G " +
  "4D5213G 4D5213G 4D5214G 4D5214G 4D5221G 4D5221G 4D5222G 4D5223G 4D5223G 4D5228G 4D5228G 4D5231G 4D5231G " +
  "4D5231G 4D5233G 4D5234G 4D5235G 4G5004G 4G5004G 4G5004G 4G5020G 4G5032G 4G5032G 4G5032G 4G5032G 4G5002G- " +
  "4G5002G- 4D4036G 4D1060G- 4D1138G- 4D1062G 4D1063G- 4D1454G 4D1455G 4D1440G";

// Lo que EXISTE en producción para esa lista (medido con
// scripts/_diag-referencia-guiones.ts el 12-ago-2026): 6 modelos → 21 colores.
const COLORES_REALES: Record<string, string[]> = {
  "4D5029G": ["4D5029G002"],
  "4D5077G": ["4D5077G001", "4D5077G110", "4D5077G460", "4D5077G700"],
  "4G5004G": [
    "4G5004G001", "4G5004G030", "4G5004G110", "4G5004G202", "4G5004G301",
    "4G5004G401", "4G5004G541", "4G5004G603", "4G5004G801",
  ],
  "4G5032G": ["4G5032G211"],
  "4G5002G": ["4G5002G001", "4G5002G034", "4G5002G100", "4G5002G460"],
  "4D1062G": ["4D1062G001", "4D1062G200"],
};
const NO_EXISTEN = [
  "4D5173G", "4D5175G", "4D5179G", "4D5213G", "4D5214G", "4D5221G", "4D5222G",
  "4D5223G", "4D5228G", "4D5231G", "4D5233G", "4D5234G", "4D5235G", "4G5020G",
  "4D4036G", "4D1060G", "4D1138G", "4D1063G", "4D1454G", "4D1455G", "4D1440G",
];

// ─── Doble en memoria de PostgREST ───────────────────────────────────────────
// Entiende lo que el route usa: in / like / ilike / or("col.like.PAT*"),
// order (no-op: el orden no se asierta acá), range y count exact.

const { TABLES } = vi.hoisted(() => {
  const info = (codigo: string, existencia: number) => ({
    empresa_key: "vistana",
    codigo,
    descripcion: `DESC ${codigo}`,
    existencia,
    precio_etiqueta: 27,
    synced_at: "2026-08-12T04:30:00.000Z",
  });
  const venta = (codigo: string, fecha: string, cantidad: number, montoPorU = 20) => ({
    id: `${codigo}-${fecha}`,
    empresa_key: "vistana",
    fecha,
    codigo,
    descripcion: `DESC ${codigo}`,
    tipo: "FA",
    cantidad_total: cantidad,
    venta_total: cantidad * montoPorU,
  });
  const ingreso = (codigo: string, fecha: string, cantidad: number) => ({
    empresa_key: "vistana",
    fecha,
    n_interno: `ING-${codigo}`,
    linea: 1,
    proveedor: "PROV",
    codigo_articulo: codigo,
    articulo: `DESC ${codigo}`,
    precio: 27,
    cantidad,
    costo_fob: 15,
    costo_cif: 16.5,
    costo_sin_desglosar: null,
    fob_confiable: true,
  });

  const todos = Object.values({
    "4D5029G": ["4D5029G002"],
    "4D5077G": ["4D5077G001", "4D5077G110", "4D5077G460", "4D5077G700"],
    "4G5004G": [
      "4G5004G001", "4G5004G030", "4G5004G110", "4G5004G202", "4G5004G301",
      "4G5004G401", "4G5004G541", "4G5004G603", "4G5004G801",
    ],
    "4G5032G": ["4G5032G211"],
    "4G5002G": ["4G5002G001", "4G5002G034", "4G5002G100", "4G5002G460"],
    "4D1062G": ["4D1062G001", "4D1062G200"],
  }).flat();

  return {
    TABLES: {
      // La tarjeta real de Daniel: 4D5029G002 · Compré 36 · Vendí 6 · Quedan 30.
      switch_articulo_diario: [
        venta("4D5029G002", "2026-05-15", 6),
        ...todos.filter((c) => c !== "4D5029G002").map((c) => venta(c, "2026-04-10", 3)),
      ],
      switch_ingresos_mercancia: [
        ingreso("4D5029G002", "2026-02-19", 36),
        ...todos.filter((c) => c !== "4D5029G002").map((c) => ingreso(c, "2026-01-15", 24)),
      ],
      switch_articulo_info: [
        info("4D5029G002", 30),
        ...todos.filter((c) => c !== "4D5029G002").map((c) => info(c, 21)),
      ],
    } as Record<string, Record<string, unknown>[]>,
  };
});

vi.mock("@/lib/supabase-server", () => {
  const likeARegex = (pat: string, flags = "") =>
    new RegExp(
      "^" +
        pat
          .replace(/[.+?^${}()|[\]\\]/g, (c) => "\\" + c)
          .replace(/%/g, ".*")
          .replace(/\*/g, ".*")
          .replace(/_/g, ".") +
        "$",
      flags,
    );

  function builder(tabla: string) {
    const filtros: ((r: Record<string, unknown>)  => boolean)[] = [];
    let contar = false;
    let head = false;
    let rango: [number, number] | null = null;

    const self = {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        contar = opts?.count === "exact";
        head = opts?.head === true;
        return self;
      },
      in(col: string, vals: string[]) {
        filtros.push((r) => vals.includes(String(r[col])));
        return self;
      },
      like(col: string, pat: string) {
        const re = likeARegex(pat);
        filtros.push((r) => re.test(String(r[col])));
        return self;
      },
      ilike(col: string, pat: string) {
        const re = likeARegex(pat, "i");
        filtros.push((r) => re.test(String(r[col] ?? "")));
        return self;
      },
      // La gramática de PostgREST que genera el route: "col.like.PAT*,col.like.PAT*"
      or(condiciones: string) {
        const res = condiciones.split(",").map((c) => {
          const [col, op, ...resto] = c.split(".");
          if (op !== "like") throw new Error(`or() de prueba solo entiende like: ${c}`);
          return { col, re: likeARegex(resto.join(".")) };
        });
        filtros.push((r) => res.some(({ col, re }) => re.test(String(r[col]))));
        return self;
      },
      order() {
        return self;
      },
      range(a: number, b: number) {
        rango = [a, b];
        return self;
      },
      then(resolve: (v: { data: unknown[] | null; count: number | null; error: null }) => void) {
        const filas = (TABLES[tabla] ?? []).filter((r) => filtros.every((f) => f(r)));
        const data = head ? null : rango ? filas.slice(rango[0], rango[1] + 1) : filas;
        resolve({ data, count: contar ? filas.length : null, error: null });
      },
    };
    return self;
  }

  return { supabaseServer: { from: (t: string) => builder(t) } };
});

// El handler REAL, importado después del mock.
import { GET } from "@/app/api/ventas/referencia/route";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-referencia";
});
afterAll(() => {
  process.env.SESSION_SECRET = SECRET_PREV;
});

function req(q: string, role: string | null = "admin"): NextRequest {
  const headers: Record<string, string> = {};
  if (role) {
    const cookie = signSession({ role, userId: "u1", userName: "test", sessionToken: "t1" });
    headers.cookie = `cxc_session=${cookie}`;
  }
  return new NextRequest(`https://fashiongr.com/api/ventas/referencia?q=${encodeURIComponent(q)}`, { headers });
}

async function buscar(q: string, role: string | null = "admin") {
  const res = await GET(req(q, role));
  return { status: res.status, body: (await res.json()) as ComprasApiResp & { error?: string } };
}

describe("la lista REAL de Daniel — el caso que reprodujo el bug", () => {
  it("🔴 devuelve UNA FILA POR COLOR (21) y NO 'no encontré' para todos", async () => {
    const { status, body } = await buscar(LISTA_REAL_DANIEL);
    expect(status).toBe(200);
    const codigos = body.articulos.map((a) => a.codigo).sort();
    expect(codigos).toEqual(Object.values(COLORES_REALES).flat().sort());
    expect(body.articulos).toHaveLength(21);
  });

  it("🔴 no encontrados = SOLO los 21 modelos que de verdad no están, en el orden pegado", async () => {
    const { body } = await buscar(LISTA_REAL_DANIEL);
    expect(body.noEncontrados).toEqual(NO_EXISTEN);
    // La mutación del bug: con match exacto, TODOS (27) saldrían acá.
    for (const modelo of Object.keys(COLORES_REALES)) {
      expect(body.noEncontrados).not.toContain(modelo);
    }
  });

  it("🔴 los duplicados y el guión final se resuelven en silencio (sin 'descartados')", async () => {
    const { body } = await buscar(LISTA_REAL_DANIEL);
    expect((body as { descartados?: number }).descartados).toBeUndefined();
    // 4D5077G- y 4D5077G eran el mismo pedido; los colores salen UNA vez.
    const de5077 = body.articulos.filter((a) => a.codigo.startsWith("4D5077G"));
    expect(de5077).toHaveLength(4);
  });
});

describe("UNA sola resolución para un código y para cincuenta", () => {
  it("un código solo sigue trayendo el modelo entero — la tarjeta de 4D5029G queda IDÉNTICA", async () => {
    const { body } = await buscar("4D5029G");
    expect(body.articulos).toHaveLength(1);
    const a = body.articulos[0];
    expect(a.codigo).toBe("4D5029G002");
    // La tarjeta que Daniel vio perfecta: Compré 36 · Vendí 6 · Quedan 30.
    expect(a.cuadre.comprado).toBe(36);
    expect(a.cuadre.vendido).toBe(6);
    expect(a.existencia).toBe(30);
    expect(body.noEncontrados).toEqual([]);
  });

  it("🔴 el MISMO artículo sale idéntico buscado solo o dentro de la lista — la prueba de la resolución única", async () => {
    const solo = (await buscar("4D5029G")).body.articulos.find((a) => a.codigo === "4D5029G002");
    const enLista = (await buscar(LISTA_REAL_DANIEL)).body.articulos.find((a) => a.codigo === "4D5029G002");
    expect(enLista).toEqual(solo);
  });

  it("un código CON color pegado tal cual también se encuentra (es prefijo de sí mismo)", async () => {
    const { body } = await buscar("4D5029G002 4D5077G110");
    expect(body.articulos.map((a) => a.codigo).sort()).toEqual(["4D5029G002", "4D5077G110"]);
    expect(body.noEncontrados).toEqual([]);
  });

  it("un solo código inexistente sigue diciendo 'no encontré' — no cambió", async () => {
    const { body } = await buscar("4D5173G");
    expect(body.articulos).toEqual([]);
    expect(body.noEncontrados).toEqual(["4D5173G"]);
  });
});

describe("roles — Daniel: 'habilita referencia para los vendedores y bodega' / 'quita margen, lo demas dejalo'", () => {
  it("admin ve margen (margenVisible: true)", async () => {
    const { status, body } = await buscar("4D5029G", "admin");
    expect(status).toBe(200);
    expect(body.margenVisible).toBe(true);
  });

  it("🔴 vendedor y bodega entran, y la respuesta dice margenVisible: false", async () => {
    for (const rol of ["vendedor", "bodega"]) {
      const { status, body } = await buscar("4D5029G", rol);
      expect(status, rol).toBe(200);
      expect(body.margenVisible, rol).toBe(false);
      // Lo demás se queda: compras con costos, ventas, stock.
      expect(body.articulos[0].compras[0].costos.cif).toBe(16.5);
      expect(body.articulos[0].existencia).toBe(30);
    }
  });

  it("secretaria y contabilidad NO entran (403); sin sesión, 401", async () => {
    expect((await buscar("4D5029G", "secretaria")).status).toBe(403);
    expect((await buscar("4D5029G", "contabilidad")).status).toBe(403);
    expect((await buscar("4D5029G", null)).status).toBe(401);
  });
});
