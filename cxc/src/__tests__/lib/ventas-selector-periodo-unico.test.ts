// ─────────────────────────────────────────────────────────────────────────────
// VENTAS — UN SOLO SELECTOR DE PERÍODO, EL MARGEN DEL MES EN CURSO CON SU CORTE
// Y LOS TRES BOTONES DE DESCARGA (11-sep-2026). Candado de los módulos PUROS y
// de los barridos estáticos; la conducta en pantalla vive en
// `ventas-resumen-13-cambios.test.tsx`.
//
// Lo que este archivo fija, y por qué existe cada bloque:
//
//  1. `lib/ventas/periodo.ts` — la gramática de la URL (`2026` · `u12` · `u6`),
//     que cada pestaña ofrece SOLO lo que sabe servir, que un período que la
//     pestaña no sirve cae al AÑO EN CURSO (nunca a una pantalla vacía), y la
//     precedencia URL → memoria → default. 🩸 Había TRES controles de tiempo
//     en el módulo y ninguno sabía de los otros.
//  2. `lib/ventas/margen-mes-en-curso.ts` — la utilidad y el margen del mes en
//     curso van hasta el ÚLTIMO DÍA CON COSTO. 🩸 Vistana se veía 28,6 % y
//     era 22,8 %; el día 1 de cada mes el margen salía 100 %. La VENTA no se
//     toca.
//  3. `queries.ts` y la migración `20261120120000` — la RPC del corte se lee
//     solo en el año en curso, falla ABIERTA, y la DDL es aditiva.
//  4. `lib/ventas/descarga.ts` — «Descargar en Excel» en las tres pestañas, y
//     la descarga deja rastro en `activity_logs`.
//  5. El shell y la página — el selector vive arriba, en la URL y en la
//     memoria por usuario; el año suelto y la línea «8 empresas · …» se fueron.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  MEMORIA_PERIODO_VENTAS, PARAM_PERIODO_VENTAS, SIN_VENTANAS_EN_CLIENTES, VENTANAS,
  ajustarPeriodo, anioDelPeriodo, etiquetaPeriodo, opcionesPeriodo, periodoAUrl,
  periodoDesdeUrl, periodoParaProductos, periodoPorDefecto, periodoSirve, resolverPeriodo,
  rotuloCompras, rotuloVs, ventanaParaClientes, ventanasDeTab,
  type PeriodoVentas,
} from "@/lib/ventas/periodo";
import {
  aplicarCorteCosto, corteMasNuevo, pieCorteCosto, textoCorteCosto,
} from "@/lib/ventas/margen-mes-en-curso";
import { cellValue, marginRatio } from "@/lib/ventas/celda";

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
/** Sin comentarios: un comentario que nombra lo retirado no es lo retirado. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ANIO: PeriodoVentas = { tipo: "anio", anio: 2026 };
const U12: PeriodoVentas = { tipo: "ultimos", n: 12 };
const U6: PeriodoVentas = { tipo: "ultimos", n: 6 };
const CON_VENTANAS = { clientesVentanas: [12, 6] as const };

// ═════════════════════════════════════════════════════════════════════════════
// 1 · EL PERÍODO
// ═════════════════════════════════════════════════════════════════════════════

describe("1 · la gramática de la URL: `2026` · `u12` · `u6`, y basura → null", () => {
  it("va y vuelve sin perder nada", () => {
    for (const p of [ANIO, U12, U6, { tipo: "anio", anio: 2024 } as PeriodoVentas]) {
      expect(periodoDesdeUrl(periodoAUrl(p))).toEqual(p);
    }
    expect(periodoAUrl(ANIO)).toBe("2026");
    expect(periodoAUrl(U12)).toBe("u12");
  });

  it("basura → null, nunca una pantalla en blanco ni un año imposible", () => {
    for (const raw of ["", null, undefined, "u3", "u24", "1999", "2101", "2026-09", "hola", "u"]) {
      expect(periodoDesdeUrl(raw), String(raw)).toBeNull();
    }
  });

  it("las ventanas del sistema son 12 y 6, en ese orden", () => {
    expect([...VENTANAS]).toEqual([12, 6]);
  });
});

describe("2 · cada pestaña ofrece SOLO lo que sabe servir", () => {
  it("Resumen: solo años. Productos: años y las dos ventanas", () => {
    expect([...ventanasDeTab("resumen", CON_VENTANAS)]).toEqual([]);
    expect([...ventanasDeTab("productos", SIN_VENTANAS_EN_CLIENTES)]).toEqual([12, 6]);
  });

  it("Clientes: las ventanas las dice el SERVIDOR — sin la migración, ninguna", () => {
    expect([...ventanasDeTab("clientes", SIN_VENTANAS_EN_CLIENTES)]).toEqual([]);
    expect([...ventanasDeTab("clientes", CON_VENTANAS)]).toEqual([12, 6]);
    expect([...ventanasDeTab("clientes", { clientesVentanas: [12] })]).toEqual([12]);
  });

  it("periodoSirve: un año lo sirven las tres; una ventana, solo quien la tiene", () => {
    for (const tab of ["resumen", "clientes", "productos"] as const) {
      expect(periodoSirve(tab, ANIO, SIN_VENTANAS_EN_CLIENTES), tab).toBe(true);
    }
    expect(periodoSirve("resumen", U12, CON_VENTANAS)).toBe(false);
    expect(periodoSirve("clientes", U12, SIN_VENTANAS_EN_CLIENTES)).toBe(false);
    expect(periodoSirve("clientes", U12, CON_VENTANAS)).toBe(true);
    expect(periodoSirve("productos", U6, SIN_VENTANAS_EN_CLIENTES)).toBe(true);
  });

  it("🔴 lo que la pestaña no sirve cae al AÑO EN CURSO, nunca a otra cosa", () => {
    expect(ajustarPeriodo(U12, "resumen", 2026, CON_VENTANAS)).toEqual(ANIO);
    expect(ajustarPeriodo(U6, "clientes", 2026, SIN_VENTANAS_EN_CLIENTES)).toEqual(ANIO);
    // Lo que sí sirve, tal cual — incluido otro año.
    expect(ajustarPeriodo({ tipo: "anio", anio: 2024 }, "resumen", 2026, CON_VENTANAS)).toEqual({ tipo: "anio", anio: 2024 });
    expect(ajustarPeriodo(U12, "productos", 2026, SIN_VENTANAS_EN_CLIENTES)).toEqual(U12);
    expect(periodoPorDefecto(2026)).toEqual(ANIO);
  });

  it("las opciones van en el orden aprobado: años (del más nuevo) y después los rangos", () => {
    const productos = opcionesPeriodo({ tab: "productos", anios: [2024, 2026, 2025], anioEnCurso: 2026, cap: SIN_VENTANAS_EN_CLIENTES });
    expect(productos.map((o) => o.valor)).toEqual(["2026", "2025", "2024", "u12", "u6"]);
    expect(productos.map((o) => o.label)).toEqual(["Año 2026", "Año 2025", "Año 2024", "Últimos 12 meses", "Últimos 6 meses"]);
    expect(productos.map((o) => o.grupo)).toEqual(["Años", "Años", "Años", "Rangos", "Rangos"]);
    const resumen = opcionesPeriodo({ tab: "resumen", anios: [2025], anioEnCurso: 2026, cap: CON_VENTANAS });
    // El año en curso siempre está aunque la lista de datos no lo traiga.
    expect(resumen.map((o) => o.valor)).toEqual(["2026", "2025"]);
  });
});

describe("3 · URL manda; sin URL, la memoria; sin nada, el año en curso", () => {
  it("la precedencia", () => {
    const base = { tab: "productos" as const, anioEnCurso: 2026, cap: SIN_VENTANAS_EN_CLIENTES };
    expect(resolverPeriodo({ ...base, url: "u12", memoria: "2025" })).toEqual(U12);
    expect(resolverPeriodo({ ...base, url: null, memoria: "2025" })).toEqual({ tipo: "anio", anio: 2025 });
    expect(resolverPeriodo({ ...base, url: "", memoria: "" })).toEqual(ANIO);
    expect(resolverPeriodo({ ...base, url: "basura", memoria: "u6" })).toEqual(U6);
  });

  it("y lo resuelto se AJUSTA a la pestaña: u12 en el Resumen es el año en curso", () => {
    expect(resolverPeriodo({ url: "u12", memoria: null, tab: "resumen", anioEnCurso: 2026, cap: CON_VENTANAS })).toEqual(ANIO);
  });

  it("los nombres de la URL y de la memoria son los del módulo, no literales sueltos", () => {
    expect(PARAM_PERIODO_VENTAS).toBe("periodo");
    expect(MEMORIA_PERIODO_VENTAS).toBe("ventas_periodo");
    const shell = plano(leer("src/app/ventas/VentasShell.tsx"));
    expect(shell).toContain("useUrlState(PARAM_PERIODO_VENTAS");
    expect(shell).toContain("useLastUsed(MEMORIA_PERIODO_VENTAS");
    expect(shell).toContain("resolverPeriodo({");
  });
});

describe("4 · los rótulos y lo que cada pestaña le pide a su ruta", () => {
  it("etiqueta, columna de compras y «vs»", () => {
    expect(etiquetaPeriodo(ANIO)).toBe("Año 2026");
    expect(etiquetaPeriodo(U12)).toBe("Últimos 12 meses");
    expect(rotuloCompras(ANIO)).toBe("Compras · Año 2026");
    expect(rotuloCompras(U6)).toBe("Compras · Últimos 6 meses");
    expect(rotuloVs(ANIO, 2025)).toBe("vs 2025");
    expect(rotuloVs(U12, 2025)).toBe("vs año anterior");
  });

  it("Productos: un año → `ytd` de ESE año; una ventana → `6m`/`12m` desde hoy", () => {
    expect(periodoParaProductos({ tipo: "anio", anio: 2025 }, 2026)).toEqual({ periodo: "ytd", year: 2025 });
    expect(periodoParaProductos(U12, 2026)).toEqual({ periodo: "12m", year: 2026 });
    expect(periodoParaProductos(U6, 2026)).toEqual({ periodo: "6m", year: 2026 });
  });

  it("Clientes: la ventana, o null para el año. El año de cualquier período", () => {
    expect(ventanaParaClientes(ANIO)).toBeNull();
    expect(ventanaParaClientes(U12)).toBe(12);
    expect(anioDelPeriodo({ tipo: "anio", anio: 2024 }, 2026)).toBe(2024);
    expect(anioDelPeriodo(U6, 2026)).toBe(2026);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · EL MARGEN DEL MES EN CURSO
// ═════════════════════════════════════════════════════════════════════════════

describe("5 · 🩸 la utilidad y el margen del mes en curso van hasta el último día con costo", () => {
  // Los números REALES de Vistana el 11-sep-2026 (`_medir-ventas-13-cambios.mjs`).
  const ventas = [96_654, null, null, null, null, null, null, null, 60_956.10, null, null, null];
  const utilidad = [20_000, null, null, null, null, null, null, null, 60_956.10 - 43_548.58, null, null, null];
  const costo = [76_654, null, null, null, null, null, null, null, 43_548.58, null, null, null];

  it("con el corte: utilidad = venta hasta el corte − costo, y esa venta es la base del margen", () => {
    const r = aplicarCorteCosto(ventas, utilidad, costo, 9, { costoHasta: "2026-09-10", ventasHastaCosto: 56_418 });
    expect(r.utilidad[8]).toBeCloseTo(56_418 - 43_548.58, 2);
    expect(r.ventasParaMargen[8]).toBe(56_418);
    // 22,8 %, no 28,6 %: el número que Daniel vio en pantalla contra el real.
    expect(marginRatio(r.ventasParaMargen[8]!, r.utilidad[8]!)).toBeCloseTo(0.2281, 3);
    expect(marginRatio(ventas[8]!, utilidad[8]!)).toBeCloseTo(0.2856, 3);
    // Los demás meses, intactos. Y la VENTA del mes no se toca: es de la pantalla.
    expect(r.utilidad[0]).toBe(20_000);
    expect(r.ventasParaMargen[0]).toBe(96_654);
    expect(ventas[8]).toBe(60_956.10);
  });

  it("🔴 el día 1, sin un día de costo, la utilidad va en null y el margen no inventa un 100 %", () => {
    const r = aplicarCorteCosto([null, 13_169.38], [null, 13_169.38], [null, null], 2, { costoHasta: null, ventasHastaCosto: 0 });
    expect(r.utilidad[1]).toBeNull();
    expect(r.ventasParaMargen[1]).toBe(0);
    expect(cellValue({ ventas: 13_169.38, utilidad: r.utilidad[1], ventasMargen: r.ventasParaMargen[1] }, "margen")).toBeNull();
  });

  it("sin corte (año cerrado, o la RPC todavía no existe) las series salen tal cual", () => {
    const sin = aplicarCorteCosto(ventas, utilidad, costo, 9, undefined);
    expect(sin.utilidad).toEqual(utilidad);
    expect(sin.ventasParaMargen).toEqual(ventas);
    const cerrado = aplicarCorteCosto(ventas, utilidad, costo, 0, { costoHasta: "2026-09-10", ventasHastaCosto: 1 });
    expect(cerrado.utilidad).toEqual(utilidad);
    // Y no muta lo que recibió.
    expect(utilidad[8]).toBeCloseTo(17_407.52, 2);
  });

  it("la celda divide el margen por su BASE (ventasMargen) cuando la trae, y por ventas si no", () => {
    expect(cellValue({ ventas: 1000, utilidad: 300, ventasMargen: 600 }, "margen")).toBeCloseTo(0.5, 6);
    expect(cellValue({ ventas: 1000, utilidad: 300 }, "margen")).toBeCloseTo(0.3, 6);
    // Las otras dos métricas no miran la base.
    expect(cellValue({ ventas: 1000, utilidad: 300, ventasMargen: 600 }, "ventas")).toBe(1000);
    expect(cellValue({ ventas: 1000, utilidad: 300, ventasMargen: 600 }, "utilidad")).toBe(300);
  });

  it("y la pantalla lo DICE: «al 10 de septiembre»", () => {
    expect(textoCorteCosto("2026-09-10")).toBe("al 10 de septiembre");
    expect(textoCorteCosto(null)).toBeNull();
    expect(pieCorteCosto("2026-09-10")).toBe("Utilidad y margen de septiembre al 10 de septiembre, el último día con costo cargado");
    expect(pieCorteCosto(null)).toBeNull();
    expect(corteMasNuevo({ a: { costoHasta: "2026-09-04", ventasHastaCosto: 1 }, b: { costoHasta: "2026-09-10", ventasHastaCosto: 1 }, c: { costoHasta: null, ventasHastaCosto: 0 } })).toBe("2026-09-10");
    expect(corteMasNuevo({})).toBeNull();
  });
});

describe("6 · el corte se lee solo en el año en curso y falla ABIERTA", () => {
  const q = plano(leer("src/lib/ventas/queries.ts"));

  it("la RPC se pide con el año en curso de PANAMÁ, nunca en un año cerrado", () => {
    expect(q).toContain("const hoy = hoyPanama()");
    expect(q).toContain("mesEnCurso > 0 ? leerCorteCosto(year) : Promise.resolve(null)");
    expect(q).toContain('supabaseServer.rpc("ventas_mes_en_curso_corte_costo", { p_anio: year })');
  });

  it("un error de la RPC devuelve null (la pantalla se comporta como hoy), y no tira la página", () => {
    const fn = /async function leerCorteCosto[\s\S]*?\n}/.exec(q)?.[0] ?? "";
    expect(fn).toContain("if (r.error)");
    expect(fn).toContain("return null");
    expect(fn).toContain("catch");
    expect(fn).not.toContain("throw");
  });

  it("el margen por empresa y el del grupo se calculan con las series CORREGIDAS", () => {
    expect(q).toContain("aplicarCorteCosto(cur26[k], cur26Util[k], cur26Costo[k], mesEnCurso, corte[k])");
    expect(q).toContain("sumFiltered(ventasMargen, costo)");
    expect(q).toContain("sumFiltered(corregidas[k].ventasParaMargen, cur26Costo[k])");
    expect(q).toContain("ventasParaMargen: ventasMargen");
    expect(q).toContain("corte_costo:");
  });

  it("la migración es ADITIVA: crea la RPC del corte y no toca ninguna otra", () => {
    const sql = leer("supabase/migrations/20261120120000_ventas_mes_en_curso_corte_costo.sql");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION ventas_mes_en_curso_corte_costo\(p_anio int\)/);
    expect(sql).toMatch(/costo_hasta date/);
    expect(sql).toMatch(/subtotal_hasta_costo numeric/);
    expect(sql).toMatch(/MAX\(a\.fecha\) AS costo_hasta/);
    expect(sql).toMatch(/AT TIME ZONE 'America\/Panama'/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION ventas_mes_en_curso_corte_costo\(int\) TO service_role/);
    // La misma fórmula firmada del resumen: NC resta, ND suma.
    expect(sql).toMatch(/WHEN f\.tipo_comprobante = 'Nota de Crédito' THEN -f\.subtotal_descuento/);
    // Una sola sentencia que crea, y crea SOLO la RPC del corte.
    const creates = sql.match(/CREATE (OR REPLACE )?(FUNCTION|VIEW|MATERIALIZED VIEW|TABLE|INDEX)[^\n(]*/g) ?? [];
    expect(creates).toHaveLength(1);
    expect(creates[0]).toContain("ventas_mes_en_curso_corte_costo");
    expect(sql).not.toMatch(/^\s*(DROP|ALTER TABLE|DELETE|UPDATE)\b/m);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 · «Descargar en Excel», con rastro
