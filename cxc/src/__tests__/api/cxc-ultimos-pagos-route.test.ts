// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de /api/cxc/ultimos-pagos — los últimos 3 pagos por empresa en el
// CXC DEL GRUPO.
//
// Lo que existe para cazar:
//
//  1. 🔴 QUE BOSTON NO ENTRE. `switch_recibos` guarda los recibos de las 8
//     empresas en la MISMA tabla, y un código de cliente se repite entre
//     empresas. La consulta tiene que llevar `empresa_key` en la MISMA cadena,
//     y esa empresa tiene que ser una de las 6 del grupo. Se prueba por
//     CONDUCTA: el mock tiene recibos de Boston y de American Classic para el
//     mismo código, más nuevos que los del grupo; si el filtro se cae, salen
//     en la respuesta y el test se pone rojo.
//  2. Que sean 3 por EMPRESA con `.limit(3)` en el servidor — no traer todo
//     y recortar (db-max-rows corta en silencio), ni 3 en total.
//  3. Que una retención y un recibo de $0,00 NO cuenten como pago (el bug de
//     "$0.00 hace 15 días").
//  4. Que un vendedor solo vea su empresa asociada, y nada si esa empresa no
//     es del grupo.
//  5. Que la ruta no comparta consulta con la de Boston (estático).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";

type Fila = Record<string, unknown>;

const estado = vi.hoisted(() => ({
  recibos: [] as Record<string, unknown>[],
  consultas: [] as Record<string, unknown>[],
  asociada: null as string | null,
}));

