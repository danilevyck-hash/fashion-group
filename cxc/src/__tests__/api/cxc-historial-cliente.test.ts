// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del historial del cliente (19-nov-2026, `HISTORIAL_CLIENTE_2026_11`).
//
//  1. 🔴 La empresa la valida el SERVIDOR: solo una de las 6 del grupo (Boston y
//     Multifashion → 400); el vendedor, solo la suya (403); `gerente_boston`
//     no entra (403). Un recibo o una factura de otra empresa con el MISMO
//     código no sale.
//  2. 🩸 Un cliente con MÁS de 1.000 recibos (D-151 tiene 1.714) y más de 1.000
//     facturas sale COMPLETO: el mock corta cada respuesta en 1.000 filas, como
//     `db-max-rows` en producción.
//  3. Lo puro: pagos, un renglón por día; compras, ventana de 7 días por
//     empresa y la nota de crédito aparte como devolución; menos de $1 no
//     cuenta; la nota de débito no es compra.
//  4. El interruptor nace en `false`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { DIAS_DE_UNA_COMPRA, historialDeCompras, historialDePagos } from "@/lib/cxc/historial-cliente";

type Fila = Record<string, unknown>;
const TOPE = 1000;

const db = vi.hoisted(() => ({
  tablas: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("@/lib/cxc/historial-cliente", async (original) => ({
  ...(await original<typeof import("@/lib/cxc/historial-cliente")>()),
  HISTORIAL_CLIENTE_2026_11: true,
}));

vi.mock("@/lib/supabase-server", () => {
  const consulta = (tabla: string) => {
    const filtros: ((r: Fila) => boolean)[] = [];
    const ordenes: { col: string; asc: boolean }[] = [];
    let contar = false;
    let rango: [number, number] | null = null;
    const correr = () => {
      let filas = (db.tablas[tabla] ?? []).filter((r) => filtros.every((f) => f(r)));
      const total = filas.length;
      filas = [...filas].sort((a, b) => {
        for (const { col, asc } of ordenes) {
          const x = String(a[col]); const y = String(b[col]);
          if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
      if (rango) filas = filas.slice(rango[0], rango[1] + 1);
      return { data: filas.slice(0, TOPE), error: null, count: contar ? total : null };
    };
    const q: Record<string, unknown> = {
      select: (_c: string, o?: { count?: string }) => { contar = o?.count === "exact"; return q; },
      eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; },
      neq: (c: string, v: unknown) => { filtros.push((r) => r[c] !== v); return q; },
      in: (c: string, v: unknown[]) => { filtros.push((r) => v.includes(r[c])); return q; },
      not: (c: string) => { filtros.push((r) => r[c] != null); return q; },
      or: (expr: string) => {
        const tuplas = [...expr.matchAll(/empresa_key\.eq\.([a-z_]+),cliente_switch_id\.eq\.(\d+)/g)]
          .map((m) => [m[1], Number(m[2])] as const);
        filtros.push((r) => tuplas.some(([e, id]) => r.empresa_key === e && r.cliente_switch_id === id));
        return q;
      },
      order: (c: string, o?: { ascending?: boolean }) => { ordenes.push({ col: c, asc: o?.ascending !== false }); return q; },
      range: (a: number, b: number) => { rango = [a, b]; return q; },
      maybeSingle: () => Promise.resolve({ data: correr().data[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(correr()).then(res, rej),
    };
    return q;
  };
  return { supabaseServer: { from: (t: string) => consulta(t) } };
});

const grupo = await import("@/app/api/cxc/historial/route");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-historial"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

function req(url: string, role = "admin") {
  const cookie = `cxc_session=${signSession({ role, userId: "u1", userName: "t", sessionToken: "t1" })}`;
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie } });
}

let n = 0;
const id = () => `id-${String(++n).padStart(6, "0")}`;
/** Fecha distinta por índice: un recibo por día desde 2022-10-01. */
const dia = (i: number) => new Date(Date.UTC(2022, 9, 1) + i * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
  n = 0;
  const recibos: Fila[] = [];
  // 1.200 recibos de D-151 en Vistana, uno por día → 1.200 renglones de $10.
  for (let i = 0; i < 1200; i++) {
    recibos.push({ id: id(), empresa_key: "vistana", cliente_codigo: "D-151", cliente_switch_id: 151, fecha: dia(i), total: 10, es_retencion: false });
  }
  recibos.push(
    // Retención y recibo en cero: no son pagos.
    { id: id(), empresa_key: "vistana", cliente_codigo: "D-151", fecha: dia(5), total: 99, es_retencion: true },
    { id: id(), empresa_key: "vistana", cliente_codigo: "D-151", fecha: dia(6), total: 0, es_retencion: false },
    // 🔴 Boston con el MISMO código y el MISMO id: nunca entra al grupo.
    { id: id(), empresa_key: "confecciones_boston", cliente_codigo: "D-151", cliente_switch_id: 151, fecha: "2026-11-18", total: 777, es_retencion: false },
    // Multifashion, tampoco.
    { id: id(), empresa_key: "american_classic", cliente_codigo: "D-151", cliente_switch_id: 151, fecha: "2026-11-18", total: 555, es_retencion: false },
  );
  const facturas: Fila[] = [];
  for (let i = 0; i < 1100; i++) {
    facturas.push({ id: id(), empresa_key: "fashion_wear", cliente_switch_id: 40, switch_factura_id: 5000 + i, secuencial: `11-00000${5000 + i}`, tipo_comprobante: "Factura", fecha: `${dia(i)}T15:00:00+00:00`, total: 100 });
  }
  facturas.push(
    { id: id(), empresa_key: "fashion_wear", cliente_switch_id: 40, switch_factura_id: 9001, secuencial: "13-000000901", tipo_comprobante: "Nota de Crédito", fecha: `${dia(0)}T16:00:00+00:00`, total: 30 },
    // 🔴 El 40 de Vistana es OTRO cliente: la tupla (empresa, id) lo deja afuera.
    { id: id(), empresa_key: "vistana", cliente_switch_id: 40, switch_factura_id: 7, secuencial: "11-000000007", tipo_comprobante: "Factura", fecha: "2026-11-18T15:00:00+00:00", total: 1 },
    // 🔴 Boston con un puente al MISMO código.
    { id: id(), empresa_key: "confecciones_boston", cliente_switch_id: 151, switch_factura_id: 8, secuencial: "11-000000008", tipo_comprobante: "Factura", fecha: "2026-11-18T15:00:00+00:00", total: 888 },
  );
  db.tablas = {
    switch_recibos: recibos,
    switch_facturas: facturas,
    switch_clientes: [
      { empresa_key: "fashion_wear", codigo: "D-151", cliente_switch_id: 40 },
      { empresa_key: "confecciones_boston", codigo: "D-151", cliente_switch_id: 151 },
    ],
    fg_users: [{ id: "u1", associated_company: "fashion_wear" }],
  };
});

const cuantas = (meses: { filas: unknown[] }[]) => meses.reduce((s, m) => s + m.filas.length, 0);
const suma = (meses: { total: number }[]) => Math.round(meses.reduce((s, m) => s + m.total, 0) * 100) / 100;

describe("🩸 más de 1.000 filas salen completas", () => {
  it("1.200 recibos → 1.200 días, $12,000, sin retención ni cero", async () => {
    const res = await grupo.GET(req("/api/cxc/historial?codigo=D-151&empresa=vistana&tipo=pagos"));
    expect(res.status).toBe(200);
    const { meses } = await res.json();
    expect(cuantas(meses)).toBe(1200);
    expect(suma(meses)).toBe(12000);
  });

  it("1.100 facturas → todas en alguna compra, $110,000; la NC aparte en devoluciones", async () => {
    const res = await grupo.GET(req("/api/cxc/historial?codigo=D-151&empresa=fashion_wear&tipo=compras"));
    const { meses } = await res.json();
    const filas = meses.flatMap((m: { filas: { clase: string; facturas?: string[] }[] }) => m.filas);
    expect(filas.filter((f: { clase: string }) => f.clase === "compra").reduce((n: number, f: { facturas?: string[] }) => n + (f.facturas?.length ?? 0), 0)).toBe(1100);
    expect(suma(meses)).toBe(110000);
    expect(meses.reduce((s: number, m: { devoluciones: number }) => s + m.devoluciones, 0)).toBe(-30);
  });
});

describe("🔴 el grupo no trae a Boston ni a Multifashion", () => {
  it("pagos: ni los $777 de Boston ni los $555 de Multifashion", async () => {
    const { meses } = await (await grupo.GET(req("/api/cxc/historial?codigo=D-151&empresa=vistana&tipo=pagos"))).json();
    const montos = meses.flatMap((m: { filas: { monto: number }[] }) => m.filas.map((f) => f.monto));
    expect(montos).not.toContain(777);
    expect(montos).not.toContain(555);
    const empresas = new Set(meses.flatMap((m: { filas: { empresas: string[] }[] }) => m.filas.flatMap((f) => f.empresas)));
    expect([...empresas]).toEqual(["vistana"]);
  });

  it("facturas: ni la de Boston (mismo código) ni la del 40 de Vistana", async () => {
    const { meses } = await (await grupo.GET(req("/api/cxc/historial?codigo=D-151&empresa=fashion_wear&tipo=compras"))).json();
    const empresas = new Set(meses.flatMap((m: { filas: { empresa: string }[] }) => m.filas.map((f) => f.empresa)));
    expect([...empresas]).toEqual(["fashion_wear"]);
  });

  it("gerente_boston no entra a la ruta del grupo (403)", async () => {
    const res = await grupo.GET(req("/api/cxc/historial?codigo=D-151&empresa=vistana&tipo=pagos", "gerente_boston"));
    expect(res.status).toBe(403);
  });

});

describe("🔴 la empresa la valida el servidor", () => {
  const status = async (q: string, role = "admin") => (await grupo.GET(req(`/api/cxc/historial?codigo=D-151&tipo=pagos${q}`, role))).status;

  it("Boston, Multifashion, una inventada o ninguna → 400", async () => {
    expect(await status("&empresa=confecciones_boston")).toBe(400);
    expect(await status("&empresa=american_classic")).toBe(400);
    expect(await status("&empresa=otra")).toBe(400);
    expect(await status("")).toBe(400);
  });

  it("el vendedor de Fashion Wear: la suya sí, Vistana no (403)", async () => {
    expect(await status("&empresa=fashion_wear", "vendedor")).toBe(200);
    expect(await status("&empresa=vistana", "vendedor")).toBe(403);
  });

  it("solo la empresa pedida: Vistana no trae lo de Fashion Wear", async () => {
    const { meses } = await (await grupo.GET(req("/api/cxc/historial?codigo=D-151&empresa=vistana&tipo=compras"))).json();
    expect(meses).toEqual([]);
  });

  it("ya no existe una ruta de historial de Boston", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../app/api/cxc/boston/historial/route.ts"))).toBe(false);
  });
});

describe("lo puro", () => {
  it("pagos: un renglón por DÍA con sus empresas, y el total del mes", () => {
    const meses = historialDePagos([
      { fecha: "2026-11-03", monto: 100, empresa: "vistana" },
      { fecha: "2026-11-03", monto: 50, empresa: "fashion_wear" },
      { fecha: "2026-10-20", monto: 25.5, empresa: "vistana" },
    ]);
    expect(meses).toEqual([
      { mes: "2026-11", total: 150, filas: [{ fecha: "2026-11-03", monto: 150, empresas: ["vistana", "fashion_wear"] }] },
      { mes: "2026-10", total: 25.5, filas: [{ fecha: "2026-10-20", monto: 25.5, empresas: ["vistana"] }] },
    ]);
  });

  it("💰 un pago de menos de $1 no se lista", () => {
    const meses = historialDePagos([
      { fecha: "2026-11-03", monto: 0.5, empresa: "vistana" },
      { fecha: "2026-11-02", monto: -0.99, empresa: "vistana" },
      { fecha: "2026-11-01", monto: 1, empresa: "vistana" },
    ]);
    expect(meses).toEqual([{ mes: "2026-11", total: 1, filas: [{ fecha: "2026-11-01", monto: 1, empresas: ["vistana"] }] }]);
  });

});

describe("🔴 una COMPRA: misma empresa, ventana fija de 7 días", () => {
  const fac = (empresa: string, fecha: string, id: number, total = 100, tipo = "Factura") => ({
    empresa_key: empresa, switch_factura_id: id, secuencial: `11-00000${id}`, tipo_comprobante: tipo, fecha: `${fecha}T15:00:00+00:00`, total,
  });
  const compras = (meses: ReturnType<typeof historialDeCompras>) => meses.flatMap((m) => m.filas).filter((f) => f.clase === "compra");

  it("son 7 días", () => expect(DIAS_DE_UNA_COMPRA).toBe(7));

  it("día 0, día 6 y día 7 son la misma compra; el día 8 abre otra", () => {
    const c = compras(historialDeCompras([
      fac("vistana", "2026-09-01", 3087), fac("vistana", "2026-09-07", 3090),
      fac("vistana", "2026-09-08", 3101), fac("vistana", "2026-09-09", 3120),
    ]));
    expect(c).toEqual([
      { clase: "compra", empresa: "vistana", fecha: "2026-09-09", monto: 100, facturas: ["3120"] },
      { clase: "compra", empresa: "vistana", fecha: "2026-09-01", monto: 300, facturas: ["3087", "3090", "3101"] },
    ]);
  });

  it("la ventana es FIJA: se cuenta desde la primera, no desde la última", () => {
    const c = compras(historialDeCompras([
      fac("vistana", "2026-09-01", 1001), fac("vistana", "2026-09-06", 1002), fac("vistana", "2026-09-11", 1003),
    ]));
    expect(c.map((x) => (x.clase === "compra" ? x.facturas : []))).toEqual([["1003"], ["1001", "1002"]]);
  });

  it("dos empresas el mismo día son dos compras", () => {
    const c = compras(historialDeCompras([fac("vistana", "2026-09-01", 1), fac("fashion_wear", "2026-09-01", 2)]));
    expect(c.map((x) => x.empresa).sort()).toEqual(["fashion_wear", "vistana"]);
  });

  it("la nota de crédito queda APARTE: no resta de la compra ni del total del mes", () => {
    const [mes] = historialDeCompras([
      fac("vistana", "2026-11-02", 3224, 200),
      fac("vistana", "2026-11-03", 860, 50, "Nota de Crédito"),
    ]);
    expect(mes.total).toBe(200);
    expect(mes.devoluciones).toBe(-50);
    expect(mes.filas).toEqual([
      { clase: "devolucion", empresa: "vistana", fecha: "2026-11-03", monto: -50, numero: "0860" },
      { clase: "compra", empresa: "vistana", fecha: "2026-11-02", monto: 200, facturas: ["3224"] },
    ]);
  });

  it("💰 la factura de $0.01 no es compra NI abre la ventana", () => {
    // Sin el filtro, el 1-sep abriría la ventana y el 9-sep sería otra compra.
    const c = compras(historialDeCompras([
      fac("active_shoes", "2026-09-01", 352, 0.01), fac("active_shoes", "2026-09-05", 400), fac("active_shoes", "2026-09-09", 401),
    ]));
    expect(c).toEqual([{ clase: "compra", empresa: "active_shoes", fecha: "2026-09-05", monto: 200, facturas: ["0400", "0401"] }]);
  });

  it("💰 una nota de crédito de menos de $1 no es devolución", () => {
    const meses = historialDeCompras([fac("vistana", "2026-11-03", 861, 0.5, "Nota de Crédito")]);
    expect(meses).toEqual([]);
  });

  it("la nota de débito no entra: ni compra ni devolución", () => {
    const meses = historialDeCompras([
      fac("vistana", "2026-11-02", 3224, 200), fac("vistana", "2026-11-03", 77, 40, "Nota de Débito"),
    ]);
    expect(meses).toEqual([{ mes: "2026-11", total: 200, devoluciones: 0, filas: [{ clase: "compra", empresa: "vistana", fecha: "2026-11-02", monto: 200, facturas: ["3224"] }] }]);
  });

  it("la compra va en el mes de su PRIMERA factura", () => {
    const meses = historialDeCompras([fac("vistana", "2026-08-30", 1), fac("vistana", "2026-09-03", 2)]);
    expect(meses.map((m) => [m.mes, m.total])).toEqual([["2026-08", 200]]);
  });
});

describe("el interruptor", () => {
  it("nace en false", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../lib/cxc/historial-cliente.ts"), "utf8");
    expect(src).toMatch(/export const HISTORIAL_CLIENTE_2026_11 = false;/);
  });
});
