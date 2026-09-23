// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — RETAIL AL FRENTE, MAYOREO ABAJO (Multifashion, 23-sep-2026).
//
// Daniel, textual: «Quiero que se compare sin contar el mayoreo. Y abajo
// chiquitito me pones tanto por el mayoreo para yo saber cuánta plata entró a
// la tienda. Pero el número que en verdad me interesa es el real de ventas
// retail.»
//
// Lo que este archivo congela:
//   1. El número grande es RETAIL y todo % es retail contra retail: ninguna RPC
//      nueva lee `ventas_raw` (el bug del «+8 %» que era +15,8 %).
//   2. La línea chiquita sale SOLO con mayoreo ≠ 0; con 0, nada; en Productos,
//      nunca.
//   3. La Frontera queda fuera del ranking POR CÓDIGO (324) y Maher entra.
//   4. La tarjeta de la meta se dibuja UNA vez; el Excel del ranking solo en
//      mes cerrado.
//   5. Lo que se ve, contado contra el DOM: Resumen 6 · Vendedoras 4 ·
//      Productos 5 · Clientes 5.
//   6. Con el interruptor en `false` cada pestaña conserva su pantalla de
//      antes (las cuatro ramas viejas siguen en el fuente).
//
// Los números son los MEDIDOS contra producción el 23-sep-2026.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Ni un solo test de acá toca la base: `rpc-retail` y el resumen de Telegram
// importan el cliente, y con esto no se construye.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/multifashion",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";
import {
  CODIGOS_FUERA_DEL_RANKING, ELEMENTOS_POR_PESTANA, RETAIL_AL_FRENTE, fmtDeltaRetail,
  fueraDelRanking, lineaMayoreo, lineaMayoreoTelegram, mesCerrado,
} from "@/lib/multifashion/retail-al-frente";
import {
  comparativosDelMes, diasSinVenta, lineaHabitos, mayoreoDelAnio, mayoreoDelMes,
  proyeccionMesPorTemporada,
} from "@/lib/multifashion/resumen-minimo";
import { RPC_RETAIL, nombreRpc } from "@/lib/multifashion/rpc-retail";
import { lineaBono } from "@/lib/multifashion/bono-linea";
import { filasExcelVendedoras, nombreArchivoVendedoras } from "@/lib/multifashion/vendedoras-excel";
import { textoLineaMarcas } from "@/components/multifashion/ProductosMinimo";
import { buildMensaje } from "@/lib/acs-resumen-diario";
import { armarUniverso, type FilaFactura, type FilaRegistrado } from "@/lib/multifashion/clientes-universo";
import { avanceMeta } from "@/lib/multifashion/metas-avance";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";
import { MultifashionResumenView } from "@/components/multifashion/MultifashionResumenView";
import { VendedorasSubtab } from "@/components/multifashion/VendedorasSubtab";
import { ClientesMultifashionSubtab } from "@/components/multifashion/ClientesMultifashionSubtab";
import { ProductosSubtab } from "@/components/multifashion/ProductosSubtab";
import { agregarRanking, type FilaArticuloDiario } from "@/lib/multifashion/productos-ranking";
import { agregarProductos } from "@/lib/multifashion/productos";
import {
  armarPorMarca, armarPorMarcaComparativo, departamentoCanonico, grupoDeDepartamento, mapaArticuloGrupo,
} from "@/lib/multifashion/productos-marca";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sinComentariosSql = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

const MIG_RETAIL = "supabase/migrations/20261217140000_multifashion_retail_contra_retail.sql";
const MIG_CLIENTES = "supabase/migrations/20261217140100_multifashion_clientes_maher_entra_frontera_por_codigo.sql";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
// 1 · EL NÚMERO GRANDE ES RETAIL Y TODO % ES RETAIL CONTRA RETAIL
// ═════════════════════════════════════════════════════════════════════════════

