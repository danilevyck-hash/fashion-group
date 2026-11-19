// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del historial del cliente (19-nov-2026, `HISTORIAL_CLIENTE_2026_11`).
//
//  1. 🔴 Boston y el grupo NO se mezclan, en las dos direcciones:
//     · `/api/cxc/historial` (grupo): un recibo y una factura de Boston con el
//       MISMO código no salen; `gerente_boston` recibe 403.
//     · `/api/cxc/boston/historial`: el mismo id de Switch en Vistana no sale.
//     · `/renglones` no le da productos de Boston a nadie (404).
//  2. 🩸 Un cliente con MÁS de 1.000 recibos (D-151 tiene 1.714) y más de 1.000
//     facturas sale COMPLETO: el mock corta cada respuesta en 1.000 filas, como
//     `db-max-rows` en producción.
//  3. Lo puro: un renglón por día, por mes con su total; la nota de crédito resta.
//  4. El interruptor nace en `false`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { historialDeFacturas, historialDePagos } from "@/lib/cxc/historial-cliente";

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
const boston = await import("@/app/api/cxc/boston/historial/route");
const renglones = await import("@/app/api/cxc/historial/renglones/route");

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
    switch_factura_lineas: [
      { id: "l1", empresa_key: "fashion_wear", tipo_comprobante: "Factura", switch_factura_id: 5000, linea_orden: 0, codigo: "NB2570400", descripcion: "Men-Boxer Brief", cantidad: "12", precio: "27", subtotal_con_descuento: "324" },
    ],
    fg_users: [],
  };
});

const cuantas = (meses: { filas: unknown[] }[]) => meses.reduce((s, m) => s + m.filas.length, 0);
const suma = (meses: { total: number }[]) => Math.round(meses.reduce((s, m) => s + m.total, 0) * 100) / 100;

describe("🩸 más de 1.000 filas salen completas", () => {
  it("1.200 recibos → 1.200 días, $12,000, sin retención ni cero", async () => {
    const res = await grupo.GET(req("/api/cxc/historial?codigo=D-151&tipo=pagos"));
    expect(res.status).toBe(200);
    const { meses } = await res.json();
    expect(cuantas(meses)).toBe(1200);
    expect(suma(meses)).toBe(12000);
  });

  it("1.100 facturas y una nota de crédito → 1.101 documentos, la NC resta", async () => {
    const res = await grupo.GET(req("/api/cxc/historial?codigo=D-151&tipo=facturas"));
    const { meses } = await res.json();
    expect(cuantas(meses)).toBe(1101);
    expect(suma(meses)).toBe(110000 - 30);
  });
});

describe("🔴 el grupo no trae a Boston ni a Multifashion", () => {
  it("pagos: ni los $777 de Boston ni los $555 de Multifashion", async () => {
    const { meses } = await (await grupo.GET(req("/api/cxc/historial?codigo=D-151&tipo=pagos"))).json();
    const montos = meses.flatMap((m: { filas: { monto: number }[] }) => m.filas.map((f) => f.monto));
    expect(montos).not.toContain(777);
    expect(montos).not.toContain(555);
    const empresas = new Set(meses.flatMap((m: { filas: { empresas: string[] }[] }) => m.filas.flatMap((f) => f.empresas)));
    expect([...empresas]).toEqual(["vistana"]);
  });

  it("facturas: ni la de Boston (mismo código) ni la del 40 de Vistana", async () => {
    const { meses } = await (await grupo.GET(req("/api/cxc/historial?codigo=D-151&tipo=facturas"))).json();
    const empresas = new Set(meses.flatMap((m: { filas: { empresa: string }[] }) => m.filas.map((f) => f.empresa)));
    expect([...empresas]).toEqual(["fashion_wear"]);
  });

  it("gerente_boston no entra a la ruta del grupo (403)", async () => {
    const res = await grupo.GET(req("/api/cxc/historial?codigo=D-151&tipo=pagos", "gerente_boston"));
    expect(res.status).toBe(403);
  });

  it("renglones: los de Boston no se le dan a nadie (404); los del grupo, sí", async () => {
    const r1 = await renglones.GET(req("/api/cxc/historial/renglones?empresa=confecciones_boston&tipo=Factura&id=8"));
    expect(r1.status).toBe(404);
    const r2 = await renglones.GET(req("/api/cxc/historial/renglones?empresa=fashion_wear&tipo=Factura&id=5000"));
    expect((await r2.json()).renglones).toEqual([
      { codigo: "NB2570400", descripcion: "Men-Boxer Brief", cantidad: 12, precio: 27, subtotal: 324 },
    ]);
  });
});

describe("🔴 Boston no trae al grupo", () => {
  it("el id 151 de Boston: solo sus $777, nunca los 1.200 de Vistana", async () => {
    const res = await boston.GET(req("/api/cxc/boston/historial?cliente=151&tipo=pagos", "gerente_boston"));
    expect(res.status).toBe(200);
    const { meses } = await res.json();
    expect(cuantas(meses)).toBe(1);
    expect(suma(meses)).toBe(777);
  });

  it("facturas de Boston: solo la suya", async () => {
    const { meses } = await (await boston.GET(req("/api/cxc/boston/historial?cliente=151&tipo=facturas", "gerente_boston"))).json();
    expect(meses.flatMap((m: { filas: { empresa: string }[] }) => m.filas.map((f) => f.empresa))).toEqual(["confecciones_boston"]);
  });

  it("el vendedor del grupo no entra a la ruta de Boston", async () => {
    const res = await boston.GET(req("/api/cxc/boston/historial?cliente=151&tipo=pagos", "vendedor"));
    expect(res.status).toBe(403);
  });

  it("la ruta de Boston no importa la del grupo ni su helper de empresas", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../app/api/cxc/boston/historial/route.ts"), "utf8");
    expect(src).not.toMatch(/historial-servidor|CXC_GRUPO_EMPRESA_KEYS|api\/cxc\/historial\/route/);
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

  it("facturas: la NC va en negativo y el número es el de Documentos", () => {
    const [mes] = historialDeFacturas([
      { empresa_key: "vistana", switch_factura_id: 1, secuencial: "11-000003224", tipo_comprobante: "Factura", fecha: "2026-11-02T10:00:00Z", total: 200 },
      { empresa_key: "vistana", switch_factura_id: 2, secuencial: "13-000000860", tipo_comprobante: "Nota de Crédito", fecha: "2026-11-05T10:00:00Z", total: 50 },
    ]);
    expect(mes.total).toBe(150);
    expect(mes.filas.map((f) => [f.numero, f.monto, f.esNotaCredito])).toEqual([["13-000000860", -50, true], ["11-000003224", 200, false]]);
  });
});

describe("el interruptor", () => {
  it("nace en false", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../lib/cxc/historial-cliente.ts"), "utf8");
    expect(src).toMatch(/export const HISTORIAL_CLIENTE_2026_11 = false;/);
  });
});