vi.mock("@/lib/supabase-server", () => {
  // Un PostgREST de juguete que APLICA los filtros: así el test mide lo que
  // sale, no solo lo que se pidió.
  const consulta = (tabla: string) => {
    const f: Record<string, unknown> = { tabla };
    const eqs: [string, unknown][] = [];
    const neqs: [string, unknown][] = [];
    let noNulos: string[] = [];
    let orden: { col: string; asc: boolean } | null = null;
    let limite: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { f[`eq:${c}`] = v; eqs.push([c, v]); return q; },
      neq: (c: string, v: unknown) => { f[`neq:${c}`] = v; neqs.push([c, v]); return q; },
      in: (c: string, v: unknown) => { f[`in:${c}`] = v; return q; },
      not: (c: string, op: string, v: unknown) => { f[`not:${c}`] = `${op} ${v}`; if (op === "is" && v === null) noNulos.push(c); return q; },
      order: (c: string, o?: { ascending?: boolean }) => { f.order = c; orden = { col: c, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { f.limit = n; limite = n; return q; },
      maybeSingle: async () => {
        estado.consultas.push({ ...f });
        if (tabla === "fg_users") return { data: { associated_company: estado.asociada }, error: null };
        return { data: null, error: null };
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        estado.consultas.push({ ...f });
        let filas: Fila[] = tabla === "switch_recibos" ? [...estado.recibos] : [];
        for (const [c, v] of eqs) filas = filas.filter((r) => r[c] === v);
        for (const [c, v] of neqs) filas = filas.filter((r) => r[c] !== v);
        for (const c of noNulos) filas = filas.filter((r) => r[c] != null);
        if (orden) {
          const { col, asc } = orden;
          filas.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
        }
        if (limite != null) filas = filas.slice(0, limite);
        return Promise.resolve({ data: filas, error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { supabaseServer: { from: (tabla: string) => consulta(tabla) } };
});

const { GET } = await import("@/app/api/cxc/ultimos-pagos/route");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-ultimos-pagos"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const recibo = (empresa_key: string, fecha: string, total: number, extra: Fila = {}): Fila => ({
  empresa_key, cliente_codigo: "D-25", cliente_switch_id: 3, fecha,
  fecha_creacion: `${fecha}T12:00:00+00:00`, total, es_retencion: false, ...extra,
});

beforeEach(() => {
  estado.consultas.length = 0;
  estado.asociada = null;
  estado.recibos = [
    // Fashion Wear: 5 pagos reales (el caso D-25 medido en producción), una
    // retención y un recibo de $0,00 MÁS NUEVOS que todos.
    recibo("fashion_wear", "2026-09-01", 0),
    recibo("fashion_wear", "2026-09-01", 950, { es_retencion: true, fecha_creacion: "2026-09-01T13:00:00+00:00" }),
    recibo("fashion_wear", "2026-08-20", 63592.15),
    recibo("fashion_wear", "2026-07-22", 187651.51),
    recibo("fashion_wear", "2026-06-29", 117777.33),
    recibo("fashion_wear", "2026-05-28", 16750.1),
    recibo("fashion_wear", "2026-05-28", 72225.62, { fecha_creacion: "2026-05-28T11:00:00+00:00" }),
    // Vistana: uno solo.
    recibo("vistana", "2026-04-02", 500),
    // 🔴 Boston y ACS con el MISMO código, más nuevos que todo lo del grupo.
    recibo("confecciones_boston", "2026-09-02", 163.71),
    recibo("confecciones_boston", "2026-09-02", 2220.08, { fecha_creacion: "2026-09-02T13:00:00+00:00" }),
    recibo("american_classic", "2026-09-02", 99),
    // Un recibo sin fecha (no debería existir, pero la columna admite NULL).
    recibo("vistana", null as unknown as string, 123, { fecha_creacion: null }),
  ];
});

function req(url: string, role: string | null = "admin", userId = "u1") {
  const headers: Record<string, string> = {};
  if (role) headers.cookie = `cxc_session=${signSession({ role, userId, userName: "test", sessionToken: "t1" })}`;
  return new NextRequest(`https://fashiongr.com${url}`, { headers });
}
const lecturasRecibos = () => estado.consultas.filter((c) => c.tabla === "switch_recibos");

describe("🔴 Boston NUNCA entra al CXC del grupo", () => {
  it("la respuesta trae SOLO empresas del grupo aunque Boston y ACS tengan el mismo código", async () => {
    const res = await GET(req("/api/cxc/ultimos-pagos?codigo=D-25"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.porEmpresa).sort()).toEqual(["fashion_wear", "vistana"]);
    expect(body.porEmpresa.confecciones_boston).toBeUndefined();
    expect(body.porEmpresa.american_classic).toBeUndefined();
    // Y ni por VALOR: el 2-sep-2026 solo existe en Boston y ACS en el mock.
    const fechas = Object.values(body.porEmpresa as Record<string, { fecha: string }[]>).flat().map((p) => p.fecha);
    expect(fechas).not.toContain("2026-09-02");
  });

  it("cada lectura de switch_recibos lleva empresa_key EN LA CADENA, y es una de las 6", async () => {
    await GET(req("/api/cxc/ultimos-pagos?codigo=D-25"));
    const lecturas = lecturasRecibos();
    expect(lecturas.length).toBe(CXC_GRUPO_EMPRESA_KEYS.length);
    for (const l of lecturas) {
      expect(l["eq:empresa_key"], "lectura sin empresa_key").toBeDefined();
      expect(CXC_GRUPO_EMPRESA_KEYS as readonly string[]).toContain(l["eq:empresa_key"]);
      expect(l["eq:cliente_codigo"]).toBe("D-25");
    }
    const empresas = lecturas.map((l) => l["eq:empresa_key"]).sort();
    expect(empresas).toEqual([...CXC_GRUPO_EMPRESA_KEYS].sort());
    expect(empresas).not.toContain("confecciones_boston");
    expect(empresas).not.toContain("american_classic");
  });
});

describe("son 3 por EMPRESA, y solo pagos de verdad", () => {
  it("Fashion Wear devuelve sus 3 más recientes, del más nuevo al más viejo", async () => {
    const body = await (await GET(req("/api/cxc/ultimos-pagos?codigo=D-25"))).json();
    expect(body.porEmpresa.fashion_wear).toEqual([
      { fecha: "2026-08-20", monto: 63592.15 },
      { fecha: "2026-07-22", monto: 187651.51 },
      { fecha: "2026-06-29", monto: 117777.33 },
    ]);
    // Vistana no se queda sin los suyos porque Fashion Wear tenga muchos.
    expect(body.porEmpresa.vistana).toEqual([{ fecha: "2026-04-02", monto: 500 }]);
  });

  it("🔄 el límite lo pone el SERVIDOR en cada lectura, y ya no son 3 (5-sep-2026)", async () => {
    // El bloque pasó a agruparse POR FECHA —las 3 últimas fechas en que el
    // cliente pagó, con el total del día y en qué empresas— y para eso hay que
    // juntar los recibos de las 6 antes de agrupar. Con `.limit(3)` por empresa
    // eso puede MENTIR: un cliente con 3 recibos del MISMO día en Vistana
    // taparía con esa única fecha las otras dos que sí existen.
    //
    // ⚠️ Lo que este caso protege NO cambió: el corte lo hace el SERVIDOR, no
    // el navegador — nunca se traen todos los recibos del cliente para recortar
    // después. 30 por empresa son 180 filas, muy por debajo del tope de 1.000
    // que corta EN SILENCIO, y cubren con cinco veces de margen al cliente con
    // más recibos en un día (D-25, con 6).
    await GET(req("/api/cxc/ultimos-pagos?codigo=D-25"));
    for (const l of lecturasRecibos()) {
      expect(l.limit).toBe(30);
      expect(l.limit).toBeLessThan(1000);
      expect(l.order).toBe("fecha_creacion");
    }
  });

  it("una retención o un recibo de $0,00 no es un pago, aunque sea el más nuevo", async () => {
    const body = await (await GET(req("/api/cxc/ultimos-pagos?codigo=D-25"))).json();
    const fw = body.porEmpresa.fashion_wear as { fecha: string; monto: number }[];
    expect(fw.some((p) => p.monto === 0)).toBe(false);
    expect(fw.some((p) => p.fecha === "2026-09-01")).toBe(false);
    for (const l of lecturasRecibos()) {
      expect(l["eq:es_retencion"]).toBe(false);
      expect(l["neq:total"]).toBe(0);
    }
  });

  it("un recibo sin fecha no se muestra (no hay línea que escribir)", async () => {
    const body = await (await GET(req("/api/cxc/ultimos-pagos?codigo=D-25"))).json();
    expect((body.porEmpresa.vistana as { fecha: string }[]).some((p) => p.fecha === "null")).toBe(false);
  });

  it("una empresa sin pagos no viaja: la pantalla dice «Sin pagos registrados»", async () => {
    const body = await (await GET(req("/api/cxc/ultimos-pagos?codigo=D-25"))).json();
    expect(body.porEmpresa.joystep).toBeUndefined();
  });
});

describe("quién puede pedirlo", () => {
  it("sin sesión → 401 · bodega → 403 · gerente_boston → 403 (es el CXC del grupo)", async () => {
    expect((await GET(req("/api/cxc/ultimos-pagos?codigo=D-25", null))).status).toBe(401);
    expect((await GET(req("/api/cxc/ultimos-pagos?codigo=D-25", "bodega"))).status).toBe(403);
    expect((await GET(req("/api/cxc/ultimos-pagos?codigo=D-25", "gerente_boston"))).status).toBe(403);
  });

  it("sin código → 400 y no toca la base", async () => {
    expect((await GET(req("/api/cxc/ultimos-pagos"))).status).toBe(400);
    expect(lecturasRecibos().length).toBe(0);
  });

  it("un vendedor ve SOLO su empresa asociada (la de la base, no la cookie)", async () => {
    estado.asociada = "vistana";
    const body = await (await GET(req("/api/cxc/ultimos-pagos?codigo=D-25", "vendedor"))).json();
    expect(Object.keys(body.porEmpresa)).toEqual(["vistana"]);
    const lecturas = lecturasRecibos();
    expect(lecturas.length).toBe(1);
    expect(lecturas[0]["eq:empresa_key"]).toBe("vistana");
  });

  it("un vendedor asociado a una empresa que no es del grupo no ve nada — nunca se amplía a «todas»", async () => {
    estado.asociada = "confecciones_boston";
    const body = await (await GET(req("/api/cxc/ultimos-pagos?codigo=D-25", "vendedor"))).json();
    expect(body.porEmpresa).toEqual({});
    expect(lecturasRecibos().length).toBe(0);
  });
});

describe("estático — la consulta es propia y acotada", () => {
  const RAIZ = path.resolve(__dirname, "../../..");
  const src = fs.readFileSync(path.join(RAIZ, "src/app/api/cxc/ultimos-pagos/route.ts"), "utf8");

  it("lee switch_recibos con .eq(\"empresa_key\", …) en la misma cadena y las empresas salen de CXC_GRUPO_EMPRESA_KEYS", () => {
    expect(src).toContain('.from("switch_recibos")');
    const desde = src.indexOf('.from("switch_recibos")');
    const bloque = src.slice(desde, src.indexOf(".limit(", desde));
    expect(bloque).toMatch(/\.eq\(\s*"empresa_key"/);
    expect(src).toContain("CXC_GRUPO_EMPRESA_KEYS");
    expect(src).not.toContain('"confecciones_boston"');
  });

  it("no importa nada de la ruta de Boston ni comparte con ella una función de lectura", () => {
    expect(src).not.toMatch(/api\/cxc\/boston/);
    // El único módulo compartido es el de TEXTO, y ese no consulta nada.
    const texto = fs.readFileSync(path.join(RAIZ, "src/lib/cxc/ultimos-pagos.ts"), "utf8");
    expect(texto).not.toMatch(/\.from\(|supabase/);
  });
});