describe("1 · retail contra retail: las RPC nuevas NO leen ventas_raw", () => {
  const sqlRetail = sinComentariosSql(leer(MIG_RETAIL));
  const sqlClientes = sinComentariosSql(leer(MIG_CLIENTES));

  it("el interruptor está PRENDIDO", () => {
    expect(RETAIL_AL_FRENTE).toBe(true);
  });

  it("🔴 ninguna de las dos migraciones nombra `ventas_raw` (el pegado del 1-may-2025 se fue)", () => {
    expect(sqlRetail).not.toMatch(/ventas_raw/);
    expect(sqlClientes).not.toMatch(/ventas_raw/);
  });

  it("las cinco RPC nuevas existen y suman SOLO `is_wholesale = false`", () => {
    for (const fn of [
      "_multifashion_retail_sum", "multifashion_overview_serie_v2", "multifashion_proyeccion_cierre_v2",
      "multifashion_detalle_mensual_v3", "multifashion_bonos_v5",
    ]) {
      expect(sqlRetail, `falta ${fn}`).toContain(`FUNCTION ${fn}(`.replace("FUNCTION multifashion_bonos_v5(", "FUNCTION public.multifashion_bonos_v5("));
    }
    // El helper del año y la base del bono de la gerente van sin mayoreo.
    const helper = sqlRetail.slice(sqlRetail.indexOf("_multifashion_retail_sum(d_start"), sqlRetail.indexOf("multifashion_overview_serie_v2"));
    expect(helper).toContain("is_wholesale = false");
    const bonos = sqlRetail.slice(sqlRetail.indexOf("multifashion_bonos_v5"));
    const gerente = bonos.slice(bonos.indexOf("INTO v_ventas_tienda"), bonos.indexOf("v_tiene_comp_ger :="));
    expect((gerente.match(/is_wholesale = false/g) ?? []).length).toBe(2);
  });

  it("🔴 CREATE OR REPLACE, nunca DROP: las versiones viejas se quedan", () => {
    expect(sqlRetail).not.toMatch(/\bDROP\b/i);
    expect(sqlClientes).not.toMatch(/\bDROP\b/i);
    expect(sqlRetail).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("cada pareja (nueva, vieja) es la que el código pide, y el interruptor elige", () => {
    expect(RPC_RETAIL.overviewSerie).toEqual(["multifashion_overview_serie_v2", "multifashion_overview_serie_v1"]);
    expect(RPC_RETAIL.proyeccionCierre).toEqual(["multifashion_proyeccion_cierre_v2", "multifashion_proyeccion_cierre_v1"]);
    expect(RPC_RETAIL.detalleMensual).toEqual(["multifashion_detalle_mensual_v3", "multifashion_detalle_mensual_v2"]);
    expect(RPC_RETAIL.bonos).toEqual(["multifashion_bonos_v5", "multifashion_bonos_v4"]);
    expect(RPC_RETAIL.retailRecurrentes).toEqual(["multifashion_retail_recurrentes_v3", "multifashion_retail_recurrentes_v2"]);
    expect(nombreRpc("bonos", true)).toBe("multifashion_bonos_v5");
    expect(nombreRpc("bonos", false)).toBe("multifashion_bonos_v4");
  });

  it("las rutas y el overview pasan por `rpcRetail` (con respaldo a la vieja)", () => {
    expect(sinComentarios(leer("src/app/api/multifashion/detalle-mensual/route.ts"))).toContain('rpcRetail("detalleMensual"');
    expect(sinComentarios(leer("src/app/api/multifashion/bonos/route.ts"))).toContain('rpcRetail("bonos"');
    expect(sinComentarios(leer("src/app/api/multifashion/retail-recurrentes/route.ts"))).toContain('rpcRetail("retailRecurrentes"');
    const queries = sinComentarios(leer("src/lib/ventas/queries.ts"));
    expect(queries).toContain('rpcRetailConReintento("overviewSerie"');
    expect(queries).toContain('rpcRetailConReintento("proyeccionCierre"');
    expect(leer("src/lib/multifashion/rpc-retail.ts")).toContain("rpcConFallbackDeVersion");
  });

  it("🔴 UN SOLO REDONDEO: un decimal y flecha, decidida sobre el % ya redondeado", () => {
    expect(fmtDeltaRetail(0.24972937)).toBe("▲ +25.0%");
    expect(fmtDeltaRetail(-0.08715617)).toBe("▼ −8.7%");
    expect(fmtDeltaRetail(0.1578)).toBe("▲ +15.8%");
    expect(fmtDeltaRetail(0.0004)).toBe("= 0.0%");
    expect(fmtDeltaRetail(null)).toBe("n/a");
  });

  it("los comparativos del mes salen en UNA línea, con los medidos de septiembre", () => {
    const c = comparativosDelMes({
      ventas: 31834.45,
      yoy: { ventas: 25473.08, tiene_data: true },
      mesAnterior: { ventas: 40662, tiene_data: true },
      year: 2026, mes: 9,
    });
    expect(c.texto).toBe("▲ +25.0% vs sep 2025 · ▼ −21.7% vs agosto");
  });

  it("«Cierra en» va por TEMPORADA (la cuenta de la meta) y se abstiene bajo el 5 %", () => {
    // Septiembre 2026 al 22: $31.834,45; mismos días 2025: $25.473,08; sep-2025 entero: $36.430,41.
    const p = proyeccionMesPorTemporada({ ventasAlCorte: 31834.45, prevMismosDias: 25473.08, prevMesCompleto: 36430.41, diaCorte: 22 });
    expect(p).not.toBeNull();
    expect(p!.dias).toBe(22);
    expect(p!.proyeccion).toBeCloseTo(31834.45 * (36430.41 / 25473.08), 2);
    // El 1 de mes, con el 3 % de la temporada, no se proyecta.
    expect(proyeccionMesPorTemporada({ ventasAlCorte: 1000, prevMismosDias: 900, prevMesCompleto: 36430.41, diaCorte: 1 })).toBeNull();
    expect(proyeccionMesPorTemporada({ ventasAlCorte: 1000, prevMismosDias: 0, prevMesCompleto: 36430.41, diaCorte: 5 })).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · LA LÍNEA CHIQUITA: SOLO CON MAYOREO ≠ 0
// ═════════════════════════════════════════════════════════════════════════════

describe("2 · la línea chiquita del mayoreo", () => {
  it("abril 2026: «+ $24,807.00 de mayoreo (1 factura) · entró $72,182.17»", () => {
    expect(lineaMayoreo({ monto: 24807, facturas: 1, retail: 47375.17 }))
      .toBe("+ $24,807.00 de mayoreo (1 factura) · entró $72,182.17");
    expect(lineaMayoreo({ monto: 28365.9, facturas: 5, retail: 390120.61 }))
      .toBe("+ $28,365.90 de mayoreo (5 facturas) · entró $418,486.51");
  });

  it("🔴 con $0 NO hay línea: septiembre, y marzo (factura + su nota de crédito)", () => {
    expect(lineaMayoreo({ monto: 0, facturas: 0, retail: 31834.45 })).toBeNull();
    expect(lineaMayoreo({ monto: 0, facturas: 2, retail: 38325.58 })).toBeNull();
    expect(lineaMayoreo(null)).toBeNull();
    expect(lineaMayoreo({ monto: Number.NaN, facturas: 1, retail: 1 })).toBeNull();
  });

  it("un mes con mayoreo NEGATIVO (solo devoluciones) lo dice con el signo", () => {
    expect(lineaMayoreo({ monto: -149, facturas: 1, retail: 1000 }))
      .toBe("− $149.00 de mayoreo (1 factura) · entró $851.00");
  });

  it("el mayoreo del mes y del año salen del overview que YA viaja", () => {
    const meses = Array.from({ length: 12 }, (_, i) => ({ ventas: i === 3 ? 24807 : 0, tickets: i === 3 ? 1 : 0 }));
    expect(mayoreoDelMes(meses, 4, 47375.17)).toEqual({ monto: 24807, facturas: 1, retail: 47375.17 });
    expect(lineaMayoreo(mayoreoDelMes(meses, 9, 31834.45))).toBeNull();
    expect(mayoreoDelAnio({ ytdVentas: 28365.9, ytdTickets: 5 }, 390120.61)).toEqual({ monto: 28365.9, facturas: 5, retail: 390120.61 });
  });

  it("Telegram: la línea corta va debajo de Mes y de Año, solo si hubo", () => {
    const base = {
      fecha: "2026-09-23", corte: "2026-09-22", syncFresco: true,
      hoy: 1000, hoyPrev: 900, fechaComparable: "2025-09-23",
      mes: 31834.45, mesPrev: 25473.08, anio: 390120.61, anioPrev: 337194.72,
    };
    const conMayoreo = buildMensaje({
      ...base,
      mayoreoMes: { monto: 0, facturas: 0, retail: base.mes },
      mayoreoAnio: { monto: 28365.9, facturas: 5, retail: base.anio },
    });
    expect(lineaMayoreoTelegram({ monto: 28365.9, facturas: 5, retail: 390120.61 }))
      .toBe("+ $28,366 de mayoreo (5 facturas) · entró $418,487");
    const lineas = conMayoreo.split("\n");
    const iAnio = lineas.findIndex((l) => l.startsWith("Año"));
    expect(lineas[iAnio + 1]).toBe("  + $28,366 de mayoreo (5 facturas) · entró $418,487");
    // Septiembre sin mayoreo: nada debajo de Mes.
    const iMes = lineas.findIndex((l) => l.startsWith("Mes"));
    expect(lineas[iMes + 1]).toMatch(/^Año/);
    // Y los números grandes no se mueven.
    expect(lineas[iMes]).toContain("$31,834");
    expect(lineas[iAnio]).toContain("$390,121");
    expect(lineas[iAnio]).toContain("▲ +15.7%");
    // Sin el dato, el mensaje es EXACTAMENTE el de siempre.
    expect(buildMensaje(base)).not.toContain("mayoreo");
  });

  it("🔴 en Productos NO se marca el mayoreo", () => {
    const src = sinComentarios(leer("src/components/multifashion/ProductosMinimo.tsx"));
    expect(src).not.toMatch(/lineaMayoreo|is_wholesale|mayoreo/i);
    const sub = sinComentarios(leer("src/components/multifashion/ProductosSubtab.tsx"));
    expect(sub).not.toMatch(/lineaMayoreo|buildNotaMayoreo/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · CLIENTES: LA FRONTERA FUERA POR CÓDIGO, MAHER ADENTRO
// ═════════════════════════════════════════════════════════════════════════════

describe("3 · La Frontera fuera POR CÓDIGO y Maher entra", () => {
  const sql = sinComentariosSql(leer(MIG_CLIENTES));

  it("el código es 324 (LA FRONTERA DUTY FREE), nunca el nombre", () => {
    expect(CODIGOS_FUERA_DEL_RANKING).toEqual([324]);
    expect(fueraDelRanking(324)).toBe(true);
    expect(fueraDelRanking(47)).toBe(false); // VENTAS MAHER
    expect(fueraDelRanking(null)).toBe(false);
  });

  it("🔴 la RPC v3 saca a la 324 por `cliente_codigo` y NO nombra «FRONTERA» ni «maher»", () => {
    const v3 = sql.slice(sql.indexOf("multifashion_retail_recurrentes_v3"));
    for (const codigo of CODIGOS_FUERA_DEL_RANKING) {
      expect((v3.match(new RegExp(`cliente_codigo NOT IN \\(${codigo}\\)`, "g")) ?? []).length).toBe(2);
    }
    expect(v3).not.toMatch(/frontera/i);
    expect(v3).not.toMatch(/maher/i);
    // Las empresas del grupo siguen afuera.
    expect(v3).toContain("cliente NOT ILIKE '%joystep%'");
    expect(v3).toContain("cliente NOT ILIKE '%active wear%'");
  });

  it("la vista expone `cliente_codigo` AL FINAL (lo exige CREATE OR REPLACE VIEW)", () => {
    const vista = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public._multifashion_sf_vw"), sql.indexOf("FROM switch_facturas"));
    expect(vista.trimEnd().endsWith("cliente_switch_id AS cliente_codigo")).toBe(true);
    expect(vista.indexOf("AS vendedor_canal")).toBeLessThan(vista.indexOf("AS cliente_codigo"));
  });

  it("la ruta `clientes-wholesale` se retiró (410) y el archivo se queda", () => {
    const ruta = sinComentarios(leer("src/app/api/multifashion/clientes-wholesale/route.ts"));
    expect(ruta).toContain("status: 410");
    expect(ruta).toContain("if (RETAIL_AL_FRENTE)");
    expect(ruta).toContain("requireRole(req, ROLES_MULTIFASHION)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · UNA TARJETA DE META · EXCEL SOLO EN MES CERRADO · LA LÍNEA DEL BONO
// ═════════════════════════════════════════════════════════════════════════════

describe("4 · Vendedoras: meta una vez, Excel al cerrar, bono en una línea", () => {
  it("`mesCerrado` es la única regla del Excel", () => {
    const corte = { anio: 2026, mes: 9 };
    expect(mesCerrado(2026, 8, corte)).toBe(true);
    expect(mesCerrado(2026, 9, corte)).toBe(false);
    expect(mesCerrado(2025, 12, corte)).toBe(true);
    expect(mesCerrado(2026, 10, corte)).toBe(false);
  });

  it("el Excel lleva las filas de la tabla, sin Bono, y sale por `workbookBlob`", () => {
    const filas = filasExcelVendedoras([
      { nombre: "SHEYNEE BATISTA", tickets: 251, ventas: 11320.43, ticket_promedio: 45.1, comision: 55.53, manager: false, top: true, delta_ventas_pct: -0.14, delta_tickets_pct: null },
    ]);
    expect(filas[0][1]).toBe("Sheynee Batista");
    expect(filas[0][3]).toBe(11320.43);
    expect(filas[0]).toHaveLength(7);
    expect(nombreArchivoVendedoras("Agosto 2026")).toMatch(/^vendedoras-multifashion-agosto-2026-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const src = sinComentarios(leer("src/components/multifashion/VendedorasSubtab.tsx"));
    expect(src).toContain("saveAs(workbookBlob(wb)");
    expect(src).toContain("mesCerrado(year, rpcMes, corte)");
    expect(leer("src/lib/multifashion/vendedoras-excel.ts")).toContain("filtroDesdeA1");
  });

  it("la línea del bono dice quién cobró, retail contra retail", () => {
    const agosto = {
      mes_evaluado: { year: 2026, mes: 8 }, es_elegible: true, fecha_max_data: "2026-09-22",
      ultimo_mes_elegible: { year: 2026, mes: 8 },
      gerente: { nombre: "JENNIFER MIRANDA", ventas_mes: 53193.56, ventas_mes_prev: 39453.49, delta_pct: 0.348, tiene_comparacion: true, bono: 100 },
      vendedoras: [{ nombre: "SHEYNEE BATISTA", tickets: 1, ventas: 1, ticket_promedio: 1, manager: false, delta_ventas_pct: null, tiene_comparacion: false, bono_vendedora: true }],
    };
    const septiembre = { ...agosto, mes_evaluado: { year: 2026, mes: 9 }, es_elegible: false, gerente: { ...agosto.gerente, bono: 0 } };
    expect(lineaBono(agosto, null)).toBe("Bono de agosto 2026 (retail contra retail): Jennifer Miranda $100 · Sheynee Batista $50.");
    expect(lineaBono(septiembre, agosto)).toBe("Bono: se define al cerrar el mes (retail contra retail). En agosto: Jennifer Miranda $100 · Sheynee Batista $50.");
    expect(lineaBono(septiembre, null)).toBe("Bono: se define al cerrar el mes (retail contra retail).");
    expect(lineaBono(null, null)).toBeNull();
  });

  it("los hábitos en UNA línea, sin «peor día»", () => {
    expect(lineaHabitos({
      mejorDow: { dow_label: "Sáb", ventas_promedio: 2770.2 },
      horaPico: "5–6 pm",
      mejorDia: { fecha: "2026-09-19", ventas: 4064.3 },
    })).toBe("Sáb es el día fuerte ($2,770) · hora pico 5–6 pm · mejor día del mes: 19 sep, $4,064");
  });

  it("«¿la tienda abrió?»: día hábil pasado en $0 sin tiquetes y que no es feriado", () => {
    const dias = Array.from({ length: 30 }, (_, i) => ({ dia: i + 1, ventas: 1000, n_tickets: 20 }));
    for (const d of [12, 13, 21, 25]) dias[d - 1] = { dia: d, ventas: 0, n_tickets: 0 }; // sáb, DOM, lun, vie
    dias[4] = { dia: 5, ventas: 0, n_tickets: 3 }; // compró y devolvió: no es «cerrada»
    const base = { dias, isMesActual: true, diaActual: 22, year: 2026, mes: 9 };
    expect(diasSinVenta({ ...base, feriados: [] }).texto).toBe("sáb 12 y lun 21 en $0 y no son feriado — ¿la tienda abrió?");
    expect(diasSinVenta({ ...base, feriados: ["2026-09-21"] }).texto).toBe("sáb 12 en $0 y no es feriado — ¿la tienda abrió?");
    // Sin la lista de feriados, no se avisa (falla cerrada); el 25 es futuro.
    expect(diasSinVenta({ ...base, feriados: null }).texto).toBeNull();
    expect(diasSinVenta({ ...base, feriados: [] }).dias).toEqual([12, 21]);
  });

  it("el mayoreo cuenta por la banda: «Tommy 71% · Calvin 24% · Karl 3% · el resto 1%»", () => {
    const g = (id: string, nombre: string, venta: number) =>
      ({ id, nombre, totales: { unidades: 1, venta, costo: 0, utilidad: 0, margen: null, grupos: 1 } }) as never;
    const texto = textoLineaMarcas([
      g("tommy", "Tommy Hilfiger", 22705.26), g("calvin", "Calvin Klein", 7623.26), g("karl", "Karl Lagerfeld", 1044.42),
      g("reebok", "Reebok", 197.4), g("joybees", "Joybees", 44.7), g("otros", "Otros", 219.68),
    ], 31834.72);
    expect(texto).toBe("Tommy 71% · Calvin 24% · Karl 3% · el resto 1%");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · LO QUE SE VE, CONTADO CONTRA EL DOM: 6 · 4 · 5 · 5
// ═════════════════════════════════════════════════════════════════════════════

const DETALLE = {
  year: 2026, mes: 9, mes_label: "Septiembre", is_mes_actual: true,
  dia_actual: 22, dias_en_mes: 30,
  dias: Array.from({ length: 30 }, (_, i) => ({
    dia: i + 1, ventas: [12, 21].includes(i + 1) ? 0 : 1400, utilidad: null,
    n_tickets: [12, 21].includes(i + 1) ? 0 : 30, ventas_mes_anterior: 1300, ventas_anio_anterior: 1100,
  })),
  totales: {
    ventas: 31834.45, mayoreo: null, ventas_total: null, utilidad: null,
    n_tickets: 658, ticket_promedio: 48.38, margen: null,
    proyeccion_cierre: 45527.63, proyeccion_dias: 22, proyeccion_dias_mes: 30, proyeccion_base: "temporada",
  },
  mes_anterior: { ventas: 40662, utilidad: null, n_tickets: 800, tiene_data: true },
  yoy: { ventas: 25473.08, utilidad: null, n_tickets: 600, tiene_data: true },
  mejor_dia: { fecha: "2026-09-19", ventas: 4064.3 },
  peor_dia: { fecha: "2026-09-07", ventas: 967.22 },
  heatmap_dia_semana: [{ dow: 6, dow_label: "Sáb", ventas_promedio: 2770, count_dias: 3 }],
  horas: [], hora_pico: null, hora_pico_ventas: null,
  anio_anterior: 2025, anio_anterior_tiene_data: true, anio_anterior_mes_completo: 36430.41,
  feriados: [],
  patrones: {
    dow: [{ dow: 6, dow_label: "Sáb", ventas_promedio: 2770.2, count_dias: 12 }],
    mejorDow: { dow: 6, dow_label: "Sáb", ventas_promedio: 2770.2, count_dias: 12 },
    horas: [{ hora: 17, ventas: 19651 }], horaPico: 17, horaPicoVentas: 19651,
    mesesUsados: 3, n_meses: 3, desde: "2026-07", hasta: "2026-09",
  },
};

const MESES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const RETAIL_MESES = [33272.39, 38381.69, 38325.58, 47375.17, 42446.03, 64503.06, 40788.67, 53193.56, 31834.45, 0, 0, 0];
const overview = (mayoreoAnio: number) => ({
  tienda: "American Classics", ubicacion: "Chiriquí", manager: "Jennifer Miranda",
  metaAnual: 800000, expectedTodayPct: 0.49,
  retail: {
    ytdVentas: 390120.61, ytdTickets: 8503, ticketProm: 45.88, margen: null, margenPrev: null,
    meses: RETAIL_MESES.map((v, i) => ({
      mes: MESES_LABEL[i], ventas: v, tickets: v > 0 ? 100 : 0, ticketProm: 0, vs2025: v > 0 ? 0.1 : null,
      fecha_corte: null, es_periodo_parcial: i === 8, dia_corte_anio_anterior: null,
    })),
  },
  total: { ytdVentas: 390120.61 + mayoreoAnio, ytdTickets: 8508, margen: 0.3329, margenPrev: 0.3317 },
  wholesale: {
    ytdVentas: mayoreoAnio, ytdTickets: mayoreoAnio > 0 ? 5 : 0, totalClientes: 3, topClienteName: "LA FRONTERA DUTY FREE",
    meses: MESES_LABEL.map((m, i) => ({ mes: m, ventas: mayoreoAnio > 0 && i === 3 ? 24807 : 0, tickets: mayoreoAnio > 0 && i === 3 ? 1 : 0 })),
  },
  proyeccionCierre: { year: 2026, tiene_proyeccion: true, proyeccion: 755341.55, cierre_prev: 652420.19, delta_pct: 0.1578, ytd_actual: 390388.26, ytd_prev: 337194.72 },
  serieActual: { year: 2026, corte: "2026-09-23", es_anio_actual: true, dias: [{ fecha: "2026-09-22", ventas: 1000, acumulado: 390120.61 }], meses: [] },
  seriePrevio: { year: 2025, corte: "2025-12-31", es_anio_actual: false, dias: [{ fecha: "2025-09-22", ventas: 900, acumulado: 337194.72 }], meses: [] },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

const respuesta = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("5 · Resumen: 6 elementos", () => {
  async function pintarResumen(mayoreoAnio: number, mes = 9) {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(DETALLE)));
    const r = render(
      <MultifashionResumenView overview={overview(mayoreoAnio)} selectedYear={2026} isClosedYear={false} mes={mes} />,
    );
    await screen.findByText("Ventas del mes");
    return r;
  }

  it("🔴 son SEIS: tres tarjetas · gráfico · hábitos · «Ver mes a mes» (plegado)", async () => {
    const { container } = await pintarResumen(28365.9);
    const pestana = container.querySelector('[data-pestana="resumen-minimo"]') as HTMLElement;
    const elementos = [...pestana.querySelectorAll("[data-elemento]")].map((e) => e.getAttribute("data-elemento"));
    expect(elementos).toEqual(["ventas-del-mes", "cierra-en", "anio", "grafico", "habitos", "ver-mes-a-mes"]);
    expect(elementos).toHaveLength(ELEMENTOS_POR_PESTANA.resumen);
    // La tabla «Mes a mes» está plegada y sigue entera detrás del botón.
    expect(pestana.querySelector('[data-tabla="mes-a-mes"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver mes a mes/ }));
    expect(pestana.querySelector('[data-tabla="mes-a-mes"]')).not.toBeNull();
  });

  it("el número grande es RETAIL y el año dice +15.8% (retail contra retail)", async () => {
    await pintarResumen(28365.9);
    const anio = screen.getByText("Año 2026 · retail").parentElement as HTMLElement;
    expect(anio.textContent).toContain("$390,120.61");
    expect(anio.textContent).toContain("▲ +15.8% vs 2025");
    expect(anio.textContent).toContain("cierra en $755,341.55");
    expect(anio.textContent).not.toContain("$418,486.51 ▲"); // el total NO es el número grande
    const mesCard = screen.getByText("Ventas del mes").parentElement as HTMLElement;
    expect(mesCard.textContent).toContain("$31,834.45");
    expect(mesCard.textContent).toContain("658 tiquetes · $48.38 promedio");
    expect(mesCard.textContent).toContain("▲ +25.0% vs sep 2025 · ▼ −21.7% vs agosto");
  });

  it("🔴 la línea chiquita sale en el año (con mayoreo) y NO en septiembre (sin)", async () => {
    await pintarResumen(28365.9);
    const lineas = screen.getAllByText(/de mayoreo/);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].textContent).toBe("+ $28,365.90 de mayoreo (5 facturas) · entró $418,486.51");
  });

  it("en abril sale en las DOS (el mes tuvo $24,807)", async () => {
    await pintarResumen(28365.9, 4);
    // El retail del fixture es el de septiembre ($31.834,45): entró = retail + $24.807.
    expect(screen.getByText("+ $24,807.00 de mayoreo (1 factura) · entró $56,641.45")).toBeTruthy();
    expect(screen.getAllByText(/de mayoreo/)).toHaveLength(2);
  });

  it("sin mayoreo en el año no hay ninguna línea", async () => {
    await pintarResumen(0);
    expect(screen.queryByText(/de mayoreo/)).toBeNull();
  });

  it("se fueron la tarjeta TICKETS, «Peor día» y el subtítulo «Retail (sin mayoreo)»", async () => {
    await pintarResumen(28365.9);
    expect(screen.queryByText("Tickets")).toBeNull();
    expect(screen.queryByText(/Peor día/)).toBeNull();
    expect(screen.queryByText(/Retail \(sin mayoreo\)/)).toBeNull();
    expect(screen.queryByText(/no incluye/)).toBeNull();
  });

  it("«Cierra en» va por temporada y dice con cuántos días", async () => {
    await pintarResumen(28365.9);
    const card = screen.getByText("Cierra en").parentElement as HTMLElement;
    expect(card.textContent).toContain("$45,527.63");
    expect(card.textContent).toContain("por temporada, con 22 días");
  });

  it("los hábitos en una línea y «¿la tienda abrió?» en el gráfico", async () => {
    await pintarResumen(28365.9);
    expect(screen.getByText("Sáb es el día fuerte ($2,770) · hora pico 5–6 pm · mejor día del mes: 19 sep, $4,064")).toBeTruthy();
    expect(screen.getByText(/sáb 12 y lun 21 en \$0 y no son feriado — ¿la tienda abrió\?/)).toBeTruthy();
  });
});

// ── Vendedoras ───────────────────────────────────────────────────────────────

const VENDEDORAS = {
  vendedoras: [
    { nombre: "SHEYNEE BATISTA", tickets: 251, ventas: 11320.43, ticket_promedio: 45.1, comision: 55.53, manager: false, top: true, delta_ventas_pct: -0.14, delta_tickets_pct: null },
    { nombre: "JENNIFER MIRANDA", tickets: 94, ventas: 6423.38, ticket_promedio: 68.33, comision: 30.29, manager: true, top: false, delta_ventas_pct: 0.31, delta_tickets_pct: null },
  ],
  total_vendedoras_periodo: 2, ventas_total: 17743.81, tickets_total: 345, ventas_total_prev: 0, tickets_total_prev: 0,
  fecha_corte: "2026-09-22", es_periodo_parcial: true, dia_corte_periodo_anterior: "2026-08-22",
};
const BONOS_AGO = {
  mes_evaluado: { year: 2026, mes: 8 }, es_elegible: true, fecha_max_data: "2026-09-22", ultimo_mes_elegible: { year: 2026, mes: 8 },
  gerente: { nombre: "JENNIFER MIRANDA", ventas_mes: 53193.56, ventas_mes_prev: 39453.49, delta_pct: 0.348, tiene_comparacion: true, bono: 100 },
  vendedoras: [{ nombre: "SHEYNEE BATISTA", tickets: 1, ventas: 1, ticket_promedio: 1, manager: false, delta_ventas_pct: null, tiene_comparacion: false, bono_vendedora: true }],
};
const BONOS_SEP = { ...BONOS_AGO, mes_evaluado: { year: 2026, mes: 9 }, es_elegible: false, gerente: { ...BONOS_AGO.gerente, bono: 0 }, vendedoras: [] };

function metaGrupal(): MetaConAvance {
  const avance = avanceMeta({ desde: "2026-09-01", hasta: "2026-12-31", hoy: "2026-09-23", objetivo: 420000, vendido: 31834.45, pesos: [] });
  return {
    id: "m1", nombre: "Viaje playa", desde: "2026-09-01", hasta: "2026-12-31", objetivo: 420000, tipo: "grupal",
    premio: "Un viaje para todas", premioMonto: null, activa: true,
    participantes: [{ clave: "SHEYNEE BATISTA", nombre: "Sheynee Batista", objetivoIndividual: null }],
    avance,
    porVendedora: [{ clave: "SHEYNEE BATISTA", nombre: "Sheynee Batista", vendido: 11320.43, aporte: 0.36, objetivo: null, avance: null }],
    aporteNoAsignado: 0.01, fuente: "rpc", temporadaDisponible: false,
  } as MetaConAvance;
}

function fetchPorUrl(rutas: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const clave = Object.keys(rutas).find((k) => url.includes(k));
    if (!clave) return { ok: false, status: 404, json: async () => ({ error: `sin ruta para ${url}` }) };
    return respuesta(rutas[clave]);
  });
}

const montar = (ui: React.ReactElement) =>
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>);

describe("5 · Vendedoras: 4 elementos", () => {
  async function pintarVendedoras(mes: number) {
    vi.stubGlobal("fetch", fetchPorUrl({
      "/api/multifashion/vendedoras": VENDEDORAS,
      "mes=8": BONOS_AGO,
      "/api/multifashion/bonos": BONOS_SEP,
      "/api/multifashion/metas": { instalado: true, puedeEditar: true, metas: [metaGrupal()], vendedoras: [] },
    }));
    const r = montar(
      <VendedorasSubtab selectedYear={2026} periodo={{ tipo: "mes", anio: 2026, mes }} corte={{ anio: 2026, mes: 9 }} conMetas />,
    );
    await screen.findAllByText("Sheynee Batista");
    await screen.findByText("Viaje playa");
    return r;
  }

  it("🔴 son CUATRO: resumen · tabla · «Nueva meta» · UNA tarjeta de meta", async () => {
    const { container } = await pintarVendedoras(9);
    const elementos = [...container.querySelectorAll("[data-elemento]")].map((e) => e.getAttribute("data-elemento"));
    expect(elementos).toEqual(["resumen", "tabla", "nueva-meta", "meta"]);
    expect(elementos).toHaveLength(ELEMENTOS_POR_PESTANA.vendedoras);
    expect(screen.getAllByLabelText("Meta Viaje playa")).toHaveLength(1);
    expect(screen.queryByText(/cuánto aportó cada una/)).toBeNull();
  });

  it("sin la frase falsa, sin columna Bono, con la línea del bono del mes cerrado", async () => {
    await pintarVendedoras(9);
    expect(screen.queryByText(/incluye mayoreo si lo hubo/)).toBeNull();
    expect(screen.queryByText("Bono")).toBeNull();
    expect(screen.queryByText("al cierre")).toBeNull();
    expect(await screen.findByText("Bono: se define al cerrar el mes (retail contra retail). En agosto: Jennifer Miranda $100 · Sheynee Batista $50.")).toBeTruthy();
  });

  it("🔴 el Excel SOLO en mes cerrado", async () => {
    await pintarVendedoras(9);
    expect(screen.queryByRole("button", { name: "Excel" })).toBeNull();
    cleanup();
    await pintarVendedoras(8);
    expect(screen.getByRole("button", { name: "Excel" })).toBeTruthy();
    expect(await screen.findByText("Bono de agosto 2026 (retail contra retail): Jennifer Miranda $100 · Sheynee Batista $50.")).toBeTruthy();
  });
});

// ── Clientes ─────────────────────────────────────────────────────────────────

describe("5 · Clientes: 5 elementos", () => {
  const HOY = "2026-09-23";
  const reg = (id: number, nombre: string): FilaRegistrado =>
    ({ cliente_switch_id: id, nombre, telefono: "6000-0000", celular: null, raw_data: null });
  const fac = (id: number, fecha: string, monto: number, mayoreo = false): FilaFactura =>
    ({ cliente_switch_id: id, cliente_nombre: null, fecha: `${fecha}T15:00:00+00:00`, tipo_comprobante: "Factura", subtotal_descuento: monto, is_wholesale: mayoreo });
  const registrados = [reg(324, "LA FRONTERA DUTY FREE"), reg(47, "VENTAS MAHER"), ...Array.from({ length: 30 }, (_, i) => reg(100 + i, `CLIENTE ${i}`))];
  const facturas = [
    fac(324, "2026-04-07", 24807, true), fac(47, "2026-02-02", 300),
    ...Array.from({ length: 30 }, (_, i) => fac(100 + i, `2025-0${1 + (i % 9)}-15`, 50 + i)),
  ];
  const { clientes, cards } = armarUniverso(registrados, facturas, HOY);
  const RETAIL = {
    fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", limit: 50, total_clientes: 3, total_ventas: 100, total_tickets: 3,
    clientes_identificados: 120, ventas_identificadas: 9358.06, tickets_identificados: 126,
    ventas_anonimas: 22475.39, tickets_anonimos: 532, pct_identificado: 29.4, clientes: [],
  };

  async function pintarClientes() {
    const fetchMock = fetchPorUrl({
      "/api/multifashion/retail-recurrentes": RETAIL,
      "/api/multifashion/fidelizacion": { hoy: HOY, detalle_activo: true, cards, clientes },
      "/api/multifashion/contactos": { hoy: HOY, porCliente: {} },
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = montar(<ClientesMultifashionSubtab selectedYear={2026} mes={9} periodo={{ tipo: "mes", anio: 2026, mes: 9 }} />);
    await screen.findByText("Frecuentes");
    await screen.findAllByText(/compró/);
    return { ...r, fetchMock };
  }

  it("🔴 son CINCO: cobertura · tarjetas · chips · lista · «Ver los N»", async () => {
    const { container } = await pintarClientes();
    const elementos = [...container.querySelectorAll("[data-elemento]")].map((e) => e.getAttribute("data-elemento"));
    expect(elementos).toEqual(["cobertura", "tarjetas", "chips", "lista", "ver-los-n"]);
    expect(elementos).toHaveLength(ELEMENTOS_POR_PESTANA.clientes);
  });

  it("tres tarjetas (sin «Dormidos»), el mostrador en la línea de cobertura, sin bloque Mayoreo ni anónimos suelto", async () => {
    await pintarClientes();
    expect(screen.queryByText("Dormidos")).toBeNull();
    expect(screen.getByText("Frecuentes")).toBeTruthy();
    expect(screen.getByText("5% pendiente")).toBeTruthy();
    expect(screen.getByText(/mostrador/).textContent).toContain("$22,475.39");
    expect(screen.queryByText("Mayoreo")).toBeNull();
    expect(screen.queryByText("Anónimos (mostrador)")).toBeNull();
    expect(screen.queryByText("Clientes identificados")).toBeNull();
  });

  it("🔴 la lista dice cuánto compró cada uno y La Frontera queda fuera POR CÓDIGO", async () => {
    const { fetchMock } = await pintarClientes();
    fireEvent.click(screen.getByRole("button", { name: /Todos/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Ver los/ }));
    expect(screen.queryByText(/Frontera/i)).toBeNull();
    // 🔴 CAMBIO DE DIRECCIÓN (Daniel, 23-sep-2026): «métel[o] para no hacer
    // excepciones por solo una persona». Maher ya entraba al RANKING y ahora
    // también sale en la lista de LLAMAR — `fuera-de-seguimiento.ts` quedó
    // vacío. La Frontera sigue fuera por código: es mayoreo, no una excepción
    // por persona.
    expect(screen.getByText("Ventas Maher")).toBeTruthy();
    expect(screen.getAllByText(/compró \$/).length).toBeGreaterThan(20);
    // La consulta del mayoreo no se hace más.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("clientes-wholesale"))).toBe(false);
  });
});

// ── Productos ────────────────────────────────────────────────────────────────

describe("5 · Productos: 5 elementos", () => {
  const dicc = [
    { articulo_id: 1, marca_id: 10, marca_nombre: "TH MENSWEAR" },
    { articulo_id: 2, marca_id: 11, marca_nombre: "CK MENSWEAR" },
    { articulo_id: 4, marca_id: 20, marca_nombre: "KL FOOTWEAR" },
    { articulo_id: 5, marca_id: 30, marca_nombre: "RBK FOOTWEAR" },
  ];
  const f = (articulo_id: number, codigo: string, descripcion: string, tipo: string, cantidad_total: number, venta_total: number, costo_total: number): FilaArticuloDiario =>
    ({ articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total });
  const ACTUAL = [
    f(1, "TH-CAMISA", "Tommy-Camisas", "FA", 40, 4000, 2000), f(2, "CK-CINTO", "Calvin-Cintos", "FA", 10, 1100, 600),
    f(4, "KL-BOTA", "Karl-Botas", "FA", 8, 1000, 800), f(5, "RBK-TENIS", "Reebok-Tenis", "FA", 5, 500, 420),
  ];
  const ANTERIOR = [f(1, "TH-CAMISA", "Tommy-Camisas", "FA", 35, 3500, 1800), f(4, "KL-BOTA", "Karl-Botas", "FA", 7, 900, 700)];
  function payload() {
    const diccCanon = dicc.map((m) => ({ ...m, marca_nombre: departamentoCanonico(m.marca_nombre) }));
    const mapa = mapaArticuloGrupo(diccCanon);
    const resumen = agregarProductos(ACTUAL, diccCanon, 50);
    const cat = agregarRanking(ACTUAL, "categoria");
    const cod = agregarRanking(ACTUAL, "codigo");
    const compCat = agregarRanking(ANTERIOR, "categoria");
    const compCod = agregarRanking(ANTERIOR, "codigo");
    return {
      year: 2026, mes: 9, periodo: "mes", desde: "2026-09-01", hasta: "2026-09-22", filasLeidas: ACTUAL.length,
      marcaDisponible: true, ...resumen,
      marcas: resumen.marcas.map((m) => ({ ...m, grupo: grupoDeDepartamento(m.marca).id })),
      porMarca: armarPorMarca(ACTUAL, mapa),
      ranking: { totales: cat.totales, categorias: cat.filas, codigos: cod.filas },
      comparativo: {
        desde: "2025-09-01", hasta: "2025-09-22", parcial: true, totales: compCat.totales,
        categorias: compCat.filas.map((x) => ({ clave: x.clave, unidades: x.unidades, venta: x.venta, utilidad: x.utilidad })),
        codigos: compCod.filas.map((x) => ({ clave: x.clave, unidades: x.unidades, venta: x.venta, utilidad: x.utilidad })),
        porMarca: armarPorMarcaComparativo(ANTERIOR, mapa),
      },
    };
  }

  async function pintarProductos() {
    vi.stubGlobal("fetch", fetchPorUrl({ "/api/multifashion/productos": payload() }));
    const r = montar(<ProductosSubtab selectedYear={2026} mes={9} periodo={{ tipo: "mes", anio: 2026, mes: 9 }} />);
    await screen.findByText("Lo que más cambió");
    return r;
  }

  it("🔴 son CINCO: alerta · banda · marcas · agrupador · cambios (+ Ver todo)", async () => {
    const { container } = await pintarProductos();
    const pestana = container.querySelector('[data-pestana="productos-minimo"]') as HTMLElement;
    const elementos = [...pestana.querySelectorAll("[data-elemento]")].map((e) => e.getAttribute("data-elemento"));
    expect(elementos).toEqual(["alerta", "banda", "marcas", "agrupador", "cambios"]);
    expect(elementos).toHaveLength(ELEMENTOS_POR_PESTANA.productos);
    // La alerta va ARRIBA de la banda.
    expect(pestana.textContent!.indexOf("Se vende mucho pero deja poco")).toBeLessThan(pestana.textContent!.indexOf("Unidades"));
  });

  it("la banda no repite la VENTA; las marcas en una línea con el detalle a un toque; una sola tabla", async () => {
    await pintarProductos();
    const banda = screen.getByText("Unidades").closest('[data-elemento="banda"]') as HTMLElement;
    expect(banda.textContent).toContain("Utilidad");
    expect(banda.textContent).toContain("Margen");
    expect(banda.querySelector("p")?.textContent).not.toBe("Venta");
    expect(screen.queryByText("Lo que más se vende")).toBeNull();
    expect(screen.queryByText("Lo que más plata deja")).toBeNull();
    expect(screen.getByText(/Tommy 61% · Calvin 17% · Karl 15% · el resto 8%/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Filtrar por marca" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /detalle/ }));
    expect(screen.getByRole("group", { name: "Filtrar por marca" })).toBeTruthy();
    // La tabla única: # · Categoría · Piezas · Venta · Deja · Margen.
    expect(screen.getByRole("columnheader", { name: "Deja" })).toBeTruthy();
    expect(screen.queryByText(/Ventas netas: las devoluciones/)).toBeNull(); // pasó al ⓘ
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · CON EL INTERRUPTOR EN FALSE, LAS CUATRO PESTAÑAS SON LAS DE ANTES
// ═════════════════════════════════════════════════════════════════════════════

describe("6 · `RETAIL_AL_FRENTE = false` = las pantallas y RPC de antes", () => {
  it("las cuatro pestañas conservan su rama vieja en el fuente", () => {
    const resumen = sinComentarios(leer("src/components/multifashion/MultifashionResumenView.tsx"));
    expect(resumen).toContain("{data && RETAIL_AL_FRENTE && (");
    expect(resumen).toContain("{data && !RETAIL_AL_FRENTE && (");
    expect(resumen).toContain("function TarjetasDelMes");
    expect(resumen).toContain(">Tickets<");
    const vendedoras = sinComentarios(leer("src/components/multifashion/VendedorasSubtab.tsx"));
    expect(vendedoras).toContain("const conBono = !esRango && !RETAIL_AL_FRENTE;");
    expect(vendedoras).toContain("{!RETAIL_AL_FRENTE && <MetasEnVendedoras />}");
    expect(vendedoras).toMatch(/>Bono<\/th>/);
    const productos = sinComentarios(leer("src/components/multifashion/ProductosSubtab.tsx"));
    expect(productos).toContain("if (RETAIL_AL_FRENTE) {");
    expect(productos).toContain('titulo="Lo que más se vende"');
    const clientes = sinComentarios(leer("src/components/multifashion/ClientesMultifashionSubtab.tsx"));
    expect(clientes).toContain("if (RETAIL_AL_FRENTE) {");
    expect(clientes).toContain('title="Mayoreo"');
    expect(clientes).toContain('label="Dormidos"');
    const metas = sinComentarios(leer("src/components/multifashion/MetasSubtab.tsx"));
    expect(metas).toContain("RETAIL_AL_FRENTE ? MetaAvanceCompacta : MetaAvanceCard");
  });

  it("las rutas vuelven a la RPC vieja y a las consultas de siempre", () => {
    const detalle = sinComentarios(leer("src/app/api/multifashion/detalle-mensual/route.ts"));
    expect(detalle).toContain("const retiradas = RETAIL_AL_FRENTE;");
    expect(detalle).toContain('retiradas ? sinConsulta : supabaseServer.rpc("proyeccion_mensual_retail_v1"');
    expect(detalle).toContain("acProy.proyeccion_retail");
    const rpc = sinComentarios(leer("src/lib/multifashion/rpc-retail.ts"));
    expect(rpc).toContain("if (!RETAIL_AL_FRENTE) return supabaseServer.rpc(vieja, args);");
    const telegram = sinComentarios(leer("src/lib/acs-resumen-diario.ts"));
    expect(telegram).toContain("RETAIL_AL_FRENTE ? leerMayoreoRango(v.inicioAnio, corte) : Promise.resolve(null)");
  });

  it("🔴 nada de lo que se GUARDA cambia: ninguna escritura nueva en el módulo", () => {
    for (const rel of [
      "src/lib/multifashion/retail-al-frente.ts", "src/lib/multifashion/resumen-minimo.ts",
      "src/lib/multifashion/rpc-retail.ts", "src/lib/multifashion/bono-linea.ts",
      "src/components/multifashion/ResumenMinimo.tsx", "src/components/multifashion/ProductosMinimo.tsx",
      "src/components/multifashion/MetaAvanceCompacta.tsx",
    ]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    }
  });
});
