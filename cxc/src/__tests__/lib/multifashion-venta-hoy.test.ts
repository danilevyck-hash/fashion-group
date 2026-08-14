// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — "HOY" en Multifashion: el número de la PANTALLA es el mismo que el
// del TELEGRAM de las 8pm.
//
// 🩸 POR QUÉ ESTE ARCHIVO EXISTE. La venta del día ya se calculaba, para el
// mensaje de Telegram del cron `acs-resumen-diario`. Escribir una segunda
// cuenta para la pantalla habría sido lo más rápido y lo peor: el día que las
// dos discrepen, Daniel no deja de creerle a la que está mal — deja de creerle
// a las dos. Así que la cuenta vive en UN archivo
// (`@/lib/multifashion/retail-dia`) y este test verifica, sobre las MISMAS
// filas, que los dos consumidores llegan al MISMO centavo.
//
// Las filas del arnés reproducen lo medido en producción el 8-ago-2026:
// 48 facturas por $2.718,44 + 2 notas de crédito por $98,75 → **$2.619,69 con
// 50 documentos**. Sumar las NC en vez de restarlas da $2.817,19; la diferencia
// ($197,50) es EXACTAMENTE el doble de las NC, que es la firma de ese error.
//
// Todas las fechas son FIJAS (`vi.setSystemTime`). Nada de `new Date()` real:
// "hoy" calculado en UTC pelado se rompe sólo entre las 7pm y la medianoche de
// Panamá, o sea 5 horas de cada 24.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";

// ── Arnés: una base de datos falsa con filas de verdad ───────────────────────

interface FilaVista {
  fecha: string;
  subtotal: number;
  is_wholesale: boolean;
  n_sistema: string;
}

/** Genera `n` documentos de un día que suman exactamente `total`. */
function docs(fecha: string, n: number, total: number, is_wholesale = false): FilaVista[] {
  const base = Math.round((total / n) * 100) / 100;
  const filas: FilaVista[] = [];
  let acumulado = 0;
  for (let i = 0; i < n - 1; i += 1) {
    filas.push({ fecha, subtotal: base, is_wholesale, n_sistema: `${fecha}-${i}` });
    acumulado += base;
  }
  filas.push({
    fecha,
    subtotal: Math.round((total - acumulado) * 100) / 100,
    is_wholesale,
    n_sistema: `${fecha}-${n - 1}`,
  });
  return filas;
}

const VISTA: FilaVista[] = [
  // 8-ago-2026 — el día medido. 48 facturas + 2 NC (subtotal NEGATIVO).
  ...docs("2026-08-08", 48, 2718.44),
  { fecha: "2026-08-08", subtotal: -50.0, is_wholesale: false, n_sistema: "2026-08-08-nc1" },
  { fecha: "2026-08-08", subtotal: -48.75, is_wholesale: false, n_sistema: "2026-08-08-nc2" },
  // Mayoreo del mismo día: NO entra (el módulo compara retail contra retail).
  { fecha: "2026-08-08", subtotal: 9999.0, is_wholesale: true, n_sistema: "2026-08-08-w" },
  // 7-ago (ayer) y 1-ago (mismo día de la semana, hace 7 días).
  ...docs("2026-08-07", 48, 2356.18),
  ...docs("2026-08-01", 48, 2386.41),
  // 11-ago: día con movimiento cuyo NETO da CERO (una venta y su devolución).
  // Ése sí es un cero de verdad, y no es lo mismo que "el día no arrancó".
  { fecha: "2026-08-11", subtotal: 100.0, is_wholesale: false, n_sistema: "2026-08-11-a" },
  { fecha: "2026-08-11", subtotal: -100.0, is_wholesale: false, n_sistema: "2026-08-11-b" },
];

const VENTA_HOY_ESPERADA = 2619.69; // 2718.44 − 98.75
const DOCS_HOY_ESPERADOS = 50;
const VENTA_SEMANA_PASADA = 2386.41;
const VENTA_AYER = 2356.18;

