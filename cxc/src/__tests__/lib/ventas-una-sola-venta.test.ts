// ─────────────────────────────────────────────────────────────────────────────
// UNA SOLA VENTA — la misma venta da el MISMO número en Resumen, Clientes ›
// Utilidad y Productos (23-sep-2026). Candado.
//
// 🩸 Fashion Wear 2026 daba $2.411.430,20 en el Resumen, $2.406.204,79 en
// Productos y $2.389.954,14 en Utilidad, y ninguna pestaña decía por qué.
// Daniel: «Debe de dar igual». Lo que este archivo fija:
//
//  1. LA DEFINICIÓN ES UNA: contado incluido, notas de débito incluidas, notas
//     de crédito restando. El CASE de SQL se GENERA de `tipos-comprobante.ts`
//     y las migraciones que lo llevan (el Resumen y la v3 de Utilidad) tienen
//     ese texto, no una copia.
//  2. PRODUCTOS cuadra con el Resumen: su total sale de la MISMA lectura
//     (`leerDashboardSummary`) y lo que el listado no trae se desglosa.
//  3. UTILIDAD cuadra con el Resumen: la v3, o la v2 más el contado.
//  4. 2022 y 2023 NO se rechazan; un año sin datos dice desde cuándo los hay.
//  5. El Excel de Clientes marca el mostrador y su TOTAL dice qué suma.
//  6. La matriz dice «no vendiste» en las SEIS llamadas, no «n/a».
//  7. Con el interruptor en `false`, todo como antes.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  UNA_SOLA_VENTA, sqlVentaFirmada, normalizarSql, signoVenta,
  sumarResumenEnVentana, aniosDeVentana, armarCuadreProductos, textoCuadreProductos,
  filasDeCierreProductos, ROTULO_NOTAS_DEBITO, ROTULO_SIN_ARTICULO,
  agregarContado, armarCuadreUtilidad, textoCuadreUtilidad,
  mesAnioLargo, textoDatosDesde, ventanaAntesDeLosDatos, ventanaUtcDePanama,
  nombreMostradorExcel, rotuloTotalClientes, MARCA_MOSTRADOR_EXCEL,
  basePrevia, deltaCeldaDe, TIPOS_SIN_REPORTE_DE_UTILIDAD,
} from "@/lib/ventas/una-sola-venta";
import { SIN_VENTA_ANTERIOR, VENTA_ANTERIOR_MINIMA, type CeldaBase } from "@/lib/ventas/celda";
import { SIN_COMPARATIVO } from "@/lib/variacion";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const sinComentariosSql = (src: string) => src.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

const MIG_RESUMEN_VW = "supabase/migrations/20260606010000_switch_ventas_unificado_vw_solo_switch.sql";
const MIG_RESUMEN_V2 = "supabase/migrations/20260915120000_costo_con_notas_de_debito.sql";
const MIG_UTILIDAD_V3 = "supabase/migrations/20261217120000_utilidad_por_cliente_v3_una_sola_venta.sql";

// ── El doble de Supabase: rpc + tablas con fixtures ─────────────────────────
type Fila = Record<string, unknown>;
const { doble } = vi.hoisted(() => ({
  doble: {
    rpc: [] as { fn: string; args: Record<string, unknown> }[],
    tablas: [] as { tabla: string; filtros: [string, string, unknown][] }[],
    rpcData: {} as Record<string, unknown>,
    rpcAusentes: new Set<string>(),
    tablaData: {} as Record<string, Fila[]>,
  },
}));

vi.mock("@/lib/requireRole", () => ({ requireRole: () => ({ role: "admin", userName: "Daniel" }) }));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      doble.rpc.push({ fn, args });
      if (doble.rpcAusentes.has(fn)) {
        return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } };
      }
      return { data: doble.rpcData[fn] ?? [], error: null };
    },
    from: (tabla: string) => {
      const reg = { tabla, filtros: [] as [string, string, unknown][] };
      doble.tablas.push(reg);
      const filas = () => {
        let out = doble.tablaData[tabla] ?? [];
        for (const [op, col, v] of reg.filtros) {
          if (op === "eq") out = out.filter((f) => f[col] === v);
          if (op === "in") out = out.filter((f) => (v as unknown[]).includes(f[col]));
        }
        return out;
      };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { reg.filtros.push(["eq", c, v]); return q; },
        in: (c: string, v: unknown) => { reg.filtros.push(["in", c, v]); return q; },
        gte: (c: string, v: unknown) => { reg.filtros.push(["gte", c, v]); return q; },
        lte: (c: string, v: unknown) => { reg.filtros.push(["lte", c, v]); return q; },
        lt: (c: string, v: unknown) => { reg.filtros.push(["lt", c, v]); return q; },
        order: () => q,
        limit: async () => ({ data: filas().slice(0, 1), error: null }),
        range: async (a: number, b: number) => ({ data: filas().slice(a, b + 1), error: null, count: filas().length }),
      };
      return q;
    },
  },
}));

