// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de /api/cxc/boston/ultimos-pagos — la OTRA dirección del mismo
// invariante: la cartera de Boston no trae pagos del grupo.
//
//  1. 🔴 Los ids de Switch se REPITEN entre empresas: el cliente 3 de Boston
//     es otro cliente en Vistana. El mock pone un pago de Vistana con el mismo
//     id, MÁS NUEVO; si el `.eq("empresa_key", "confecciones_boston")` se cae,
//     sale en la respuesta y el test se pone rojo.
//  2. `.limit(3)` en el servidor, sin retenciones ni recibos de $0,00.
//  3. Quién puede pedirlo = `rolesBoston()`: el vendedor del grupo, no.
//  4. Estático: no importa la ruta del grupo ni comparte una función de
//     lectura con ella.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

type Fila = Record<string, unknown>;

const estado = vi.hoisted(() => ({
  recibos: [] as Record<string, unknown>[],
  consultas: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase-server", () => {
  const consulta = (tabla: string) => {
    const f: Record<string, unknown> = { tabla };
    const eqs: [string, unknown][] = [];
    const neqs: [string, unknown][] = [];
    const noNulos: string[] = [];
    let orden: { col: string; asc: boolean } | null = null;
    let limite: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { f[`eq:${c}`] = v; eqs.push([c, v]); return q; },
      neq: (c: string, v: unknown) => { f[`neq:${c}`] = v; neqs.push([c, v]); return q; },
      in: (c: string, v: unknown) => { f[`in:${c}`] = v; return q; },
      not: (c: string, op: string, v: unknown) => { if (op === "is" && v === null) noNulos.push(c); return q; },
      order: (c: string, o?: { ascending?: boolean }) => { f.order = c; orden = { col: c, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { f.limit = n; limite = n; return q; },
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

const { GET } = await import("@/app/api/cxc/boston/ultimos-pagos/route");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-boston-ultimos-pagos"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const recibo = (empresa_key: string, fecha: string, total: number, extra: Fila = {}): Fila => ({
  empresa_key, cliente_switch_id: 3, cliente_codigo: "1", fecha,
  fecha_creacion: `${fecha}T12:00:00+00:00`, total, es_retencion: false, ...extra,
});

beforeEach(() => {
  estado.consultas.length = 0;
  estado.recibos = [
    // Boston, cliente 3 (ACCIONA en producción): 4 pagos, una retención y un $0 más nuevos.
    recibo("confecciones_boston", "2026-09-02", 0),
    recibo("confecciones_boston", "2026-09-02", 50, { es_retencion: true, fecha_creacion: "2026-09-02T13:00:00+00:00" }),
    recibo("confecciones_boston", "2026-08-28", 2220.08),
    recibo("confecciones_boston", "2026-07-01", 1000),
    recibo("confecciones_boston", "2026-06-28", 1300),
    recibo("confecciones_boston", "2026-03-12", 1700),
    // 🔴 El MISMO id 3 en Vistana y en ACS, más nuevos que todo lo de Boston.
    recibo("vistana", "2026-09-03", 63592.15, { cliente_codigo: "D-25" }),
    recibo("american_classic", "2026-09-03", 99),
    // Otro cliente de Boston: no se mezcla.
    recibo("confecciones_boston", "2026-09-01", 14.45, { cliente_switch_id: 5434 }),
  ];
});

function req(url: string, role: string | null = "admin") {
  const headers: Record<string, string> = {};
  if (role) headers.cookie = `cxc_session=${signSession({ role, userId: "u1", userName: "test", sessionToken: "t1" })}`;
  return new NextRequest(`https://fashiongr.com${url}`, { headers });
}
const lecturas = () => estado.consultas.filter((c) => c.tabla === "switch_recibos");

describe("🔴 la cartera de Boston no trae pagos del grupo", () => {
  it("con el mismo id en Vistana y ACS, solo salen los de Boston", async () => {
    const res = await GET(req("/api/cxc/boston/ultimos-pagos?cliente=3"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagos).toEqual([
      { fecha: "2026-08-28", monto: 2220.08 },
      { fecha: "2026-07-01", monto: 1000 },
      { fecha: "2026-06-28", monto: 1300 },
    ]);
    expect((body.pagos as { fecha: string }[]).some((p) => p.fecha === "2026-09-03")).toBe(false);
  });

  it("UNA lectura, con empresa_key = confecciones_boston en la cadena, limit 3, sin retenciones ni $0", async () => {
    await GET(req("/api/cxc/boston/ultimos-pagos?cliente=3"));
    const ls = lecturas();
    expect(ls.length).toBe(1);
    expect(ls[0]["eq:empresa_key"]).toBe("confecciones_boston");
    expect(ls[0]["eq:cliente_switch_id"]).toBe(3);
    expect(ls[0].limit).toBe(3);
    expect(ls[0].order).toBe("fecha_creacion");
    expect(ls[0]["eq:es_retencion"]).toBe(false);
    expect(ls[0]["neq:total"]).toBe(0);
  });

  it("un cliente de Boston sin pagos devuelve la lista vacía (la pantalla dice «Sin pagos registrados»)", async () => {
    const body = await (await GET(req("/api/cxc/boston/ultimos-pagos?cliente=999"))).json();
    expect(body.pagos).toEqual([]);
  });
});

describe("quién puede pedirlo — los mismos que ven la cartera de Boston", () => {
  // 🔁 CAMBIÓ DE DIRECCIÓN el 5-sep-2026: `secretaria` pasó de la lista de los
  // que SÍ a la de los que NO. La auditoría de permisos midió que Ángela y
  // Andrea veían la cartera de Boston **sin tener el módulo `cxc` ni el
  // `boston`**: entraban por su ROL. Daniel, textual: *«no, quita boston a las
  // secretarias»*. La regla que este test protege no cambió —quien puede pedir
  // los últimos pagos es exactamente quien ve la cartera, ni uno más— y por eso
  // sigue leyendo de `ROLES_BOSTON`, la fuente única.
  it("admin y gerente_boston sí; secretaria, vendedor y bodega no; sin sesión 401", async () => {
    for (const rol of ["admin", "gerente_boston"]) {
      expect((await GET(req("/api/cxc/boston/ultimos-pagos?cliente=3", rol))).status, rol).toBe(200);
    }
    for (const rol of ["secretaria", "vendedor", "bodega", "contabilidad"]) {
      expect((await GET(req("/api/cxc/boston/ultimos-pagos?cliente=3", rol))).status, rol).toBe(403);
    }
    expect((await GET(req("/api/cxc/boston/ultimos-pagos?cliente=3", null))).status).toBe(401);
  });

  it("sin cliente, o con uno que no es un id → 400 y no toca la base", async () => {
    expect((await GET(req("/api/cxc/boston/ultimos-pagos"))).status).toBe(400);
    expect((await GET(req("/api/cxc/boston/ultimos-pagos?cliente=D-25"))).status).toBe(400);
    expect((await GET(req("/api/cxc/boston/ultimos-pagos?cliente=0"))).status).toBe(400);
    expect(lecturas().length).toBe(0);
  });
});

describe("estático — dos rutas, dos lecturas, cero funciones compartidas", () => {
  const RAIZ = path.resolve(__dirname, "../../..");
  const boston = fs.readFileSync(path.join(RAIZ, "src/app/api/cxc/boston/ultimos-pagos/route.ts"), "utf8");
  const grupo = fs.readFileSync(path.join(RAIZ, "src/app/api/cxc/ultimos-pagos/route.ts"), "utf8");

  it("la de Boston lee switch_recibos ella misma, acotada al literal confecciones_boston", () => {
    expect(boston).toContain('.from("switch_recibos")');
    const desde = boston.indexOf('.from("switch_recibos")');
    const bloque = boston.slice(desde, boston.indexOf(".limit(", desde));
    expect(bloque).toMatch(/\.eq\(\s*"empresa_key",\s*EMPRESA_BOSTON\s*\)/);
    expect(boston).toContain('const EMPRESA_BOSTON = "confecciones_boston"');
    expect(boston).toContain("rolesBoston()");
  });

  it("ninguna importa a la otra, y ningún módulo compartido consulta la base", () => {
    expect(boston).not.toMatch(/from "@\/app\/api\/cxc\/ultimos-pagos/);
    expect(grupo).not.toMatch(/from "@\/app\/api\/cxc\/boston/);
    // Lo que las dos importan de `lib/cxc/ultimos-pagos` es texto y una constante.
    const texto = fs.readFileSync(path.join(RAIZ, "src/lib/cxc/ultimos-pagos.ts"), "utf8");
    expect(texto).not.toMatch(/\.from\(|supabase|fetch\(/);
    // Y las dos pantallas usan hooks distintos contra rutas distintas.
    const hookGrupo = fs.readFileSync(path.join(RAIZ, "src/app/cxc/hooks/useUltimosPagosGrupo.ts"), "utf8");
    const hookBoston = fs.readFileSync(path.join(RAIZ, "src/components/cxc/useUltimosPagosBoston.ts"), "utf8");
    expect(hookGrupo).toContain("/api/cxc/ultimos-pagos?codigo=");
    expect(hookGrupo).not.toContain("/api/cxc/boston/");
    expect(hookBoston).toContain("/api/cxc/boston/ultimos-pagos?cliente=");
  });
});