const SYNC_LOG = [{ started_at: "2026-08-09T01:10:14Z", finished_at: "2026-08-09T01:10:30Z" }];

const vistasConsultadas: Array<{ tabla: string; filtros: Record<string, unknown> }> = [];

function chainVista(tabla: string) {
  const f: Record<string, unknown> = {};
  vistasConsultadas.push({ tabla, filtros: f });
  const self: Record<string, unknown> = {};
  const set = (k: string) => (col?: unknown, val?: unknown) => {
    f[`${k}:${String(col)}`] = val;
    return self;
  };
  const resolver = () => {
    if (tabla !== "_multifashion_sf_vw") {
      return { data: SYNC_LOG, error: null, count: SYNC_LOG.length };
    }
    const desde = f["gte:fecha"] as string;
    const hasta = f["lte:fecha"] as string;
    const wholesale = f["eq:is_wholesale"];
    const filas = VISTA.filter(
      r =>
        r.fecha >= desde &&
        r.fecha <= hasta &&
        (wholesale === undefined || r.is_wholesale === wholesale),
    ).sort((a, b) => a.n_sistema.localeCompare(b.n_sistema));
    return { data: filas, error: null, count: filas.length };
  };
  Object.assign(self, {
    select: set("select"),
    eq: set("eq"),
    gte: set("gte"),
    lte: set("lte"),
    order: set("order"),
    limit: set("limit"),
    range: set("range"),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(res, rej),
  });
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => chainVista(tabla) },
  HAS_SERVICE_ROLE: true,
}));

import { calcularResumenDiario } from "@/lib/acs-resumen-diario";
import { leerRetailRango } from "@/lib/multifashion/retail-dia";
import {
  calcularVentaHoy,
  diasComparativos,
  sumarDias,
  horaPanama,
  estadoFrescura,
  REZAGO_MS,
  HORA_CIERRE_TIENDA,
} from "@/lib/multifashion/venta-hoy";
import { GET as ventaHoyGet } from "@/app/api/multifashion/venta-hoy/route";
import { signSession } from "@/lib/session-cookie";

// 9-ago-2026 01:20 UTC = 8-ago 20:20 en Panamá (después del cierre de tienda).
const AHORA = new Date("2026-08-09T01:20:00.000Z");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-venta-hoy"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  vistasConsultadas.length = 0;
});
afterEach(() => { vi.useRealTimers(); });