beforeEach(() => {
  doble.rpc.length = 0;
  doble.tablas.length = 0;
  doble.rpcAusentes.clear();
  doble.rpcData = {};
  doble.tablaData = {};
});

const req = (url: string) => ({ nextUrl: new URL(url) }) as never;

// ═══ 1 · La definición es UNA ═══════════════════════════════════════════════
describe("1 · una sola definición: contado y ND suman, NC resta", () => {
  it("el interruptor está PRENDIDO, y vive en su propio archivo", () => {
    expect(UNA_SOLA_VENTA).toBe(true);
    const src = sinComentarios(leer("src/lib/ventas/una-sola-venta-interruptor.ts"));
    expect(src).toMatch(/export const UNA_SOLA_VENTA = true;/);
  });

  it("`signoVenta`: Transacción +1 · Nota de Débito +1 · Nota de Crédito −1 · Factura +1", () => {
    expect(signoVenta("Transacción")).toBe(1);
    expect(signoVenta("Nota de Débito")).toBe(1);
    expect(signoVenta("Nota de Crédito")).toBe(-1);
    expect(signoVenta("Factura")).toBe(1);
    expect(signoVenta("Tiquete")).toBe(1);
  });

  it("🔴 el CASE generado es el que llevan el Resumen (vista y RPC v2) y la v3 de Utilidad", () => {
    const vw = normalizarSql(sinComentariosSql(leer(MIG_RESUMEN_VW)));
    const v2 = normalizarSql(sinComentariosSql(leer(MIG_RESUMEN_V2)));
    const v3 = normalizarSql(sinComentariosSql(leer(MIG_UTILIDAD_V3)));
    expect(vw).toContain(normalizarSql(sqlVentaFirmada("subtotal_descuento")));
    expect(v2).toContain(normalizarSql(sqlVentaFirmada("f.subtotal_descuento", "f.tipo_comprobante")));
    expect(v3).toContain(normalizarSql(sqlVentaFirmada("f.subtotal_descuento", "f.tipo_comprobante")));
  });

  it("el CASE generado nombra los cuatro que suman y el que resta, y nada más", () => {
    const sql = sqlVentaFirmada("x");
    expect(sql).toContain("IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN x");
    expect(sql).toContain("= 'Nota de Crédito' THEN -x");
    expect(sql).toContain("ELSE 0");
  });

  it("la v3 es ADITIVA (no toca la v2 ni la v1), lee switch_facturas por año de PANAMÁ y devuelve el código", () => {
    const sql = sinComentariosSql(leer(MIG_UTILIDAD_V3));
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION utilidad_por_cliente_v3/);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
    expect(sql).not.toMatch(/FUNCTION\s+utilidad_por_cliente_v2\s*\(/);
    expect(sql).not.toMatch(/FUNCTION\s+utilidad_por_cliente\s*\(/);
    expect(sql).toContain("FROM switch_facturas f");
    expect(sql).toContain("AT TIME ZONE 'America/Panama'");
    expect(sql).toContain("FROM switch_factura_utilidad u");
    expect(sql).toContain("FULL OUTER JOIN");
    expect(sql).toContain("COALESCE(p_empresas, ARRAY[]::text[])");
    for (const k of ["vistana", "fashion_wear", "joystep", "confecciones_boston", "american_classic"]) {
      expect(sql).not.toContain(`'${k}'`);
    }
  });

  it("el contado que el reporte de utilidad no lista: Transacción y Tiquete", () => {
    expect([...TIPOS_SIN_REPORTE_DE_UTILIDAD].sort()).toEqual(["Tiquete", "Transacción"]);
    for (const t of TIPOS_SIN_REPORTE_DE_UTILIDAD) expect(signoVenta(t)).toBe(1);
  });
});

// ═══ 2 · Productos ═══════════════════════════════════════════════════════════
const RESUMEN_2026 = [
  { empresa: "fashion_wear", mes: 1, total_subtotal: "1000.00" },
  { empresa: "fashion_wear", mes: 2, total_subtotal: "2000.00" },
  { empresa: "fashion_wear", mes: 9, total_subtotal: "500.00" },
  { empresa: "fashion_wear", mes: 12, total_subtotal: "9999.00" },
  { empresa: "vistana", mes: 1, total_subtotal: "77777.00" },
];

describe("2 · Productos: el total es el del Resumen, y lo que falta se dice", () => {
  it("`sumarResumenEnVentana` suma los meses de la empresa dentro de la ventana", () => {
    expect(sumarResumenEnVentana(RESUMEN_2026, "fashion_wear", 2026, "2026-01-01", "2026-09-22")).toBe(3500);
    expect(sumarResumenEnVentana(RESUMEN_2026, "fashion_wear", 2026, "2026-02-01", "2026-02-28")).toBe(2000);
    expect(sumarResumenEnVentana(RESUMEN_2026, "joystep", 2026, "2026-01-01", "2026-12-31")).toBe(0);
    expect(aniosDeVentana("2025-10-01", "2026-09-22")).toEqual([2025, 2026]);
  });

  it("el cuadre: ND aparte, y el resto es «renglones que el reporte no trae» — nunca un cero inventado", () => {
    const c = armarCuadreProductos({ ventaResumen: 2411430.2, listado: 2406204.79, notasDebito: { monto: 4871.48, n: 12, costo: 100 } });
    expect(c.sinArticulo).toBe(353.93);
    expect(textoCuadreProductos(c)).toBe(
      "El total es el del Resumen e incluye $4,871.48 de 12 notas de débito sin artículo y $353.93 de renglones que el reporte por artículo de Switch no trae",
    );
    expect(filasDeCierreProductos(c).map((f) => f.rotulo)).toEqual([ROTULO_NOTAS_DEBITO, ROTULO_SIN_ARTICULO]);
    // Cuadra solo: nada que decir, ninguna fila de cierre.
    const limpio = armarCuadreProductos({ ventaResumen: 100, listado: 100, notasDebito: { monto: 0, n: 0, costo: 0 } });
    expect(textoCuadreProductos(limpio)).toBeNull();
    expect(filasDeCierreProductos(limpio)).toEqual([]);
    expect(textoCuadreProductos(null)).toBeNull();
  });

  it("🔴 la ruta: `totales.venta` es la suma del Resumen para la ventana, con el desglose", async () => {
    doble.rpcData = {
      ventas_dashboard_summary_v2: RESUMEN_2026,
      switch_top_descripciones_reciente: [
        { descripcion: "CAMISA", num_codigos: 1, cantidad: 10, venta: 3000, costo: 1800, margen: 0.4 },
        { descripcion: "PANTALÓN", num_codigos: 1, cantidad: 2, venta: 250, costo: 100, margen: 0.6 },
      ],
    };
    doble.tablaData = {
      switch_articulo_diario: [{ fecha: "2026-09-22" }],
      switch_facturas: [
        { id: "a", empresa_key: "fashion_wear", tipo_comprobante: "Nota de Débito", subtotal_descuento: "200.00" },
        { id: "b", empresa_key: "fashion_wear", tipo_comprobante: "Nota de Débito", subtotal_descuento: "30.00" },
      ],
      switch_factura_utilidad: [
        { id: "u", empresa_key: "fashion_wear", tipo_comprobante: "Nota de Débito", costo: "120.00" },
      ],
    };
    const { GET } = await import("@/app/api/ventas/productos/route");
    const res = await GET(req("http://x/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=ytd"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // 1000 + 2000 + 500 (ene, feb, sep) — el diciembre de 9999 queda afuera de
    // la ventana, y vistana no entra.
    expect(body.totales.venta).toBe(3500);
    expect(body.cuadre).toEqual({
      ventaResumen: 3500, listado: 3250,
      notasDebito: { monto: 230, n: 2, costo: 120 },
      sinArticulo: 20,
    });
    // El costo lleva el de las ND (la única fuente que lo tiene), como el Resumen.
    expect(body.totales.costo).toBe(1900 + 120);
    expect(doble.rpc.some((c) => c.fn === "ventas_dashboard_summary_v2" && c.args.p_anio === 2026)).toBe(true);
    // Las ND se piden a switch_facturas POR TIPO y a utilidad por su costo.
    const nd = doble.tablas.find((t) => t.tabla === "switch_facturas");
    expect(nd?.filtros).toContainEqual(["eq", "tipo_comprobante", "Nota de Débito"]);
    expect(nd?.filtros).toContainEqual(["eq", "empresa_key", "fashion_wear"]);
  });

  it("la ventana PREVIA (`previo=1`) no se cuadra: alimenta solo el Δ", async () => {
    doble.rpcData = { switch_top_descripciones_reciente: [{ descripcion: "X", num_codigos: 1, cantidad: 1, venta: 10, costo: 5, margen: 0.5 }] };
    doble.tablaData = { switch_articulo_diario: [{ fecha: "2026-09-22" }] };
    const { GET } = await import("@/app/api/ventas/productos/route");
    const body = await (await GET(req("http://x/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=ytd&previo=1"))).json();
    expect(body.cuadre).toBeUndefined();
    expect(body.totales.venta).toBe(10);
    expect(doble.rpc.some((c) => c.fn.startsWith("ventas_dashboard_summary"))).toBe(false);
  });

  it("si el Resumen no se puede leer, el total es el del listado — falla ABIERTA, sin cuadre", async () => {
    doble.rpcAusentes.add("ventas_dashboard_summary_v2").add("ventas_dashboard_summary");
    doble.rpcData = { switch_top_descripciones_reciente: [{ descripcion: "X", num_codigos: 1, cantidad: 1, venta: 10, costo: 5, margen: 0.5 }] };
    doble.tablaData = { switch_articulo_diario: [{ fecha: "2026-09-22" }] };
    const { GET } = await import("@/app/api/ventas/productos/route");
    const body = await (await GET(req("http://x/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=ytd"))).json();
    expect(body.cuadre).toBeUndefined();
    expect(body.totales.venta).toBe(10);
  });
});

// ═══ 3 · Utilidad ════════════════════════════════════════════════════════════
const EMPRESA = (k: string) => k.toUpperCase();

describe("3 · Utilidad: el contado entra y el cuadre contra el Resumen se dice", () => {
  it("`agregarContado`: suma al cliente que ya está, crea al que solo compró de contado, y el margen no se diluye", () => {
    const base = [{
      clienteSwitchId: 7, cliente: "BOUTI", empresaKey: "fashion_wear", empresa: "FW",
      nDocs: 3, ventas: 1000, costo: 700, utilidad: 300, margen: 0.3,
    }];
    const out = agregarContado(base, [
      { empresaKey: "fashion_wear", clienteSwitchId: 7, cliente: "BOUTI", monto: 50 },
      { empresaKey: "fashion_wear", clienteSwitchId: 1, cliente: "VENTAS", monto: 20 },
      { empresaKey: "fashion_wear", clienteSwitchId: 1, cliente: "VENTAS", monto: 5 },
    ], EMPRESA);
    const bouti = out.find((r) => r.clienteSwitchId === 7)!;
    expect(bouti.ventas).toBe(1050);
    expect(bouti.ventasSinCosto).toBe(50);
    expect(bouti.ventasConCosto).toBe(1000);
    expect(bouti.margen).toBe(0.3);
    expect(bouti.nDocs).toBe(4);
    const mostrador = out.find((r) => r.clienteSwitchId === 1)!;
    expect(mostrador).toMatchObject({ ventas: 25, ventasSinCosto: 25, costo: 0, utilidad: 0, margen: null, empresa: "FASHION_WEAR", nDocs: 2 });
  });

  it("`textoCuadreUtilidad`: dice el contado y si cuadra, o cuánto falta y por qué", () => {
    expect(textoCuadreUtilidad(armarCuadreUtilidad({ ventaResumen: 100, ventaPantalla: 100, sinCosto: 30 })))
      .toBe("incluye $30.00 de ventas de contado, que Switch reporta sin costo · el mismo total que el Resumen");
    expect(textoCuadreUtilidad(armarCuadreUtilidad({ ventaResumen: 100, ventaPantalla: 99.99, sinCosto: 0 })))
      .toBe("le faltan $0.01 contra el Resumen (redondeo por documento del reporte de utilidad)");
    expect(textoCuadreUtilidad(null)).toBeNull();
  });

  it("🔴 la ruta con la v3: la venta es la del Resumen, el mostrador se marca por CÓDIGO y el cuadre da 0", async () => {
    doble.rpcData = {
      utilidad_por_cliente_v3: [
        { empresa_key: "fashion_wear", cliente_switch_id: 7, cliente: "BOUTI", codigo: "D-25", n_docs: 4, total_subtotal: "1050", ventas_con_costo: "1000", total_costo: "700", total_utilidad: "300", pct_utilidad: 30 },
        { empresa_key: "fashion_wear", cliente_switch_id: 1, cliente: "VENTAS", codigo: "TCKCTA", n_docs: 2, total_subtotal: "25", ventas_con_costo: "0", total_costo: null, total_utilidad: null, pct_utilidad: null },
      ],
      ventas_dashboard_summary_v2: [{ empresa: "fashion_wear", mes: 1, total_subtotal: "1075" }, { empresa: "confecciones_boston", mes: 1, total_subtotal: "5000" }],
    };
    doble.tablaData = { switch_factura_utilidad: [{ fecha: "2026-01-03" }] };
    const { GET } = await import("@/app/api/ventas/utilidad-cliente/route");
    const body = await (await GET(req("http://x/api/ventas/utilidad-cliente?year=2026"))).json();
    expect(doble.rpc[0].fn).toBe("utilidad_por_cliente_v3");
    expect(body.totales.ventas).toBe(1075);
    expect(body.cuadre).toEqual({ ventaResumen: 1075, ventaPantalla: 1075, diferencia: 0, sinCosto: 75 });
    const mostrador = body.rows.find((r: { clienteSwitchId: number }) => r.clienteSwitchId === 1);
    expect(mostrador.mostrador).toBe(true);
    expect(mostrador.margen).toBeNull();
    const bouti = body.rows.find((r: { clienteSwitchId: number }) => r.clienteSwitchId === 7);
    expect(bouti.mostrador).toBe(false);
    expect(bouti.margen).toBeCloseTo(0.3, 10);
    expect(bouti.ventasSinCosto).toBe(50);
  });

  it("🔴 sin la v3 (migración pendiente): v2 + el contado de switch_facturas, y el cuadre lo dice", async () => {
    doble.rpcAusentes.add("utilidad_por_cliente_v3");
    doble.rpcData = {
      utilidad_por_cliente_v2: [
        { empresa_key: "fashion_wear", cliente_switch_id: 7, cliente: "BOUTI", n_docs: 3, total_subtotal: "1000", total_costo: "700", total_utilidad: "300", pct_utilidad: 30 },
      ],
      ventas_dashboard_summary_v2: [{ empresa: "fashion_wear", mes: 1, total_subtotal: "1075.01" }],
    };
    doble.tablaData = {
      switch_factura_utilidad: [{ fecha: "2026-01-03" }],
      switch_facturas: [
        { id: "1", empresa_key: "fashion_wear", tipo_comprobante: "Transacción", cliente_switch_id: 7, cliente_nombre: "BOUTI", subtotal_descuento: "50" },
        { id: "2", empresa_key: "fashion_wear", tipo_comprobante: "Transacción", cliente_switch_id: 1, cliente_nombre: "VENTAS", subtotal_descuento: "25" },
      ],
      switch_clientes: [{ id: "c1", empresa_key: "fashion_wear", cliente_switch_id: 1, codigo: "TCKCTA" }],
    };
    const { GET } = await import("@/app/api/ventas/utilidad-cliente/route");
    const body = await (await GET(req("http://x/api/ventas/utilidad-cliente?year=2026"))).json();
    expect(doble.rpc.map((c) => c.fn).slice(0, 2)).toEqual(["utilidad_por_cliente_v3", "utilidad_por_cliente_v2"]);
    // El contado se pidió POR TIPO (los que el reporte de utilidad no lista).
    const fac = doble.tablas.find((t) => t.tabla === "switch_facturas");
    expect(fac?.filtros).toContainEqual(["in", "tipo_comprobante", [...TIPOS_SIN_REPORTE_DE_UTILIDAD]]);
    expect(body.totales.ventas).toBe(1075);
    expect(body.cuadre).toEqual({ ventaResumen: 1075.01, ventaPantalla: 1075, diferencia: -0.01, sinCosto: 75 });
    expect(body.rows.find((r: { clienteSwitchId: number }) => r.clienteSwitchId === 1).mostrador).toBe(true);
  });
});

// ═══ 4 · 2022 y 2023 ═════════════════════════════════════════════════════════
describe("4 · 2022 y 2023 se sirven; un año sin datos dice desde cuándo los hay", () => {
  it("`mesAnioLargo` · `textoDatosDesde` · `ventanaAntesDeLosDatos`", () => {
    expect(mesAnioLargo("2023-02-01")).toBe("febrero 2023");
    expect(mesAnioLargo("basura")).toBe("");
    expect(textoDatosDesde("Productos", "2023-02-01", "Fashion Wear")).toBe("Productos de Fashion Wear tiene datos desde febrero 2023");
    expect(textoDatosDesde("Utilidad", "2026-01-03")).toBe("Utilidad tiene datos desde enero 2026");
    expect(ventanaAntesDeLosDatos("2023-02-01", "2022-12-31")).toBe(true);
    expect(ventanaAntesDeLosDatos("2023-02-01", "2023-12-31")).toBe(false);
    expect(ventanaAntesDeLosDatos(null, "2022-12-31")).toBe(false);
    expect(ventanaUtcDePanama("2026-01-01", "2026-12-31")).toEqual({ ini: "2026-01-01T05:00:00.000Z", fin: "2027-01-01T05:00:00.000Z" });
  });

  it("Productos acepta 2023 y pide ESE año a la base; 2021 sigue siendo inválido", async () => {
    doble.rpcData = { switch_top_descripciones_reciente: [{ descripcion: "X", num_codigos: 1, cantidad: 1, venta: 10, costo: 5, margen: 0.5 }] };
    doble.tablaData = { switch_articulo_diario: [{ fecha: "2023-02-01" }] };
    const { GET } = await import("@/app/api/ventas/productos/route");
    const res = await GET(req("http://x/api/ventas/productos?empresa=fashion_wear&year=2023&periodo=ytd"));
    expect(res.status).toBe(200);
    const rpc = doble.rpc.find((c) => c.fn === "switch_top_descripciones_reciente")!;
    expect(rpc.args.p_desde).toBe("2023-01-01");
    expect(rpc.args.p_hasta).toBe("2023-12-31");
    expect((await GET(req("http://x/api/ventas/productos?empresa=fashion_wear&year=2021&periodo=ytd"))).status).toBe(400);
  });

  it("Productos sin datos del año: contesta vacío con `datosDesde` («desde febrero 2023»), no un error", async () => {
    doble.rpcData = { switch_top_descripciones_reciente: [] };
    doble.tablaData = { switch_articulo_diario: [{ fecha: "2023-02-01", empresa_key: "fashion_wear" }] };
    const { GET } = await import("@/app/api/ventas/productos/route");
    const res = await GET(req("http://x/api/ventas/productos?empresa=fashion_wear&year=2022&periodo=ytd"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.productos).toEqual([]);
    expect(body.datosDesde).toBe("2023-02-01");
  });

  it("las rutas hijas de Productos (códigos, por cliente) aceptan 2023 también", async () => {
    const src = ["src/app/api/ventas/productos/codigos/route.ts", "src/app/api/ventas/productos/por-cliente/route.ts"];
    for (const f of src) {
      const plano = sinComentarios(leer(f));
      expect(plano, `${f} sigue rechazando los años viejos`).toContain("anioValido(year)");
      expect(plano).not.toMatch(/year\s*<\s*2024\s*\|\|\s*year\s*>\s*2100\s*\)/);
    }
  });

  it("Utilidad: 2023 no se rechaza; como el reporte arranca en 2026, contesta vacío y dice desde cuándo", async () => {
    doble.tablaData = { switch_factura_utilidad: [{ fecha: "2026-01-03" }] };
    const { GET } = await import("@/app/api/ventas/utilidad-cliente/route");
    const res = await GET(req("http://x/api/ventas/utilidad-cliente?year=2023"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(body.datosDesde).toBe("2026-01-03");
    // No se molesta a la RPC por un año que no tiene.
    expect(doble.rpc).toEqual([]);
    expect((await GET(req("http://x/api/ventas/utilidad-cliente?year=2021"))).status).toBe(400);
  });
});

// ═══ 5 · El Excel de Clientes ════════════════════════════════════════════════
const celdas = (ws: Record<string, unknown>) =>
  Object.entries(ws).filter(([k]) => /^[A-Z]+\d+$/.test(k)).map(([, c]) => (c as { v: unknown }).v);

const cliente = (id: string, nombre: string, ytd: number) => ({
  rank: 1, id, nombre, empresa: "Fashion Wear", empresaKey: "fashion_wear", ytd, delta: null,
  ultima: "", ultimaIso: "", empresas_count: 1, wa: "", prev: 0, isOrphan: false,
});

describe("5 · el Excel de Clientes se explica solo", () => {
  it("🔴 el mostrador va marcado «fuera del ranking» y el TOTAL dice cuántos clientes suma, sin el mostrador", async () => {
    const { buildClientesSheet } = await import("@/lib/ventas/clientes-excel");
    const ws = await buildClientesSheet({
      year: 2026, periodo: { tipo: "anio", anio: 2026 }, anioComparativo: 2025, empresa: "todas",
      filas: [cliente("D-25", "BOUTI", 1000), cliente("D-30", "XEXI", 500)],
      mostrador: cliente("TCKCTA", "VENTAS LOCAL", 300),
    });
    const v = celdas(ws as Record<string, unknown>);
    expect(v).toContain(nombreMostradorExcel("VENTAS LOCAL"));
    expect(nombreMostradorExcel("VENTAS LOCAL")).toBe(`VENTAS LOCAL · ${MARCA_MOSTRADOR_EXCEL}`);
    expect(v).toContain("TOTAL · 2 clientes, sin el mostrador");
    // El número del total NO cambia: es el del ranking.
    expect(v).toContain(1500);
    expect(v).not.toContain(1800);
  });

  it("sin mostrador en pantalla, el TOTAL solo cuenta", async () => {
    const { buildClientesSheet } = await import("@/lib/ventas/clientes-excel");
    const ws = await buildClientesSheet({
      year: 2026, periodo: { tipo: "anio", anio: 2026 }, anioComparativo: 2025, empresa: "todas",
      filas: [cliente("D-25", "BOUTI", 1000)], mostrador: null,
    });
    expect(celdas(ws as Record<string, unknown>)).toContain("TOTAL · 1 cliente");
    expect(rotuloTotalClientes(91, true)).toBe("TOTAL · 91 clientes, sin el mostrador");
  });

  it("el Excel de Productos suma su TOTAL: las filas de cierre van al final", async () => {
    const { buildProductosSheet } = await import("@/lib/ventas/productos");
    const ws = await buildProductosSheet({
      empresa: "fashion_wear", year: 2026, mes: null, periodo: "ytd", desde: "2026-01-01", hasta: "2026-09-22",
      totales: { venta: 3500, costo: 2020, margen: null },
      productos: [
        { descripcion: "CAMISA", num_codigos: 1, cantidad: 10, venta: 3000, costo: 1800, margen: 0.4 },
        { descripcion: "PANTALÓN", num_codigos: 1, cantidad: 2, venta: 250, costo: 100, margen: 0.6 },
      ],
      cuadre: { ventaResumen: 3500, listado: 3250, notasDebito: { monto: 230, n: 2, costo: 120 }, sinArticulo: 20 },
    });
    const v = celdas(ws as Record<string, unknown>);
    expect(v).toContain(ROTULO_NOTAS_DEBITO);
    expect(v).toContain(ROTULO_SIN_ARTICULO);
    // Las ventas de las filas (3000 + 250 + 230 + 20) suman el total (3500).
    const ventas = v.filter((x): x is number => typeof x === "number" && [3000, 250, 230, 20].includes(x));
    expect(ventas.reduce((s, n) => s + n, 0)).toBe(3500);
    expect(v).toContain(3500);
  });
});

// ═══ 6 · La matriz dice palabras, en las SEIS llamadas ═══════════════════════
describe("6 · «n/a» se dice con palabras en las seis llamadas de la matriz", () => {
  const joystepMarzo: CeldaBase = { ventas: 14_500, ventasPrev: 0, utilidad: 4_100, utilidadPrev: 0 };

  it("`basePrevia`: ventas/utilidad → el valor previo del modo; margen → la VENTA previa", () => {
    const c: CeldaBase = { ventas: 10, ventasPrev: 40, utilidad: 3, utilidadPrev: 12 };
    expect(basePrevia(c, "ventas")).toBe(40);
    expect(basePrevia(c, "utilidad")).toBe(12);
    expect(basePrevia(c, "margen")).toBe(40);
  });

  it("`deltaCeldaDe`: «no vendiste» con base en cero, «casi no vendiste» bajo $100, nunca la sigla", () => {
    expect(deltaCeldaDe(joystepMarzo, "ventas", null, true)?.texto).toBe(SIN_VENTA_ANTERIOR);
    expect(deltaCeldaDe({ ...joystepMarzo, ventasPrev: 40 }, "ventas", null, true)?.texto).toBe(VENTA_ANTERIOR_MINIMA);
    expect(deltaCeldaDe(joystepMarzo, "margen", null, true)?.texto).toBe(SIN_VENTA_ANTERIOR);
    expect(deltaCeldaDe(joystepMarzo, "ventas", null, true)?.texto).not.toBe(SIN_COMPARATIVO);
    // Sin `na` no hay nada que decir.
    expect(deltaCeldaDe(joystepMarzo, "ventas", null, false)).toBeNull();
  });

  it("🔴 las seis llamadas (cuatro de escritorio, dos de celular) pasan por `deltaCeldaDe`; ninguna llama `deltaCelda` a secas", () => {
    const escritorio = sinComentarios(leer("src/components/ventas/ResumenView.tsx"));
    const celular = sinComentarios(leer("src/components/ventas/ResumenViewMobile.tsx"));
    expect((escritorio.match(/deltaCeldaDe\(/g) ?? []).length).toBe(4);
    expect((celular.match(/deltaCeldaDe\(/g) ?? []).length).toBe(2);
    expect(escritorio).not.toMatch(/[^A-Za-z]deltaCelda\(/);
    expect(celular).not.toMatch(/[^A-Za-z]deltaCelda\(/);
  });
});

// ═══ 7 · Con el interruptor en `false`, todo como antes ══════════════════════
describe("7 · interruptor en `false` = las pantallas de antes", () => {
  async function conInterruptorApagado<T>(fn: () => Promise<T>): Promise<T> {
    vi.resetModules();
    // El interruptor vive en su propio archivo, así que apagarlo ahí lo apaga
    // para TODOS los que lo leen (el módulo puro incluido).
    vi.doMock("@/lib/ventas/una-sola-venta-interruptor", () => ({ UNA_SOLA_VENTA: false }));
    try {
      return await fn();
    } finally {
      vi.doUnmock("@/lib/ventas/una-sola-venta-interruptor");
      vi.resetModules();
    }
  }

  it("Productos: sin cuadre, el total es la suma del listado y 2023 vuelve a rechazarse", async () => {
    doble.rpcData = {
      ventas_dashboard_summary_v2: RESUMEN_2026,
      switch_top_descripciones_reciente: [{ descripcion: "X", num_codigos: 1, cantidad: 1, venta: 10, costo: 5, margen: 0.5 }],
    };
    doble.tablaData = { switch_articulo_diario: [{ fecha: "2026-09-22" }] };
    await conInterruptorApagado(async () => {
      const { GET } = await import("@/app/api/ventas/productos/route");
      const body = await (await GET(req("http://x/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=ytd"))).json();
      expect(body.cuadre).toBeUndefined();
      expect(body.totales.venta).toBe(10);
      expect(doble.rpc.some((c) => c.fn.startsWith("ventas_dashboard_summary"))).toBe(false);
      expect((await GET(req("http://x/api/ventas/productos?empresa=fashion_wear&year=2023&periodo=ytd"))).status).toBe(400);
    });
  });

  it("Utilidad: la v2 de siempre, sin contado ni cuadre", async () => {
    doble.rpcData = {
      utilidad_por_cliente_v2: [
        { empresa_key: "fashion_wear", cliente_switch_id: 7, cliente: "BOUTI", n_docs: 3, total_subtotal: "1000", total_costo: "700", total_utilidad: "300", pct_utilidad: 30 },
      ],
    };
    doble.tablaData = { switch_facturas: [{ id: "1", empresa_key: "fashion_wear", tipo_comprobante: "Transacción", cliente_switch_id: 7, cliente_nombre: "BOUTI", subtotal_descuento: "50" }] };
    await conInterruptorApagado(async () => {
      const { GET } = await import("@/app/api/ventas/utilidad-cliente/route");
      const body = await (await GET(req("http://x/api/ventas/utilidad-cliente?year=2026"))).json();
      expect(doble.rpc.map((c) => c.fn)).toEqual(["utilidad_por_cliente_v2"]);
      expect(body.totales.ventas).toBe(1000);
      expect(body.cuadre).toBeUndefined();
      expect(doble.tablas).toEqual([]);
    });
  });

  it("los Excel: el mostrador sin marca, «TOTAL» a secas y sin filas de cierre", async () => {
    await conInterruptorApagado(async () => {
      const { buildClientesSheet } = await import("@/lib/ventas/clientes-excel");
      const ws = await buildClientesSheet({
        year: 2026, periodo: { tipo: "anio", anio: 2026 }, anioComparativo: 2025, empresa: "todas",
        filas: [cliente("D-25", "BOUTI", 1000)], mostrador: cliente("TCKCTA", "VENTAS LOCAL", 300),
      });
      const v = celdas(ws as Record<string, unknown>);
      expect(v).toContain("VENTAS LOCAL");
      expect(v).toContain("TOTAL");
      expect(v.some((x) => typeof x === "string" && x.includes(MARCA_MOSTRADOR_EXCEL))).toBe(false);
      const { buildProductosSheet } = await import("@/lib/ventas/productos");
      const wp = await buildProductosSheet({
        empresa: "fashion_wear", year: 2026, mes: null, periodo: "ytd", desde: "2026-01-01", hasta: "2026-09-22",
        totales: { venta: 3250, costo: 1900, margen: null },
        productos: [{ descripcion: "CAMISA", num_codigos: 1, cantidad: 10, venta: 3000, costo: 1800, margen: 0.4 }],
        cuadre: { ventaResumen: 3500, listado: 3250, notasDebito: { monto: 230, n: 2, costo: 120 }, sinArticulo: 20 },
      });
      expect(celdas(wp as Record<string, unknown>)).not.toContain(ROTULO_NOTAS_DEBITO);
    });
  });

  it("la matriz: vuelve la sigla «n/a»", async () => {
    await conInterruptorApagado(async () => {
      const { deltaCeldaDe: apagado } = await import("@/lib/ventas/una-sola-venta");
      expect(apagado(joystepBase, "ventas", null, true)?.texto).toBe(SIN_COMPARATIVO);
    });
  });
  const joystepBase: CeldaBase = { ventas: 14_500, ventasPrev: 0, utilidad: 4_100, utilidadPrev: 0 };
});
