/**
 * Robustez de lecturas (24-nov-2026, Daniel aprobó «arreglar lo que puede
 * fallar en silencio»). Ningún número correcto cambia: lo único nuevo es que,
 * cuando una lectura falla, la respuesta lo DICE (o contesta 500) en vez de
 * mostrar $0, «Sin pagos» o una lista vacía. Y las lecturas de más de 1.000
 * filas se leen enteras.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Base de mentira: por tabla, filas o error; respeta `.range()` y el COUNT ──
type Tabla = { rows?: Record<string, unknown>[]; error?: { message: string } };
let tablas: Record<string, Tabla> = {};
let sesion: { role: string; userId: string } = { role: "admin", userId: "u-1" };

function cadena(tabla: string) {
  let rango: [number, number] | null = null;
  const res = () => {
    const t = tablas[tabla] ?? {};
    if (t.error) return Promise.resolve({ data: null, error: t.error, count: null });
    const rows = t.rows ?? [];
    const data = rango ? rows.slice(rango[0], rango[1] + 1) : rows;
    return Promise.resolve({ data, error: null, count: rows.length });
  };
  const self: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "gte", "lt", "lte", "order", "limit", "not", "or"]) self[m] = () => self;
  self.range = (a: number, b: number) => { rango = [a, b]; return self; };
  self.maybeSingle = () => res().then((r) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }));
  self.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => res().then(ok, bad);
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => cadena(t),
    rpc: async () => ({ data: [{ c: "ABC-1", d: "Zapato", q: 1, v: 10, k: 5, m: null, r: null, s: null, e: 3, n90: true }], error: null }),
  },
}));
vi.mock("@/lib/requireRole", () => ({ requireRole: () => ({ ...sesion, userName: "Prueba" }) }));
vi.mock("@/lib/require-auth", () => ({ requireAuth: () => null, getSession: () => sesion }));
vi.mock("@/lib/clientes/mundos", () => ({ esCodigoDelGrupo: async () => true }));
vi.mock("@/lib/rechazos-de-switch", () => ({ lineaDeRechazos: async () => null }));

// Comisiones: la RPC contesta; los descuentos se pueden «caer».
let descuentosFallan = false;
vi.mock("@/lib/comisiones/rpc", () => ({
  leerComision: async (empresa: string) => ({
    data: { empresa_key: empresa, regla_cobro: "x", version: "v10", vendedores: [{ vendedor: "ANA", base: 100, comision: 1, base_cobro: 0, comision_cobro: 0, comision_total: 1 }] },
    error: null,
  }),
}));
vi.mock("@/lib/comisiones/exclusiones-server", () => ({ leerExclusionesActivasOVacio: async () => [] }));
vi.mock("@/lib/comisiones/descuentos", async (orig) => ({
  ...(await orig<typeof import("@/lib/comisiones/descuentos")>()),
  leerDescuentosEfectivos: async () => {
    if (descuentosFallan) throw new Error("se cayó");
    return [];
  },
}));

const req = (url: string) => new NextRequest(`https://www.fashiongr.com${url}`);

beforeEach(() => {
  tablas = {};
  sesion = { role: "admin", userId: "u-1" };
  descuentosFallan = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("1 · Comisiones: si los descuentos no se leen, la respuesta lo marca", () => {
  it("por empresa: `descuentos_no_leidos` solo cuando la lectura falla", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/route");
    const ok = await (await GET(req("/api/ventas/comisiones?empresa=vistana&year=2026&mes=10"))).json();
    expect(ok.descuentos_no_leidos).toBeUndefined();
    descuentosFallan = true;
    const mal = await (await GET(req("/api/ventas/comisiones?empresa=vistana&year=2026&mes=10"))).json();
    expect(mal.descuentos_no_leidos).toBe(true);
    // La tabla sale igual (no se cae), con el mismo número.
    expect(mal.vendedores[0].comision_total).toBe(ok.vendedores[0].comision_total);
  });

  it("consolidado: lo mismo", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/consolidado/route");
    const ok = await (await GET(req("/api/ventas/comisiones/consolidado?year=2026&mes=10"))).json();
    expect(ok.descuentos_no_leidos).toBeUndefined();
    descuentosFallan = true;
    const mal = await (await GET(req("/api/ventas/comisiones/consolidado?year=2026&mes=10"))).json();
    expect(mal.descuentos_no_leidos).toBe(true);
    expect(mal.empresas.length).toBe(ok.empresas.length);
  });
});

describe("4 · Inicio de Boston: una lectura caída es `null`, nunca 0", () => {
  it("ventas, planilla y préstamos caídos → null; la cartera leída sigue", async () => {
    tablas = {
      switch_estadocuenta_aging_boston: { rows: [{ d0_90: 10, d91_120: 0, d121_plus: 0, total: 10 }] },
      ventas_rollup_mensual_mv: { error: { message: "timeout" } },
      asistencia_personas: { error: { message: "timeout" } },
      prestamos_empleados: { error: { message: "timeout" } },
    };
    const { GET } = await import("@/app/api/boston/inicio/route");
    const j = await (await GET(req("/api/boston/inicio"))).json();
    expect(j.ventas).toBeNull();
    expect(j.planilla).toBeNull();
    expect(j.prestamos).toBeNull();
    expect(j.cartera.total).toBe(10);
  });

  it("cartera caída → null", async () => {
    tablas = { switch_estadocuenta_aging_boston: { error: { message: "timeout" } } };
    const { GET } = await import("@/app/api/boston/inicio/route");
    const j = await (await GET(req("/api/boston/inicio"))).json();
    expect(j.cartera).toBeNull();
    expect(j.planilla).toEqual({ personas: 0 });
  });
});

describe("6 · Ficha del cliente: si el puente no se lee, 500 (no una ficha en cero)", () => {
  it("switch_clientes con error → 500", async () => {
    tablas = {
      clientes_master: { rows: [{ id: 1, codigo: "D-24", nombre: "X" }] },
      switch_clientes: { error: { message: "timeout" } },
    };
    const { GET } = await import("@/app/api/clientes/[codigo]/route");
    const res = await GET(req("/api/clientes/D-24"), { params: Promise.resolve({ codigo: "D-24" }) });
    expect(res.status).toBe(500);
  });
});

describe("7 · Vendedor: si no se lee su empresa, 500 — NUNCA las 6", () => {
  it("aging", async () => {
    sesion = { role: "vendedor", userId: "v-1" };
    tablas = { fg_users: { error: { message: "timeout" } } };
    const { GET } = await import("@/app/api/cxc/aging/route");
    const res = await GET(req("/api/cxc/aging"));
    expect(res.status).toBe(500);
  });

  it("estado de cuenta", async () => {
    sesion = { role: "vendedor", userId: "v-1" };
    tablas = { fg_users: { error: { message: "timeout" } } };
    const { GET } = await import("@/app/api/cxc/estado-cuenta/[codigo]/route");
    const res = await GET(req("/api/cxc/estado-cuenta/D-24"), { params: Promise.resolve({ codigo: "D-24" }) });
    expect(res.status).toBe(500);
  });
});

describe("9 · Productos: las fotos se leen enteras (más de 1.000)", () => {
  it("la foto del sku 1.200 llega", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ sku: `S-${i}`, image_url: `u${i}` }));
    rows[1199] = { sku: "ABC-1", image_url: "la-foto" };
    tablas = { products: { rows } };
    const { leerArticulos } = await import("@/lib/ventas/productos-articulos-server");
    const arts = await leerArticulos("active_shoes", "2026-01-01", "2026-11-23", "2026-11-24");
    expect(arts[0].foto).toBe("la-foto");
  });
});

describe("10 · Historial mensual: el mes es el de Panamá", () => {
  it("una factura del 1-nov 02:00 UTC es del 31-oct en Panamá", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T15:00:00Z"));
    try {
      tablas = {
        clientes_master: { rows: [{ id: 1, codigo: "D-24", nombre: "X" }] },
        switch_clientes: { rows: [{ cliente_switch_id: 7 }] },
        switch_facturas: { rows: [{ fecha: "2026-11-01T02:00:00+00:00", tipo_comprobante: "Factura", subtotal_descuento: 100 }] },
      };
      const { GET } = await import("@/app/api/clientes/[codigo]/historial-mensual/route");
      const j = await (await GET(req("/api/clientes/D-24/historial-mensual?empresa=vistana"), { params: Promise.resolve({ codigo: "D-24" }) })).json();
      const oct = j.meses.find((m: { anio: number; mes: number }) => m.anio === 2026 && m.mes === 10);
      const nov = j.meses.find((m: { anio: number; mes: number }) => m.anio === 2026 && m.mes === 11);
      expect(oct.total).toBe(100);
      expect(nov.total).toBe(0);
      expect(j.meses.at(-1)).toMatchObject({ anio: 2026, mes: 11 });
      expect(j.dias_desde_ultima_compra).toBe(24);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("11 · Mes vs año: el rollup se lee entero (más de 1.000 filas)", () => {
  it("las 1.200 filas entran al cálculo", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      empresa_key: "vistana", anio: 1000 + i, mes_num: 1, ventas_netas: 1, costo_total: 0, utilidad: 1,
    }));
    tablas = { ventas_rollup_mensual_mv: { rows } };
    const { GET } = await import("@/app/api/ventas/mes-anio/route");
    const res = await GET(req("/api/ventas/mes-anio"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.years).toHaveLength(1200); // con el tope silencioso serían 1.000
  });
});
