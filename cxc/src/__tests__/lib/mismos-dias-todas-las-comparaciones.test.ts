// ─────────────────────────────────────────────────────────────────────────────
// 🩸 UN PERÍODO EMPEZADO SE COMPARA CONTRA LOS MISMOS DÍAS DEL AÑO PASADO, CON
// LA FECHA DE PANAMÁ — en TODAS las comparaciones, no solo en Clientes.
//
// El 3-sep-2026 se arregló en Ventas › Clientes y una auditoría medida contra
// producción encontró seis lugares más con el mismo defecto. Este candado fija
// la definición ÚNICA (`clientes-corte-comparativo.ts`) y a cada consumidor:
//
//   #1 Resumen › Anual        — 2026 hasta hoy vs ene–sep ENTERO (grupo −7,0% → +2,5%)
//   #2 Resumen › Mes×año      — el mes en curso vs el mes ENTERO (Boston −93,5% → +2,2%)
//   #3 Vista General › Ventas — lo que va del mes vs el mes ENTERO (grupo −97,9% → −92,8%)
//   #4 Productos              — corte en HOY con la tabla hasta AYER (ver ventas-productos-periodos)
//   #5 Vendedoras             — rótulo (ver multifashion-vendedoras-rotulo)
//   #6 RPC del Resumen        — corte en UTC (FW 12-may: +1,3% → +45,1%)
//
// Fechas FIJAS, nunca `new Date()`: el borde de las 7 p.m. de Panamá aparece 5
// horas de cada 24 y una corrida al mediodía no lo caza.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { corteVsAnioAnterior, unAnioAntes, ventanaUnAnioAntes } from "@/lib/ventas/clientes-corte-comparativo";

// ── El arnés de base: la MV y la RPC, con fechas fijas ───────────────────────
const estado = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  /** Qué versiones de la RPC "existen" en la base. */
  versiones: new Set(["ventas_dashboard_prev_same_period_v4", "ventas_dashboard_prev_same_period_v3", "ventas_dashboard_prev_same_period_v2"]),
  mv: [] as Record<string, unknown>[],
  prev: { rows: [] as Record<string, unknown>[], es_periodo_parcial: true, fecha_corte: "2026-09-03", dia_corte_anio_anterior: "2025-09-03" },
}));

vi.mock("@/lib/supabase-server", () => {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "gte", "lte", "lt", "order", "limit"]) q[m] = () => q;
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null, count: Array.isArray(data) ? data.length : 0 }).then(res);
    return q;
  };
  return {
    supabaseServer: {
      from: (tabla: string) => chain(tabla === "ventas_rollup_mensual_mv" ? estado.mv : []),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        estado.rpc.push({ fn, args });
        if (fn.startsWith("ventas_dashboard_prev_same_period")) {
          if (!estado.versiones.has(fn)) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } };
          return { data: estado.prev, error: null };
        }
        if (fn === "ventas_dashboard_summary_v2" || fn === "ventas_dashboard_summary") return { data: [], error: null };
        return { data: null, error: null };
      },
    },
  };
});

// Vista General lee además los egresos y el inventario por módulos propios:
// acá no se prueban, se apagan (fallan abierto → la tarjeta de ventas igual se arma).
vi.mock("@/lib/egresos/leer", () => ({ leerEgresosMes: async () => null }));
vi.mock("@/lib/inventario/leer", () => ({ leerInventarioValorizado: async () => null }));

const mvRow = (empresa_key: string, anio: number, mes_num: number, ventas: number, utilidad = ventas * 0.3) =>
  ({ empresa_key, anio, mes_num, ventas_netas: ventas, costo_total: ventas - utilidad, utilidad });
const prevRow = (empresa: string, mes: number, venta: number, utilidad = venta * 0.3) =>
  ({ empresa, mes, total_subtotal: venta, total_costo: venta - utilidad, total_utilidad: utilidad, total_facturado: venta, filas: 0 });

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-mismos-dias"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });
afterEach(() => { vi.useRealTimers(); estado.rpc.length = 0; });

function req(url: string) {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}

