// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — ventana de datos de `gerente_acs` (Jennifer) en Multifashion.
//
// Decisión de Daniel: Jennifer ve el MES EN CURSO y la comparación contra el
// MISMO MES DEL AÑO PASADO. Nada más. Y se impone en el SERVIDOR.
//
// Este archivo se pone rojo si:
//   (a) alguien agrega una ruta a /api/multifashion/** sin el clamp;
//   (b) `gerente_acs` logra que una ruta consulte un período fuera de la ventana
//       (se llama al handler REAL con cookie firmada y se mira qué parámetros
//       llegan al RPC / a Switch);
//   (c) el clamp le cambia algo a `admin`;
//   (d) el borde de mes se calcula en UTC pelado en vez de UTC-5 (Panamá).
//
// Todas las fechas son FIJAS (vi.setSystemTime). Nada de `new Date()` real: el
// bug que se está previniendo solo aparece 1 día de cada 30.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  ROL_VENTANA_ACOTADA,
  esRolAcotado,
  fechaPanama,
  ventanaGerente,
  ultimoDiaDelMes,
  dentroDeVentana,
  clampAnioMes,
  clampRangoFechas,
  clampFechaDia,
  clampPeriodoVendedoras,
} from "@/lib/multifashion/ventana-gerente";
import { signSession } from "@/lib/session-cookie";

// ── Arnés: supabase / Switch / queries mockeados ─────────────────────────────

interface RpcCall { name: string; args: Record<string, unknown> }
const rpcCalls: RpcCall[] = [];
const fromCalls: { tabla: string; filtros: Array<[string, unknown]> }[] = [];

function chain(result: { data: unknown; error: unknown }) {
  const filtros: Array<[string, unknown]> = [];
  const self: Record<string, unknown> = {};
  const paso = (k: string) => (a?: unknown, b?: unknown) => { filtros.push([k, b ?? a]); return self; };
  Object.assign(self, {
    __filtros: filtros,
    select: paso("select"), eq: paso("eq"), neq: paso("neq"), not: paso("not"),
    gte: paso("gte"), lt: paso("lt"), lte: paso("lte"), gt: paso("gt"),
    range: paso("range"), order: paso("order"), limit: paso("limit"),
    maybeSingle: async () => result,
    upsert: async () => ({ error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  });
  return self;
}

// Caja: la tabla de caché "no existe" → modo directo (sin escribir nada).
const ERROR_TABLA_AUSENTE = { code: "PGRST205", message: "could not find the table" };

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      // proyeccion_mensual_retail_v1 devuelve filas por empresa; el resto, jsonb.
      return name.startsWith("proyeccion_")
        ? { data: [], error: null }
        : { data: { totales: {}, dias: [] }, error: null };
    },
    from: (tabla: string) => {
      const c = chain(
        tabla === "multifashion_caja_diaria"
          ? { data: null, error: ERROR_TABLA_AUSENTE }
          : { data: [], error: null },
      );
      fromCalls.push({ tabla, filtros: (c as { __filtros: Array<[string, unknown]> }).__filtros });
      return c;
    },
  },
  HAS_SERVICE_ROLE: true,
}));

const fetchMultifashionCalls: Array<{ year: number; mes: number }> = [];
vi.mock("@/lib/ventas/queries", () => ({
  fetchMultifashion: async (p: { year: number; mes: number }) => {
    fetchMultifashionCalls.push(p);
    return { tienda: "ACS", retail: { meses: [] } };
  },
}));

const switchCalls: Array<{ desde: string; hasta: string }> = [];
vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    getDiarioVentas: async (p: { desde: string; hasta: string }) => {
      switchCalls.push({ desde: p.desde, hasta: p.hasta });
      return { diarioDeVentas: { granTotal: 0 } };
    },
    logout: async () => {},
  }),
}));