// ═════════════════════════════════════════════════════════════════════════════

describe("7 · los tres botones dicen «Descargar en Excel» y dejan rastro", () => {
  it("el rótulo es uno y lo usan las tres pestañas (y el celular del Resumen)", async () => {
    const { ROTULO_DESCARGAR_EXCEL, ACCION_DESCARGA_EXCEL, MODULO_ACTIVIDAD_VENTAS } = await import("@/lib/ventas/descarga");
    expect(ROTULO_DESCARGAR_EXCEL).toBe("Descargar en Excel");
    expect(ACCION_DESCARGA_EXCEL).toBe("descarga_excel");
    expect(MODULO_ACTIVIDAD_VENTAS).toBe("ventas");
    for (const rel of [
      "src/components/ventas/ResumenView.tsx",
      "src/components/ventas/ResumenViewMobile.tsx",
      "src/components/ventas/ClientesView.tsx",
      "src/components/ventas/ProductosView.tsx",
    ]) {
      const src = plano(leer(rel));
      expect(src, rel).toContain("ROTULO_DESCARGAR_EXCEL");
      expect(src, rel).not.toMatch(/> Excel<|>Excel<\/Button>/);
    }
    for (const rel of ["src/components/ventas/ResumenView.tsx", "src/components/ventas/ClientesView.tsx", "src/components/ventas/ProductosView.tsx"]) {
      expect(plano(leer(rel)), rel).toContain("anotarDescarga(");
    }
  });

  it("anotarDescarga escribe por logActivityClient con la pestaña adentro", async () => {
    vi.resetModules();
    const logActivityClient = vi.fn();
    vi.doMock("@/lib/logActivityClient", () => ({ logActivityClient }));
    const { anotarDescarga } = await import("@/lib/ventas/descarga");
    anotarDescarga("resumen", { modo: "utilidad", anio: 2026 });
    expect(logActivityClient).toHaveBeenCalledWith({
      action: "descarga_excel",
      module: "ventas",
      details: { pestana: "resumen", modo: "utilidad", anio: 2026 },
    });
    vi.doUnmock("@/lib/logActivityClient");
  });

  it("el Excel del Resumen baja el MODO que se ve, y el de Ventas es byte a byte el de siempre", () => {
    const excel = plano(leer("src/lib/ventas/excel.ts"));
    expect(excel).toContain('export async function buildResumenSheet(data: VentasResumen, modo: ModoExcelResumen = "ventas")');
    expect(excel).toContain('if (modo === "utilidad") return buildUtilidadSheet(data)');
    expect(plano(leer("src/components/ventas/ResumenView.tsx"))).toContain("exportResumenToExcel(data, viewMode)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 · EL SHELL Y LA PÁGINA
// ═════════════════════════════════════════════════════════════════════════════

describe("8 · el selector vive arriba, y lo que se fue no vuelve", () => {
  const shell = plano(leer("src/app/ventas/VentasShell.tsx"));
  const page = plano(leer("src/app/ventas/page.tsx"));

  it("el shell monta el selector único y no el año suelto ni la línea de empresas", () => {
    expect(shell).toContain("<PeriodoSelect");
    expect(shell).toContain("data-selector-periodo-ventas");
    expect(shell).not.toContain("alcanceDeLaPestana");
    expect(shell).not.toContain("<Select ");
    expect(shell).not.toContain("SelectTrigger");
  });

  it("la página arma el período que trae la URL, y le dice al shell cuál armó", () => {
    expect(page).toContain("searchParams?.[PARAM_PERIODO_VENTAS]");
    expect(page).toContain("periodoDesdeUrl(");
    expect(page).toContain("periodoServidor={periodoAUrl(periodo)}");
    expect(page).toContain("fetchClientes({ year, ventana })");
  });

  it("el bundle se pide por lo PEDIDO y cada pestaña toma lo suyo", () => {
    expect(shell).toContain('["ventas-bundle", keyPeriodo]');
    expect(shell).toContain("esPeriodoInicial = keyPeriodo === periodoServidor");
    expect(shell).toContain("<ClientesView");
    expect(shell).toContain("periodo={periodo}");
    expect(shell).toContain("<ProductosView periodo={periodo} anioEnCurso={anioEnCurso} />");
  });
});