/** 3-sep-2026 a las 13:18 de Panamá (18:18 UTC). */
const MEDIODIA = new Date("2026-09-03T18:18:00Z");
/** 3-sep-2026 a las 21:00 de Panamá: el reloj UTC ya dice 4-sep. */
const NUEVE_PM = new Date("2026-09-04T02:00:00Z");

// ═════════════════════════════════════════════════════════════════════════════
// La definición única
// ═════════════════════════════════════════════════════════════════════════════
describe("la definición única del corte (clientes-corte-comparativo.ts)", () => {
  it("mitad de mes: último día cargado, un año antes", () => {
    expect(corteVsAnioAnterior("2026-09-02", MEDIODIA)).toEqual({ corte: "2026-09-02", cortePrev: "2025-09-02" });
  });

  it("día 1 a las 02:35 de Panamá, sin ventas todavía: el corte es hoy, el 1", () => {
    const dia1 = new Date("2026-09-01T07:35:00Z");
    expect(corteVsAnioAnterior(null, dia1)).toEqual({ corte: "2026-09-01", cortePrev: "2025-09-01" });
    expect(corteVsAnioAnterior("2026-08-31", dia1)).toEqual({ corte: "2026-08-31", cortePrev: "2025-08-31" });
  });

  it("29-feb cae en el 28", () => {
    expect(unAnioAntes("2028-02-29")).toBe("2027-02-28");
    expect(corteVsAnioAnterior("2028-02-29", new Date("2028-03-01T15:00:00Z")).cortePrev).toBe("2027-02-28");
  });

  it("🩸 9 p.m. de Panamá: HOY sigue siendo el 3, aunque UTC diga 4", () => {
    expect(corteVsAnioAnterior(null, NUEVE_PM)).toEqual({ corte: "2026-09-03", cortePrev: "2025-09-03" });
    // Una factura nocturna cargada con día UTC 4 no corre el corte: tope en hoy de Panamá.
    expect(corteVsAnioAnterior("2026-09-04", NUEVE_PM).corte).toBe("2026-09-03");
  });

  it("ventanaUnAnioAntes: en curso se recorta, cerrada va entera, futura va entera", () => {
    expect(ventanaUnAnioAntes({ desde: "2026-09-01", hasta: "2026-09-30" }, "2026-09-02", MEDIODIA))
      .toEqual({ desde: "2025-09-01", hasta: "2025-09-02", corte: "2026-09-02", parcial: true });
    expect(ventanaUnAnioAntes({ desde: "2026-06-01", hasta: "2026-06-30" }, "2026-06-30", MEDIODIA))
      .toEqual({ desde: "2025-06-01", hasta: "2025-06-30", corte: "2026-06-30", parcial: false });
    expect(ventanaUnAnioAntes({ desde: "2026-11-01", hasta: "2026-11-30" }, null, MEDIODIA))
      .toEqual({ desde: "2025-11-01", hasta: "2025-11-30", corte: "2026-11-30", parcial: false });
  });

  it("Multifashion y Productos reúsan la definición en vez de copiarla", () => {
    const limpiar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const ranking = limpiar(readFileSync("src/lib/multifashion/productos-ranking.ts", "utf8"));
    expect(ranking).toMatch(/from "@\/lib\/ventas\/clientes-corte-comparativo"/);
    expect(ranking).not.toMatch(/(function|const)\s+unAnioAntes\b/);
    const cuerpo = /export function rangoComparativo[\s\S]*?\n}/.exec(ranking)?.[0] ?? "";
    expect(cuerpo).toMatch(/ventanaUnAnioAntes\(/);
    const productos = limpiar(readFileSync("src/lib/ventas/productos.ts", "utf8"));
    expect(productos).toMatch(/ventanaUnAnioAntes/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// #1 Resumen › Anual
// ═════════════════════════════════════════════════════════════════════════════
describe("#1 Resumen › Anual — el año en curso contra los MISMOS DÍAS, no contra ene–sep entero", () => {
  const armar = () => {
    // 2025 entero: 100 por mes → ene–sep = 900, año = 1.200. 2026: ene–ago 100 + sep 10 = 810.
    estado.mv = [];
    for (let m = 1; m <= 12; m++) estado.mv.push(mvRow("fashion_wear", 2025, m, 100));
    for (let m = 1; m <= 8; m++) estado.mv.push(mvRow("fashion_wear", 2026, m, 100));
    estado.mv.push(mvRow("fashion_wear", 2026, 9, 10));
    // 2024 cerrado, para el Δ de un año cerrado.
    for (let m = 1; m <= 12; m++) estado.mv.push(mvRow("fashion_wear", 2024, m, 50));
    // La RPC: ene–ago 2025 enteros (100) + sep 1–3 = 12.
    estado.prev = {
      rows: [...Array.from({ length: 8 }, (_, i) => prevRow("fashion_wear", i + 1, 100)), prevRow("fashion_wear", 9, 12)],
      es_periodo_parcial: true,
      fecha_corte: "2026-09-03",
      dia_corte_anio_anterior: "2025-09-03",
    };
  };

  it("el previo de 2026 es 812 (ene–ago + 1–3 sep), NO 900 (ene–sep entero)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MEDIODIA);
    armar();
    const { GET } = await import("@/app/api/ventas/resumen-anual/route");
    const body = await (await GET(req("/api/ventas/resumen-anual"))).json();
    const fw = body.empresas.find((e: { nombre: string }) => e.nombre === "Fashion Wear");
    expect(fw.byYear[2026].ventas).toBe(810);
    expect(fw.byYear[2026].prev.ventas).toBe(812);
    // Y el grupo suma lo mismo (una sola empresa en el arnés).
    expect(body.totalGrupo.byYear[2026].prev.ventas).toBe(812);
    // La respuesta dice hasta qué día comparó.
    expect(body.corte).toEqual({ fecha_corte: "2026-09-03", dia_corte_anio_anterior: "2025-09-03" });
  });

  it("un año CERRADO sigue entero contra entero desde la MV (2025 vs 2024 = 1.200 vs 600)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MEDIODIA);
    armar();
    const { GET } = await import("@/app/api/ventas/resumen-anual/route");
    const body = await (await GET(req("/api/ventas/resumen-anual"))).json();
    const fw = body.empresas.find((e: { nombre: string }) => e.nombre === "Fashion Wear");
    expect(fw.byYear[2025].prev.ventas).toBe(600);
  });

  it("pide la RPC v4 (costo con ND) y cae a v3 → v2 solo si la anterior no existe", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MEDIODIA);
    armar();
    const { GET } = await import("@/app/api/ventas/resumen-anual/route");
    await GET(req("/api/ventas/resumen-anual"));
    expect(estado.rpc.map(r => r.fn)).toEqual(["ventas_dashboard_prev_same_period_v4"]);
    estado.rpc.length = 0;
    estado.versiones.delete("ventas_dashboard_prev_same_period_v4");
    await GET(req("/api/ventas/resumen-anual"));
    expect(estado.rpc.map(r => r.fn)).toEqual(["ventas_dashboard_prev_same_period_v4", "ventas_dashboard_prev_same_period_v3"]);
    estado.rpc.length = 0;
    estado.versiones.delete("ventas_dashboard_prev_same_period_v3");
    const body = await (await GET(req("/api/ventas/resumen-anual"))).json();
    expect(estado.rpc.map(r => r.fn)).toEqual(["ventas_dashboard_prev_same_period_v4", "ventas_dashboard_prev_same_period_v3", "ventas_dashboard_prev_same_period_v2"]);
    expect(body.empresas[0].byYear[2026].prev.ventas).toBe(812);
    estado.versiones.add("ventas_dashboard_prev_same_period_v4");
    estado.versiones.add("ventas_dashboard_prev_same_period_v3");
  });

  it("🩸 9 p.m. de Panamá del 31-dic: el año en curso sigue siendo el viejo", async () => {
    // 31-dic-2026 21:00 Panamá = 1-ene-2027 02:00 UTC. Con el reloj UTC el
    // «año de hoy» sería 2027 y el previo de 2026 saldría entero desde la MV.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-01T02:00:00Z"));
    armar();
    const { GET } = await import("@/app/api/ventas/resumen-anual/route");
    const body = await (await GET(req("/api/ventas/resumen-anual"))).json();
    expect(estado.rpc.map(r => r.fn)).toContain("ventas_dashboard_prev_same_period_v4");
    expect(body.empresas[0].byYear[2026].prev.ventas).toBe(812);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// #2 Resumen › Mes×año — la celda del mes en curso
// ═════════════════════════════════════════════════════════════════════════════
describe("#2 Mes×año — la celda del mes en curso compara contra los mismos días", () => {
  it("mesEnCursoMismosDias arma el previo con lo que la RPC devolvió para ese mes", async () => {
    const { mesEnCursoMismosDias } = await import("@/components/ventas/ResumenView");
    const ventas2025 = Array(12).fill(null) as (number | null)[];
    const utilidad2025 = Array(12).fill(null) as (number | null)[];
    ventas2025[8] = 5739.7;   // sep, recortado 1–3
    utilidad2025[8] = 1000;
    const r = mesEnCursoMismosDias(
      { es_periodo_parcial: true, fecha_corte: "2026-09-03", dia_corte_anio_anterior: "2025-09-03" },
      { ventas2025, utilidad2025 },
    );
    expect(r).toEqual({ mes: 9, prev: { ventas: 5739.7, utilidad: 1000, costo: 4739.7 }, label: "vs 1–3 sep 2025" });
    // Año cerrado o sin mes parcial: nada que sobreescribir.
    expect(mesEnCursoMismosDias({ es_periodo_parcial: false, fecha_corte: null, dia_corte_anio_anterior: null }, { ventas2025, utilidad2025 })).toBeNull();
  });

  it("🔴 la matriz toma el previo del SERVIDOR (cell.prev) y no de byMonth[m][y − 1]", () => {
    const src = readFileSync("src/components/ventas/ResumenMesAnio.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
    // El error era exactamente esta lectura: el mes ENTERO del año pasado.
    expect(src).not.toMatch(/byMonth\[mi \+ 1\]\?\.\[y - 1\]/);
    expect(src).toMatch(/mesEnCurso/);
    expect(src).toMatch(/cell\?\.prev/);
  });

  it("el servidor marca el mes parcial con el día de PANAMÁ", () => {
    const src = readFileSync("src/app/api/ventas/mes-anio/route.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src).toMatch(/hoyPanama\(\)/);
    expect(src).not.toMatch(/now\.getMonth\(\)|new Date\(\)\.getMonth\(\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// #3 Vista General › tarjeta Ventas
// ═════════════════════════════════════════════════════════════════════════════
describe("#3 Vista General — el mes en curso contra los mismos días, un mes cerrado contra el mes entero", () => {
  const limpiar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const ruta = limpiar(readFileSync("src/app/api/dashboard/vista-general/route.ts", "utf8"));

  const armar = () => {
    // El año pasado en la MV: septiembre entero 89.534,20 (Boston) — lo que
    // comparaba antes. La RPC: 1–3 sep = 5.739,70. Este septiembre: 5.864,05.
    estado.mv = [mvRow("confecciones_boston", 2025, 9, 89534.2), mvRow("confecciones_boston", 2025, 8, 80000)];
    estado.prev = {
      rows: [prevRow("confecciones_boston", 8, 80000), prevRow("confecciones_boston", 9, 5739.7)],
      es_periodo_parcial: true,
      fecha_corte: "2026-09-03",
      dia_corte_anio_anterior: "2025-09-03",
    };
  };

  it("🩸 la tarjeta del mes en curso dice +2,2% (vs 1–3 sep 2025), no −93,5% (vs septiembre entero)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MEDIODIA);
    armar();
    const { GET } = await import("@/app/api/dashboard/vista-general/route");
    const body = await (await GET(req("/api/dashboard/vista-general"))).json();
    // El "actual" del mes en curso sale del summary (vacío en el arnés) → 0
    // ventas; lo que se prueba es el PREVIO y el rótulo.
    expect(body.ventas.parcial).toBe(true);
    expect(body.ventas.prevYear).toBeCloseTo(5739.7, 2);
    expect(body.ventas.prevHasta).toBe("2025-09-03");
    expect(estado.rpc.map(r => r.fn)).toContain("ventas_dashboard_prev_same_period_v4");
  });

  it("un mes CERRADO sigue contra el mes entero de la MV y no pide la RPC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MEDIODIA);
    armar();
    const { GET } = await import("@/app/api/dashboard/vista-general/route");
    const body = await (await GET(req("/api/dashboard/vista-general?mes=2026-08"))).json();
    expect(body.ventas.parcial).toBe(false);
    expect(body.ventas.prevYear).toBe(80000);
    expect(body.ventas.prevHasta).toBeNull();
    expect(estado.rpc.map(r => r.fn).some(f => f.startsWith("ventas_dashboard_prev_same_period"))).toBe(false);
  });

  it("🔴 si la RPC no contesta, el mes en curso queda SIN previo — nunca contra el mes entero", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MEDIODIA);
    armar();
    estado.versiones.clear();
    try {
      const { GET } = await import("@/app/api/dashboard/vista-general/route");
      const body = await (await GET(req("/api/dashboard/vista-general"))).json();
      expect(body.ventas.prevYear).toBeNull();
      expect(body.ventas.yoyPct).toBeNull();
    } finally {
      estado.versiones.add("ventas_dashboard_prev_same_period_v4");
      estado.versiones.add("ventas_dashboard_prev_same_period_v3");
      estado.versiones.add("ventas_dashboard_prev_same_period_v2");
    }
  });

  it("🩸 9 p.m. de Panamá del 31-ago: el mes en curso sigue siendo agosto", async () => {
    // 31-ago 21:00 Panamá = 1-sep 02:00 UTC. Con el reloj UTC «hoy» sería
    // septiembre y agosto se compararía como mes cerrado.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-01T02:00:00Z"));
    armar();
    estado.prev = { ...estado.prev, rows: [prevRow("confecciones_boston", 8, 77000)], fecha_corte: "2026-08-31", dia_corte_anio_anterior: "2025-08-31" };
    const { GET } = await import("@/app/api/dashboard/vista-general/route");
    const body = await (await GET(req("/api/dashboard/vista-general"))).json();
    expect(body.ventas.parcial).toBe(true);
    expect(body.ventas.prevYear).toBe(77000);
  });

  it("lee el previo del mes en curso con la MISMA lectura del Resumen (prev-same-period)", () => {
    expect(ruta).toMatch(/leerPrevSamePeriod\(anioSel\)/);
    expect(ruta).toMatch(/sumarPrevPorEmpresa\(/);
    // La MV queda SOLO para el mes cerrado: el filtro por mes va en la rama `else`.
    expect(ruta).toMatch(/\} else \{\s*const prevRowsMes = mvPrevRows\.filter/);
  });

  it("falla ABIERTO: si la RPC no contesta, no hay Δ — nunca el mes entero como si nada", () => {
    // La rama parcial arranca en null y solo se llena con `es_periodo_parcial`.
    expect(ruta).toMatch(/let prevYear: number \| null = null;/);
    expect(ruta).toMatch(/if \(filasPrev && prevMismosDiasRes\?\.data\?\.es_periodo_parcial\)/);
    // Y la respuesta dice hasta qué día se sumó el año pasado.
    expect(ruta).toMatch(/prevHasta,/);
  });

  it("la tarjeta dice «vs 1–3 sep 2025», no «vs septiembre 2025 (parcial)»", () => {
    const page = readFileSync("src/app/vista-general/page.tsx", "utf8");
    expect(page).toMatch(/ventas\.parcial && ventas\.prevHasta \? `1–\$\{fechaCorta\(ventas\.prevHasta\)\}/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// #6 La RPC del Resumen corta en Panamá
// ═════════════════════════════════════════════════════════════════════════════
describe("#6 ventas_dashboard_prev_same_period_v3 — el corte en el día de Panamá", () => {
  const RUTA = "supabase/migrations/20260910120000_ventas_dashboard_prev_same_period_v3_panama.sql";
  const sql = existsSync(RUTA) ? readFileSync(RUTA, "utf8").replace(/^\s*--.*$/gm, "") : "";

  it("la migración existe y define _v3 (rename, no in-place)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION ventas_dashboard_prev_same_period_v3\(p_year int\)/);
    expect(sql).not.toMatch(/FUNCTION ventas_dashboard_prev_same_period_v2\(/);
  });

  it("🩸 hoy = multifashion_hoy_panama(), el día = mf_panama_date(fecha); ni CURRENT_DATE ni fecha::date", () => {
    expect(sql).toMatch(/v_hoy\s*:=\s*multifashion_hoy_panama\(\)/);
    expect(sql).toMatch(/mf_panama_date\(fecha\) AS d/);
    expect(sql).toMatch(/MAX\(mf_panama_date\(fecha\)\)/);
    expect(sql).not.toMatch(/CURRENT_DATE/);
    expect(sql).not.toMatch(/fecha::date/);
  });

  it("el corte por empresa se topa en hoy y una empresa sin filas cae al corte global", () => {
    expect(sql).toMatch(/LEAST\(MAX\(d\), v_hoy\) AS e_cur_max/);
    expect(sql).toMatch(/LEFT JOIN empresa_cuts ec/);
    expect(sql).toMatch(/COALESCE\(ec\.e_cur_max, v_fecha_corte\)/);
  });

  it("la rama de años cerrados (MV) queda idéntica a la de _v2", () => {
    const v2 = readFileSync("supabase/migrations/20260623120000_ventas_dashboard_prev_same_period_v2.sql", "utf8");
    const ramaV2 = /ELSE\s*WITH final AS \(\s*SELECT\s*r\.empresa_key[\s\S]*?INTO v_rows_json FROM final;\s*END IF;/.exec(v2.replace(/^\s*--.*$/gm, ""))?.[0];
    const ramaV3 = /ELSE\s*WITH final AS \(\s*SELECT\s*r\.empresa_key[\s\S]*?INTO v_rows_json FROM final;\s*END IF;/.exec(sql)?.[0];
    expect(ramaV2).toBeTruthy();
    expect(ramaV3).toBe(ramaV2);
  });

  it("el código pide _v4 primero y cae a _v3 → _v2 → _v1 mientras las DDL no corran", async () => {
    const { leerPrevSamePeriod, RPC_PREV_SAME_PERIOD } = await import("@/lib/ventas/prev-same-period");
    expect(RPC_PREV_SAME_PERIOD).toBe("ventas_dashboard_prev_same_period_v4");
    estado.versiones.delete("ventas_dashboard_prev_same_period_v4");
    estado.versiones.delete("ventas_dashboard_prev_same_period_v3");
    estado.versiones.delete("ventas_dashboard_prev_same_period_v2");
    estado.versiones.add("ventas_dashboard_prev_same_period");
    const r = await leerPrevSamePeriod(2026);
    expect(r.error).toBeNull();
    expect(estado.rpc.map(x => x.fn)).toEqual([
      "ventas_dashboard_prev_same_period_v4",
      "ventas_dashboard_prev_same_period_v3",
      "ventas_dashboard_prev_same_period_v2",
      "ventas_dashboard_prev_same_period",
    ]);
    estado.versiones.add("ventas_dashboard_prev_same_period_v4");
    estado.versiones.add("ventas_dashboard_prev_same_period_v3");
    estado.versiones.add("ventas_dashboard_prev_same_period_v2");
  });

  it("y el Resumen (queries.ts) ya no llama la RPC por su cuenta: usa la lectura compartida", () => {
    const q = readFileSync("src/lib/ventas/queries.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(q).toMatch(/leerPrevSamePeriod\(year\)/);
    expect(q).not.toMatch(/rpc\("ventas_dashboard_prev_same_period/);
  });
});