import { GET as overviewGet } from "@/app/api/multifashion/overview/route";
import { GET as detalleGet } from "@/app/api/multifashion/detalle-mensual/route";
import { GET as bonosGet } from "@/app/api/multifashion/bonos/route";
import { GET as vendedorasGet } from "@/app/api/multifashion/vendedoras/route";
import { GET as wholesaleGet } from "@/app/api/multifashion/clientes-wholesale/route";
import { GET as retailGet } from "@/app/api/multifashion/retail-recurrentes/route";
import { GET as cajaGet } from "@/app/api/multifashion/caja/route";

// ── Reloj fijo ───────────────────────────────────────────────────────────────
// 30-jul-2026 18:00 UTC = 13:00 en Panamá. Mes en curso = julio 2026;
// comparación = julio 2025.
const AHORA = new Date("2026-07-30T18:00:00.000Z");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-ventana-gerente"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  rpcCalls.length = 0;
  fromCalls.length = 0;
  fetchMultifashionCalls.length = 0;
  switchCalls.length = 0;
});
afterEach(() => { vi.useRealTimers(); });

function req(url: string, role: string): NextRequest {
  const cookie = signSession({ role, userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}

const rpc = (name: string): Record<string, unknown> => {
  const c = rpcCalls.find(r => r.name === name);
  if (!c) throw new Error(`no se llamó ${name}. Llamados: ${rpcCalls.map(r => r.name).join(", ")}`);
  return c.args;
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. La función pura — incluido el borde de mes en UTC-5
// ═════════════════════════════════════════════════════════════════════════════

describe("ventana-gerente — Panamá es UTC-5 fijo", () => {
  it("1-ago 02:00 UTC en Panamá TODAVÍA es 31-jul (el bug que se está evitando)", () => {
    expect(fechaPanama(new Date("2026-08-01T02:00:00Z"))).toBe("2026-07-31");
    // En UTC pelado sería agosto y Jennifer perdería el último día del mes.
    expect(new Date("2026-08-01T02:00:00Z").toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("a las 05:00 UTC ya cambió el día en Panamá", () => {
    expect(fechaPanama(new Date("2026-08-01T04:59:59Z"))).toBe("2026-07-31");
    expect(fechaPanama(new Date("2026-08-01T05:00:00Z"))).toBe("2026-08-01");
  });

  it("el 1-ago 02:00 UTC la ventana sigue siendo JULIO, no agosto", () => {
    const v = ventanaGerente(new Date("2026-08-01T02:00:00Z"));
    expect(v.mes).toBe(7);
    expect(v.actual).toEqual({ inicio: "2026-07-01", fin: "2026-07-31" });
    expect(v.anterior).toEqual({ inicio: "2025-07-01", fin: "2025-07-31" });
  });

  it("cruce de año: 1-ene 03:00 UTC sigue siendo diciembre en Panamá", () => {
    const v = ventanaGerente(new Date("2027-01-01T03:00:00Z"));
    expect(v.anio).toBe(2026);
    expect(v.mes).toBe(12);
    expect(v.actual).toEqual({ inicio: "2026-12-01", fin: "2026-12-31" });
    expect(v.anterior).toEqual({ inicio: "2025-12-01", fin: "2025-12-31" });
  });

  it("febrero bisiesto: el mes de comparación usa SU propio largo", () => {
    const v = ventanaGerente(new Date("2028-02-29T18:00:00Z")); // 2028 bisiesto
    expect(v.actual).toEqual({ inicio: "2028-02-01", fin: "2028-02-29" });
    expect(v.anterior).toEqual({ inicio: "2027-02-01", fin: "2027-02-28" });
    expect(ultimoDiaDelMes(2028, 2)).toBe(29);
    expect(ultimoDiaDelMes(2027, 2)).toBe(28);
  });

  it("el mes en curso NO llega al futuro: fin = hoy", () => {
    const v = ventanaGerente(AHORA);
    expect(v.actual).toEqual({ inicio: "2026-07-01", fin: "2026-07-30" });
    expect(dentroDeVentana("2026-07-31", v)).toBe(false);
    expect(dentroDeVentana("2026-07-30", v)).toBe(true);
    expect(dentroDeVentana("2025-07-31", v)).toBe(true);
    expect(dentroDeVentana("2025-06-30", v)).toBe(false);
  });
});

describe("ventana-gerente — clamps puros", () => {
  it("el rol acotado es gerente_acs y nadie más", () => {
    expect(ROL_VENTANA_ACOTADA).toBe("gerente_acs");
    expect(esRolAcotado("gerente_acs")).toBe(true);
    for (const r of ["admin", "secretaria", "vendedor", "bodega", "contabilidad", "", null, undefined]) {
      expect(esRolAcotado(r)).toBe(false);
    }
  });

  it("clampAnioMes: admin intacto, gerente_acs al mes en curso", () => {
    expect(clampAnioMes("admin", { year: 2022, mes: 3 }, AHORA)).toEqual({ year: 2022, mes: 3, ajustado: false });
    expect(clampAnioMes("gerente_acs", { year: 2022, mes: 3 }, AHORA)).toEqual({ year: 2026, mes: 7, ajustado: true });
    // El año de comparación SÍ se respeta (es la mitad del pedido de Daniel).
    expect(clampAnioMes("gerente_acs", { year: 2025, mes: 3 }, AHORA)).toEqual({ year: 2025, mes: 7, ajustado: true });
    // Ya dentro de la ventana → no se toca nada.
    expect(clampAnioMes("gerente_acs", { year: 2026, mes: 7 }, AHORA)).toEqual({ year: 2026, mes: 7, ajustado: false });
    // mes=null (el RPC lo lee como "último mes elegible") NO es un bypass.
    expect(clampAnioMes("gerente_acs", { year: 2026, mes: null }, AHORA).mes).toBe(7);
  });

  it("clampRangoFechas: 'todo el histórico' cae al mes en curso", () => {
    expect(clampRangoFechas("admin", { inicio: "2019-01-01", fin: "2026-07-30" }, AHORA))
      .toEqual({ inicio: "2019-01-01", fin: "2026-07-30", ajustado: false });
    expect(clampRangoFechas("gerente_acs", { inicio: "2019-01-01", fin: "2026-07-30" }, AHORA))
      .toEqual({ inicio: "2026-07-01", fin: "2026-07-30", ajustado: true });
  });

  it("clampRangoFechas: un rango 100% en el mes de comparación se respeta", () => {
    expect(clampRangoFechas("gerente_acs", { inicio: "2025-07-05", fin: "2025-07-20" }, AHORA))
      .toEqual({ inicio: "2025-07-05", fin: "2025-07-20", ajustado: false });
    // Pero el año pasado ENTERO se recorta a julio-2025.
    expect(clampRangoFechas("gerente_acs", { inicio: "2025-01-01", fin: "2025-12-31" }, AHORA))
      .toEqual({ inicio: "2025-07-01", fin: "2025-07-31", ajustado: true });
  });

  it("clampRangoFechas: un rango que no toca ninguna ventana → mes en curso", () => {
    expect(clampRangoFechas("gerente_acs", { inicio: "2026-01-01", fin: "2026-03-31" }, AHORA))
      .toEqual({ inicio: "2026-07-01", fin: "2026-07-30", ajustado: true });
  });

  it("clampFechaDia: fuera de ventana → hoy; dentro → intacto", () => {
    expect(clampFechaDia("admin", "2020-01-01", AHORA)).toEqual({ fecha: "2020-01-01", ajustado: false });
    expect(clampFechaDia("gerente_acs", "2020-01-01", AHORA)).toEqual({ fecha: "2026-07-30", ajustado: true });
    expect(clampFechaDia("gerente_acs", "2026-07-02", AHORA)).toEqual({ fecha: "2026-07-02", ajustado: false });
    expect(clampFechaDia("gerente_acs", "2025-07-15", AHORA)).toEqual({ fecha: "2025-07-15", ajustado: false });
    expect(clampFechaDia("gerente_acs", "2026-06-30", AHORA).fecha).toBe("2026-07-30");
  });

  it("clampPeriodoVendedoras: trimestre / ytd / rolling se aplastan a 'mes'", () => {
    for (const periodo of ["trimestre", "ytd", "ultimos"] as const) {
      const out = clampPeriodoVendedoras(
        "gerente_acs", { year: 2024, periodo, mes: 2, trimestre: 4, n: 12 }, AHORA,
      );
      expect(out).toEqual({ year: 2026, periodo: "mes", mes: 7, trimestre: null, n: null, ajustado: true });
    }
    const admin = clampPeriodoVendedoras(
      "admin", { year: 2024, periodo: "ytd", mes: null, trimestre: null, n: null }, AHORA,
    );
    expect(admin).toEqual({ year: 2024, periodo: "ytd", mes: null, trimestre: null, n: null, ajustado: false });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Las rutas REALES: gerente_acs pide fuera de la ventana y no lo consigue
// ═════════════════════════════════════════════════════════════════════════════

describe("rutas — gerente_acs no puede pedir fuera de la ventana", () => {
  it("overview?year=2019&mes=1 → year 2026, mes 7", async () => {
    await overviewGet(req("/api/multifashion/overview?year=2019&mes=1", "gerente_acs"));
    expect(fetchMultifashionCalls).toEqual([{ year: 2026, mes: 7 }]);
  });

  it("overview?year=2025 (comparación) se respeta, con el mes en curso", async () => {
    await overviewGet(req("/api/multifashion/overview?year=2025&mes=12", "gerente_acs"));
    expect(fetchMultifashionCalls).toEqual([{ year: 2025, mes: 7 }]);
  });

  it("detalle-mensual?year=2024&mes=2 → RPC con 2026/7", async () => {
    await detalleGet(req("/api/multifashion/detalle-mensual?year=2024&mes=2", "gerente_acs"));
    expect(rpc("multifashion_detalle_mensual_v2")).toMatchObject({ p_year: 2026, p_mes: 7 });
    expect(rpc("multifashion_horas_pico_v1")).toMatchObject({ p_year: 2026, p_mes: 7 });
    // La consulta directa de mayoreo usa el MISMO año/mes acotado.
    const vw = fromCalls.find(f => f.tabla === "_multifashion_sf_vw");
    expect(vw?.filtros).toContainEqual(["eq", 2026]);
    expect(vw?.filtros).toContainEqual(["eq", 7]);
    // Y el rango de switch_facturas también.
    const sf = fromCalls.find(f => f.tabla === "switch_facturas");
    expect(sf?.filtros).toContainEqual(["gte", "2026-07-01"]);
    expect(sf?.filtros).toContainEqual(["lt", "2026-08-01"]);
  });

  it("bonos?year=2023 sin mes → RPC con 2026/7 (mes null no es bypass)", async () => {
    await bonosGet(req("/api/multifashion/bonos?year=2023", "gerente_acs"));
    expect(rpc("multifashion_bonos_v3")).toEqual({ p_year: 2026, p_mes: 7 });
  });

  it("vendedoras?periodo=ytd → periodo mes, mes en curso", async () => {
    await vendedorasGet(req("/api/multifashion/vendedoras?year=2024&periodo=ytd", "gerente_acs"));
    expect(rpc("multifashion_vendedoras_v3")).toEqual({
      p_year: 2026, p_periodo: "mes", p_mes: 7, p_trimestre: null,
    });
  });

  it("vendedoras?periodo=ultimos&n=12 NO llega a la RPC de ventana rolling", async () => {
    await vendedorasGet(req("/api/multifashion/vendedoras?year=2026&periodo=ultimos&n=12&mes=7", "gerente_acs"));
    expect(rpcCalls.map(r => r.name)).not.toContain("multifashion_vendedoras_range");
    expect(rpc("multifashion_vendedoras_v3")).toMatchObject({ p_periodo: "mes", p_mes: 7 });
  });

  it("vendedoras?periodo=trimestre&trimestre=1 tampoco abre el trimestre", async () => {
    await vendedorasGet(req("/api/multifashion/vendedoras?year=2026&periodo=trimestre&trimestre=1", "gerente_acs"));
    expect(rpc("multifashion_vendedoras_v3")).toEqual({
      p_year: 2026, p_periodo: "mes", p_mes: 7, p_trimestre: null,
    });
  });

  it("clientes-wholesale con rango de 7 años → julio 2026", async () => {
    await wholesaleGet(req("/api/multifashion/clientes-wholesale?fecha_inicio=2019-01-01&fecha_fin=2026-07-30", "gerente_acs"));
    expect(rpc("multifashion_wholesale_clientes_v2")).toEqual({
      p_fecha_inicio: "2026-07-01", p_fecha_fin: "2026-07-30",
    });
  });

  it("retail-recurrentes con rango de 7 años → julio 2026", async () => {
    await retailGet(req("/api/multifashion/retail-recurrentes?fecha_inicio=2019-01-01&fecha_fin=2026-07-30&limit=500", "gerente_acs"));
    expect(rpc("multifashion_retail_recurrentes_v2")).toMatchObject({
      p_fecha_inicio: "2026-07-01", p_fecha_fin: "2026-07-30",
    });
  });

  it("caja?fecha=2024-03-05 → Switch se consulta por HOY, no por 2024", async () => {
    await cajaGet(req("/api/multifashion/caja?fecha=2024-03-05", "gerente_acs"));
    expect(switchCalls).toEqual([{ desde: "2026-07-30", hasta: "2026-07-31" }]);
  });

  it("caja?fecha=2025-07-15 (mes de comparación) sí se respeta", async () => {
    await cajaGet(req("/api/multifashion/caja?fecha=2025-07-15", "gerente_acs"));
    expect(switchCalls).toEqual([{ desde: "2025-07-15", hasta: "2025-07-16" }]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. A `admin` no le cambió NADA
// ═════════════════════════════════════════════════════════════════════════════

describe("rutas — admin sigue viendo todo el histórico", () => {
  it("overview / detalle / bonos: los parámetros pasan tal cual", async () => {
    await overviewGet(req("/api/multifashion/overview?year=2019&mes=1", "admin"));
    expect(fetchMultifashionCalls).toEqual([{ year: 2019, mes: 1 }]);

    await detalleGet(req("/api/multifashion/detalle-mensual?year=2024&mes=2", "admin"));
    expect(rpc("multifashion_detalle_mensual_v2")).toMatchObject({ p_year: 2024, p_mes: 2 });

    await bonosGet(req("/api/multifashion/bonos?year=2023&mes=4", "admin"));
    expect(rpc("multifashion_bonos_v3")).toEqual({ p_year: 2023, p_mes: 4 });
  });

  it("vendedoras: ytd, trimestre y ventana rolling siguen funcionando", async () => {
    await vendedorasGet(req("/api/multifashion/vendedoras?year=2024&periodo=ytd", "admin"));
    expect(rpc("multifashion_vendedoras_v3")).toEqual({
      p_year: 2024, p_periodo: "ytd", p_mes: null, p_trimestre: null,
    });

    rpcCalls.length = 0;
    await vendedorasGet(req("/api/multifashion/vendedoras?year=2024&periodo=trimestre&trimestre=3", "admin"));
    expect(rpc("multifashion_vendedoras_v3")).toEqual({
      p_year: 2024, p_periodo: "trimestre", p_mes: null, p_trimestre: 3,
    });

    rpcCalls.length = 0;
    await vendedorasGet(req("/api/multifashion/vendedoras?year=2024&periodo=ultimos&n=12&mes=6", "admin"));
    expect(rpc("multifashion_vendedoras_range")).toEqual({ p_year: 2024, p_fin_mes: 6, p_n_meses: 12 });
  });

  it("clientes y caja: rango e histórico intactos", async () => {
    await wholesaleGet(req("/api/multifashion/clientes-wholesale?fecha_inicio=2019-01-01&fecha_fin=2026-07-30", "admin"));
    expect(rpc("multifashion_wholesale_clientes_v2")).toEqual({
      p_fecha_inicio: "2019-01-01", p_fecha_fin: "2026-07-30",
    });

    await cajaGet(req("/api/multifashion/caja?fecha=2024-03-05", "admin"));
    expect(switchCalls).toEqual([{ desde: "2024-03-05", hasta: "2024-03-06" }]);
  });

  it("las validaciones de siempre siguen devolviendo 400 (no las comió el clamp)", async () => {
    const r1 = await detalleGet(req("/api/multifashion/detalle-mensual?year=1800", "admin"));
    expect(r1.status).toBe(400);
    const r2 = await vendedorasGet(req("/api/multifashion/vendedoras?periodo=mes", "admin"));
    expect(r2.status).toBe(400);
    const r3 = await cajaGet(req("/api/multifashion/caja?fecha=2026-12-31", "gerente_acs"));
    expect(r3.status).toBe(400); // futura → 400 antes de cualquier clamp
    const r4 = await wholesaleGet(
      req("/api/multifashion/clientes-wholesale?fecha_inicio=2026-07-30&fecha_fin=2026-07-01", "admin"),
    );
    expect(r4.status).toBe(400);
  });

  it("sin sesión → 401 en todas; rol ajeno → 403", async () => {
    const sinCookie = new NextRequest("https://fashiongr.com/api/multifashion/overview");
    expect((await overviewGet(sinCookie)).status).toBe(401);
    expect((await bonosGet(req("/api/multifashion/bonos", "bodega"))).status).toBe(403);
    expect((await cajaGet(req("/api/multifashion/caja", "vendedor"))).status).toBe(403);
  });

  // 🩸 3-ago-2026. A Andrea (rol `secretaria`) se le dio el módulo Multifashion
  // por `fg_users.modulos_override`, así que le aparecía en el menú y podía
  // abrir la pantalla — pero las rutas solo admitían admin y gerente_acs, y le
  // salía "Sin permiso" en el ranking y en los bonos. Los permisos se otorgan
  // POR USUARIO y se verifican POR ROL: ese es el desajuste. Daniel: *"si
  // debería de poder verlo"*.
  it("secretaria ENTRA en las 7 rutas (no 403)", async () => {
    const casos: Array<[string, (r: NextRequest) => Promise<Response>]> = [
      ["/api/multifashion/overview?year=2026", overviewGet],
      ["/api/multifashion/detalle-mensual?year=2026&mes=7", detalleGet],
      ["/api/multifashion/bonos?year=2026&mes=7", bonosGet],
      ["/api/multifashion/vendedoras?year=2026&mes=7", vendedorasGet],
      ["/api/multifashion/clientes-wholesale?desde=2026-07-01&hasta=2026-07-31", wholesaleGet],
      ["/api/multifashion/retail-recurrentes?desde=2026-07-01&hasta=2026-07-31", retailGet],
      ["/api/multifashion/caja?fecha=2026-07-15", cajaGet],
    ];
    for (const [url, handler] of casos) {
      const res = await handler(req(url, "secretaria"));
      expect(res.status, `403 en ${url}`).not.toBe(403);
      expect(res.status, `401 en ${url}`).not.toBe(401);
    }
  });

  it("⚠️ pero a la secretaria NO se le acota la ventana — eso es solo de gerente_acs", () => {
    // Si algún día alguien la sumara a `esRolAcotado`, vería solo el mes en
    // curso sin que nadie lo haya pedido. La ventana la definió Daniel para
    // Jennifer, no para el personal interno.
    expect(esRolAcotado("secretaria")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. GUARD ESTRUCTURAL: ninguna ruta nueva sin clamp
// ═════════════════════════════════════════════════════════════════════════════

// Rutas de Multifashion que NO llevan clamp porque NO aceptan ningún parámetro
// de fecha. Agregar algo acá es una decisión consciente, y el test de abajo
// verifica que la excusa sea cierta (que no lea searchParams).
const RUTAS_SIN_PARAMETROS_DE_FECHA = ["fidelizacion"];

function rutasMultifashion(): { nombre: string; archivo: string }[] {
  const base = path.join(process.cwd(), "src/app/api/multifashion");
  const out: { nombre: string; archivo: string }[] = [];
  const caminar = (dir: string, prefijo: string) => {
    for (const entrada of readdirSync(dir)) {
      const p = path.join(dir, entrada);
      if (statSync(p).isDirectory()) {
        caminar(p, prefijo ? `${prefijo}/${entrada}` : entrada);
      } else if (entrada === "route.ts") {
        out.push({ nombre: prefijo, archivo: p });
      }
    }
  };
  caminar(base, "");
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

describe("candado estructural — /api/multifashion/**", () => {
  const rutas = rutasMultifashion();

  it("el inventario de rutas es el esperado (si aparece una nueva, revisala)", () => {
    expect(rutas.map(r => r.nombre)).toEqual([
      "bonos",
      "caja",
      "clientes-wholesale",
      "detalle-mensual",
      "fidelizacion",
      "overview",
      "retail-recurrentes",
      "vendedoras",
    ]);
  });

  for (const { nombre, archivo } of rutas) {
    const src = readFileSync(archivo, "utf-8");
    const exenta = RUTAS_SIN_PARAMETROS_DE_FECHA.includes(nombre);

    if (exenta) {
      it(`${nombre}: exenta SOLO porque no lee ningún parámetro`, () => {
        expect(src).not.toMatch(/searchParams/);
      });
      continue;
    }

    it(`${nombre}: importa el clamp de ventana y lo USA`, () => {
      expect(src, `${nombre} debe importar @/lib/multifashion/ventana-gerente`)
        .toContain('from "@/lib/multifashion/ventana-gerente"');
      expect(src, `${nombre} importa el clamp pero no lo llama`)
        .toMatch(/clamp(AnioMes|RangoFechas|FechaDia|PeriodoVendedoras)\s*\(/);
    });

    it(`${nombre}: el clamp recibe el rol de la SESIÓN (no una constante)`, () => {
      expect(src).toMatch(/clamp\w+\(\s*auth\.role/);
    });
  }

  it("toda ruta que deja entrar a gerente_acs está cubierta", () => {
    for (const { nombre, archivo } of rutas) {
      const src = readFileSync(archivo, "utf-8");
      if (!src.includes(ROL_VENTANA_ACOTADA)) continue;
      const cubierta =
        src.includes('from "@/lib/multifashion/ventana-gerente"') ||
        RUTAS_SIN_PARAMETROS_DE_FECHA.includes(nombre);
      expect(cubierta, `${nombre} deja entrar a gerente_acs sin acotar la ventana`).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. La UI acompaña — pero se deja dicho que NO es el candado
// ═════════════════════════════════════════════════════════════════════════════

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");

describe("UI — cortesía, no candado", () => {
  it("el shell deriva la ventana del rol de sesión y la baja a la vista", () => {
    const src = leer("src/app/multifashion/MultifashionShell.tsx");
    expect(src).toContain("esRolAcotado");
    expect(src).toContain("ventanaAcotada={ventanaAcotada}");
  });

  it("los 3 sub-tabs con selector de período reciben el flag", () => {
    const src = leer("src/components/multifashion/MultifashionView.tsx");
    expect(src.match(/ventanaAcotada=\{ventanaAcotada\}/g) ?? []).toHaveLength(3);
  });

  it("el rol acotado NO ve el selector de mes ni las ventanas rolling", () => {
    expect(leer("src/components/multifashion/MultifashionView.tsx"))
      .toContain('subtab === "resumen" && !ventanaAcotada');
    expect(leer("src/components/multifashion/VendedorasSubtab.tsx"))
      .toContain("{!ventanaAcotada && (");
    expect(leer("src/components/multifashion/ClientesMultifashionSubtab.tsx"))
      .toContain("opcionesRango");
  });
});