function req(role: string): NextRequest {
  const cookie = signSession({ role, userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest("https://fashiongr.com/api/multifashion/venta-hoy", {
    headers: { cookie: `cxc_session=${cookie}` },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. EL TEST QUE MÁS IMPORTA: pantalla ≡ Telegram
// ═════════════════════════════════════════════════════════════════════════════

describe("paridad — la pantalla y el Telegram dan el MISMO número", () => {
  it("mismo monto al centavo desde las mismas filas", async () => {
    const telegram = await calcularResumenDiario("2026-08-08", true);
    const pantalla = await calcularVentaHoy({
      fecha: "2026-08-08", ahora: AHORA, semanaPasada: "2026-08-01", ayer: "2026-08-07",
    });
    expect(pantalla.ventas).toBe(telegram.hoy);
    expect(pantalla.ventas).toBe(VENTA_HOY_ESPERADA);
  });

  it("y la ruta HTTP devuelve exactamente ese mismo monto", async () => {
    const res = await ventaHoyGet(req("admin"));
    const body = await res.json();
    const telegram = await calcularResumenDiario("2026-08-08", true);
    expect(res.status).toBe(200);
    expect(body.ventas).toBe(telegram.hoy);
    expect(body.ventas).toBe(VENTA_HOY_ESPERADA);
    expect(body.documentos).toBe(DOCS_HOY_ESPERADOS);
  });

  // 🩸 La firma del error de signos: si las NC se SUMAN en vez de restarse, la
  // diferencia da EXACTAMENTE el doble de las NC. El 8-ago serían $2.817,19.
  it("las notas de crédito RESTAN (no dan $2.817,19)", async () => {
    const r = await leerRetailRango("2026-08-08", "2026-08-08");
    expect(r.ventas).toBe(VENTA_HOY_ESPERADA);
    expect(r.ventas).not.toBe(2817.19);
    expect(2817.19 - r.ventas).toBeCloseTo(2 * 98.75, 2);
  });

  it("el mayoreo del día NO entra (retail contra retail)", async () => {
    const r = await leerRetailRango("2026-08-08", "2026-08-08");
    expect(r.ventas).toBe(VENTA_HOY_ESPERADA); // el doc de $9.999 quedó afuera
    expect(r.documentos).toBe(DOCS_HOY_ESPERADOS);
    const lecturas = vistasConsultadas.filter(v => v.tabla === "_multifashion_sf_vw");
    expect(lecturas[0].filtros["eq:is_wholesale"]).toBe(false);
  });

  // Candado estructural: que nadie vuelva a escribir la consulta a mano.
  it("el resumen de Telegram NO tiene su propia consulta a la vista", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/acs-resumen-diario.ts"), "utf-8");
    expect(src).toContain('from "@/lib/multifashion/retail-dia"');
    // La huella de esta cuenta son el `.from()` a la vista y el filtro retail.
    // (La semántica SÍ sigue documentada en prosa acá arriba; lo que no puede
    // volver es la CONSULTA.)
    expect(src, "acs-resumen-diario volvió a consultar la vista por su cuenta")
      .not.toMatch(/\.from\(\s*(VIEW|["'`]_multifashion_sf_vw)/);
    expect(src, "acs-resumen-diario volvió a filtrar retail por su cuenta")
      .not.toMatch(/\.eq\(\s*["'`]is_wholesale/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Las piezas puras
// ═════════════════════════════════════════════════════════════════════════════

describe("piezas puras — fechas y frescura", () => {
  it("sumarDias cruza mes y año sin correrse", () => {
    expect(sumarDias("2026-08-08", -7)).toBe("2026-08-01");
    expect(sumarDias("2026-08-01", -1)).toBe("2026-07-31");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2028-03-01", -1)).toBe("2028-02-29"); // bisiesto
  });

  it("−7 días cae SIEMPRE en el mismo día de la semana (eso es el titular)", () => {
    const wd = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
    for (const f of ["2026-08-08", "2026-01-01", "2026-03-02", "2026-12-31"]) {
      expect(wd(sumarDias(f, -7))).toBe(wd(f));
    }
  });

  it("diasComparativos devuelve hace-7-días y ayer", () => {
    expect(diasComparativos("2026-08-08")).toEqual({
      semanaPasada: "2026-08-01", ayer: "2026-08-07",
    });
  });

  it("horaPanama usa UTC-5 fijo (el bug de las 7pm a medianoche)", () => {
    expect(horaPanama(new Date("2026-08-09T01:20:00Z"))).toBe(20); // 8:20 pm del día 8
    expect(horaPanama(new Date("2026-08-08T13:00:00Z"))).toBe(8);  // 8 am
    expect(horaPanama(new Date("2026-08-09T04:59:00Z"))).toBe(23); // 11:59 pm del día 8
  });

  it("estadoFrescura: fresco / rezagado / sin dato", () => {
    const ahora = new Date("2026-08-09T01:20:00Z");
    expect(estadoFrescura("2026-08-09T01:10:00Z", ahora)).toEqual({ estado: "fresco", minutos: 10 });
    // El sync corre cada 2h; a las 2h59 todavía es fresco, a las 3h01 no.
    expect(estadoFrescura(new Date(ahora.getTime() - REZAGO_MS + 60_000).toISOString(), ahora).estado)
      .toBe("fresco");
    expect(estadoFrescura(new Date(ahora.getTime() - REZAGO_MS - 60_000).toISOString(), ahora).estado)
      .toBe("rezagado");
    expect(estadoFrescura(null, ahora)).toEqual({ estado: "sin_dato", minutos: null });
    // Reloj adelantado en la DB → nunca "hace -12 minutos".
    expect(estadoFrescura("2026-08-09T01:30:00Z", ahora).minutos).toBe(0);
  });

  it("la tienda cierra a las 7pm de Panamá", () => {
    expect(HORA_CIERRE_TIENDA).toBe(19);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Comportamiento de la ruta
// ═════════════════════════════════════════════════════════════════════════════

describe("ruta /api/multifashion/venta-hoy", () => {
  it("reporta HOY en hora Panamá, no el día UTC", async () => {
    // 01:20 UTC del 9-ago: en UTC ya es día 9, en Panamá todavía es el 8. Si se
    // calculara en UTC, la pantalla mostraría $0 todas las noches.
    const body = await (await ventaHoyGet(req("admin"))).json();
    expect(body.fecha).toBe("2026-08-08");
    expect(body.ventas).toBe(VENTA_HOY_ESPERADA);
  });

  it("los dos comparativos, con el % calculado por la regla única", async () => {
    const body = await (await ventaHoyGet(req("admin"))).json();
    expect(body.semanaPasada).toMatchObject({ fecha: "2026-08-01", ventas: VENTA_SEMANA_PASADA });
    expect(body.ayer).toMatchObject({ fecha: "2026-08-07", ventas: VENTA_AYER });
    expect(body.semanaPasada.pct).toBeCloseTo((VENTA_HOY_ESPERADA - VENTA_SEMANA_PASADA) / VENTA_SEMANA_PASADA, 6);
    expect(body.ayer.pct).toBeCloseTo((VENTA_HOY_ESPERADA - VENTA_AYER) / VENTA_AYER, 6);
  });

  it("la frescura viaja SIEMPRE en el payload (el monto solo sería una media verdad)", async () => {
    const body = await (await ventaHoyGet(req("admin"))).json();
    expect(body.sync.ultimo).toBe("2026-08-09T01:10:30Z");
    expect(body.sync.estado).toBe("fresco");
    expect(body.sync.minutos).toBe(10);
  });

  it("a las 8:20 pm el día ya cerró; a las 10 am está en curso", async () => {
    expect((await (await ventaHoyGet(req("admin"))).json()).enCurso).toBe(false);
    vi.setSystemTime(new Date("2026-08-08T15:00:00Z")); // 10:00 am Panamá
    expect((await (await ventaHoyGet(req("admin"))).json()).enCurso).toBe(true);
  });

  it("un día sin ventas es 'todavía no hay ventas', NO $0", async () => {
    vi.setSystemTime(new Date("2026-08-10T14:00:00Z")); // 9 am del 10-ago, sin filas
    const body = await (await ventaHoyGet(req("admin"))).json();
    expect(body.fecha).toBe("2026-08-10");
    expect(body.documentos).toBe(0);
    expect(body.hayVentas).toBe(false); // ← la bandera que la UI usa para el texto
    expect(body.ventas).toBe(0);
  });

  // 🩸 La distinción es por DOCUMENTOS, no por monto: un día que vendió $100 y
  // los devolvió tiene neto $0 y SÍ tuvo movimiento. Si `hayVentas` mirara el
  // monto, ese día diría "todavía no hay ventas" a las 6 de la tarde.
  it("neto $0 CON documentos es un cero de verdad, no 'no arrancó'", async () => {
    vi.setSystemTime(new Date("2026-08-11T23:00:00Z")); // 6 pm del 11-ago
    const body = await (await ventaHoyGet(req("admin"))).json();
    expect(body.fecha).toBe("2026-08-11");
    expect(body.documentos).toBe(2);
    expect(body.ventas).toBe(0);
    expect(body.hayVentas).toBe(true);
  });

  it("la UI distingue los dos casos y no escribe $0 cuando no arrancó el día", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/multifashion/VentaHoyCard.tsx"), "utf-8",
    );
    expect(src).toContain("data.hayVentas ?");
    expect(src).toContain("Todavía no hay ventas hoy");
    // Y la hora del sync se pinta en los tres estados, sin rama que la omita.
    expect(src).toContain("no pudimos confirmar cuándo se actualizó");
    expect(src).toMatch(/actualizado \$\{horaSync/);
  });

  it("sin sesión → 401; rol ajeno → 403", async () => {
    const sinCookie = new NextRequest("https://fashiongr.com/api/multifashion/venta-hoy");
    expect((await ventaHoyGet(sinCookie)).status).toBe(401);
    expect((await ventaHoyGet(req("bodega"))).status).toBe(403);
    expect((await ventaHoyGet(req("vendedor"))).status).toBe(403);
  });

  it("secretaria y gerente_acs entran", async () => {
    expect((await ventaHoyGet(req("secretaria"))).status).toBe(200);
    expect((await ventaHoyGet(req("gerente_acs"))).status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. LOS DOS COMPARATIVOS VAN SIEMPRE, para todos los roles
// ═════════════════════════════════════════════════════════════════════════════
//
// Hasta el 13-ago-2026 `gerente_acs` los perdía los primeros días de cada mes:
// el 3 de agosto, "hace 7 días" es julio y caía fuera de su ventana, así que la
// ruta apagaba ese comparativo (`clampDiaComparable` devolvía null). Esa ventana
// se levantó — Daniel: *"abrile Multifashion completo"* — y con ella el único
// motivo por el que la tarjeta podía salir a medias.

describe("los comparativos no dependen del rol", () => {
  it("el 3-ago los DOS días se consultan, también para gerente_acs", async () => {
    vi.setSystemTime(new Date("2026-08-03T18:00:00Z"));
    const body = await (await ventaHoyGet(req("gerente_acs"))).json();
    expect(body.fecha).toBe("2026-08-03");
    // "hace 7 días" cae en JULIO y ahora sí se pide.
    expect(body.semanaPasada.fecha).toBe("2026-07-27");
    expect(body.ayer.fecha).toBe("2026-08-02");
  });

  it("a mitad de mes, igual", async () => {
    vi.setSystemTime(new Date("2026-08-20T18:00:00Z"));
    const body = await (await ventaHoyGet(req("gerente_acs"))).json();
    expect(body.semanaPasada.fecha).toBe("2026-08-13");
    expect(body.ayer.fecha).toBe("2026-08-19");
  });

  it("gerente_acs y admin reciben EXACTAMENTE lo mismo", async () => {
    vi.setSystemTime(new Date("2026-08-03T18:00:00Z"));
    const comoGerente = await (await ventaHoyGet(req("gerente_acs"))).text();
    const comoAdmin = await (await ventaHoyGet(req("admin"))).text();
    expect(comoGerente).toBe(comoAdmin);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. La tarjeta está montada arriba del módulo
// ═════════════════════════════════════════════════════════════════════════════

describe("UI — la tarjeta es lo primero que se ve", () => {
  const shell = readFileSync(
    path.join(process.cwd(), "src/app/multifashion/MultifashionShell.tsx"), "utf-8",
  );

  it("el shell la monta antes de los sub-tabs", () => {
    expect(shell).toContain("<VentaHoyCard");
    expect(shell.indexOf("<VentaHoyCard")).toBeLessThan(shell.indexOf("<MultifashionView"));
  });

  it("se refresca tras un 'Actualizar ahora'", () => {
    expect(shell).toMatch(/<VentaHoyCard[^>]*syncTick=\{syncTick\}/);
  });
});
