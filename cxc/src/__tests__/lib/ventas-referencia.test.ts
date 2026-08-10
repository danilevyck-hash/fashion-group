import { describe, it, expect } from "vitest";
import {
  REFERENCIA_EMPRESA_KEYS,
  UMBRALES_AGOTADO,
  signoTipo,
  agruparReferencias,
  sumarSeries,
  calcularStats,
  serieContinua,
  restarMeses,
  diffMeses,
  modeloDe,
  colorDe,
  normalizarBusqueda,
  esCodigo,
  escapeLike,
  parsearListaCodigos,
  MAX_CODIGOS_MULTI,
  SERIE_GRAFICO_MESES,
  type FilaDiario,
  type MesSerie,
} from "@/lib/ventas/referencia";
import { estadoTexto } from "@/lib/ventas/referencia-excel";

// ─────────────────────────────────────────────────────────────────────────────
// Candados del tab "Referencia" de /ventas.
//
// Los casos numéricos GRANDES son datos REALES de producción (medidos el
// 9-ago-2026 contra switch_articulo_diario, vistana):
//   · 31KAE22001001 → 48 u netas en 7 meses activos, 6.86 u/mes, última venta
//     2025-07 → a hoy (2026-08) SE AGOTÓ hace 13 meses.
//   · 31KAE22003001 → 51 u netas, 13 meses activos, 3.92 u/mes, última 2026-05.
// Si el cálculo no da ESO, está mal — no ajustar el test, ajustar el código.
// ─────────────────────────────────────────────────────────────────────────────

const fila = (parcial: Partial<FilaDiario>): FilaDiario => ({
  empresa_key: "vistana",
  fecha: "2026-01-15",
  codigo: "X001",
  descripcion: "PRUEBA",
  tipo: "FA",
  cantidad_total: 1,
  venta_total: 10,
  ...parcial,
});

// Serie real de 31KAE22001001 (vistana), unidades netas por mes.
const SERIE_22001001: MesSerie[] = [
  { mes: "2025-01", unidades: 17, venta: 382 },
  { mes: "2025-02", unidades: 10, venta: 225 },
  { mes: "2025-03", unidades: 4, venta: 90 },
  { mes: "2025-04", unidades: 5, venta: 112 },
  { mes: "2025-05", unidades: 8, venta: 180 },
  { mes: "2025-06", unidades: 2, venta: 45 },
  { mes: "2025-07", unidades: 2, venta: 44 },
];

// Serie real de 31KAE22003001 (vistana).
const SERIE_22003001: MesSerie[] = [
  { mes: "2025-02", unidades: 3, venta: 68 },
  { mes: "2025-03", unidades: 4, venta: 90 },
  { mes: "2025-04", unidades: 6, venta: 136 },
  { mes: "2025-05", unidades: 2, venta: 45 },
  { mes: "2025-06", unidades: 2, venta: 45 },
  { mes: "2025-07", unidades: 3, venta: 68 },
  { mes: "2025-09", unidades: 1, venta: 23 },
  { mes: "2025-10", unidades: 5, venta: 113 },
  { mes: "2025-11", unidades: 6, venta: 136 },
  { mes: "2026-02", unidades: 6, venta: 136 },
  { mes: "2026-03", unidades: 2, venta: 45 },
  { mes: "2026-04", unidades: 3, venta: 68 },
  { mes: "2026-05", unidades: 8, venta: 180 },
];

// Serie del caso REAL que destapó el bug del tope de antigüedad: NB2075902,
// última venta may-2024 (27 meses antes de HOY). Sus cifras son las que la
// pantalla mostraba: 23.0 u/mes real y "Para 6 meses: ~138 unidades" — una
// recomendación de compra sobre un artículo muerto hacía más de dos años.
const SERIE_NB2075902: MesSerie[] = [
  { mes: "2023-12", unidades: 35, venta: 700 },
  { mes: "2024-01", unidades: 30, venta: 600 },
  { mes: "2024-02", unidades: 27, venta: 540 },
  { mes: "2024-03", unidades: 20, venta: 400 },
  { mes: "2024-04", unidades: 15, venta: 300 },
  { mes: "2024-05", unidades: 11, venta: 220 },
];

const HOY = "2026-08";

describe("signo NC — lo que resta, RESTA", () => {
  it("NC resta; FA y CNF suman", () => {
    expect(signoTipo("NC")).toBe(-1);
    expect(signoTipo("FA")).toBe(1);
    expect(signoTipo("CNF")).toBe(1);
  });

  it("la firma del error histórico: sumar la NC en vez de restarla da EXACTO el doble de la NC de diferencia", () => {
    const filas: FilaDiario[] = [
      fila({ tipo: "FA", cantidad_total: 10, venta_total: 100 }),
      fila({ tipo: "NC", cantidad_total: 2, venta_total: 20 }), // magnitud POSITIVA
    ];
    const [ref] = agruparReferencias(filas);
    const neta = ref.serie[0];
    expect(neta.unidades).toBe(8); // 10 − 2, no 12
    expect(neta.venta).toBe(80); // 100 − 20, no 120
    // El error clásico daría 12 y 120: diferencia = 4 u / $40 = exactamente 2× la NC.
    expect(12 - neta.unidades).toBe(2 * 2);
    expect(120 - neta.venta).toBe(2 * 20);
  });

  it("la NC llega en positivo (magnitud) — nunca se asume pre-firmada", () => {
    const filas: FilaDiario[] = [fila({ tipo: "NC", cantidad_total: 3, venta_total: 30 })];
    const [ref] = agruparReferencias(filas);
    expect(ref.serie[0].unidades).toBe(-3);
    expect(ref.serie[0].venta).toBe(-30);
  });
});

describe("empresas — SOLO las 6 de Fashion Group", () => {
  it("Boston y Multifashion/ACS quedan FUERA (decisión explícita de Daniel)", () => {
    expect(REFERENCIA_EMPRESA_KEYS).not.toContain("confecciones_boston");
    expect(REFERENCIA_EMPRESA_KEYS).not.toContain("american_classic");
  });

  it("son exactamente las 6 del grupo", () => {
    expect([...REFERENCIA_EMPRESA_KEYS].sort()).toEqual(
      ["active_shoes", "active_wear", "fashion_shoes", "fashion_wear", "joystep", "vistana"].sort(),
    );
  });

  it("una referencia vive en UNA empresa: con datos sucios en dos, gana la de más unidades y no se mezclan", () => {
    const filas: FilaDiario[] = [
      fila({ empresa_key: "vistana", cantidad_total: 10 }),
      fila({ empresa_key: "joystep", cantidad_total: 2 }),
    ];
    const refs = agruparReferencias(filas);
    expect(refs).toHaveLength(1);
    expect(refs[0].empresa).toBe("vistana");
    expect(refs[0].serie[0].unidades).toBe(10); // las 2 de joystep NO se suman
  });
});

describe("meses activos vs meses calendario", () => {
  it("u/mes real divide entre meses CON venta, no entre meses calendario", () => {
    // 12 unidades repartidas en 2 meses activos dentro de un año calendario.
    const serie: MesSerie[] = [
      { mes: "2025-09", unidades: 8, venta: 80 },
      { mes: "2026-03", unidades: 4, venta: 40 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.mesesActivos).toBe(2); // no 12, no 7
    expect(s.uMesReal).toBe(6); // 12 ÷ 2 — calendario daría 1
  });

  it("un mes con neto negativo (más NC que venta) NO cuenta como activo — ni para el u/mes", () => {
    const serie: MesSerie[] = [
      { mes: "2026-01", unidades: 5, venta: 50 },
      { mes: "2026-02", unidades: -2, venta: -20 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.mesesActivos).toBe(1);
    expect(s.ultimaVenta).toBe("2026-01");
    // 3 netas ÷ 1 mes activo = 3. Dividir entre los renglones de la serie (2)
    // o entre el span calendario daría 1.5 — la mutación que hay que cazar.
    expect(s.uMesReal).toBe(3);
  });

  it("los huecos calendario no diluyen el u/mes: 12 u en 2 meses activos con 11 meses de hueco sigue siendo 6", () => {
    // Span calendario ene-2025..ene-2026 = 13 meses; renglones de la serie = 2.
    const serie: MesSerie[] = [
      { mes: "2025-01", unidades: 8, venta: 80 },
      { mes: "2026-01", unidades: 4, venta: 40 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.uMesReal).toBe(6); // 12 ÷ 2 activos — por span daría 0.92
  });

  it("caso real 31KAE22001001: 48 u en 7 meses activos → 6.9 u/mes", () => {
    const s = calcularStats(SERIE_22001001, HOY);
    expect(s.unidadesNetas).toBe(48);
    expect(s.mesesActivos).toBe(7);
    expect(s.uMesReal).toBeCloseTo(6.857, 2);
    expect(Number(s.uMesReal!.toFixed(1))).toBe(6.9);
  });

  it("caso real 31KAE22003001: 51 u en 13 meses activos → ~3.9 u/mes, última venta 2026-05", () => {
    const s = calcularStats(SERIE_22003001, HOY);
    expect(s.unidadesNetas).toBe(51);
    expect(s.mesesActivos).toBe(13);
    expect(Number(s.uMesReal!.toFixed(1))).toBe(3.9);
    expect(s.ultimaVenta).toBe("2026-05");
  });
});

describe("SE AGOTÓ — heurística validada con datos reales", () => {
  it("los umbrales tienen nombre y son los aprobados", () => {
    expect(UMBRALES_AGOTADO.MESES_SIN_VENTA).toBe(3);
    expect(UMBRALES_AGOTADO.RITMO_MINIMO).toBe(3);
    expect(UMBRALES_AGOTADO.VENTANA_RITMO_MESES).toBe(3);
    expect(UMBRALES_AGOTADO.MESES_MAX_AGOTADO).toBe(12);
    expect(UMBRALES_AGOTADO.MESES_SUGERENCIA).toBe(6);
  });

  it("caso real 31KAE22003001: última venta 2026-05 → hace 3 meses → SE AGOTÓ, con su sugerencia", () => {
    const s = calcularStats(SERIE_22003001, HOY);
    expect(s.mesesDesdeUltimaVenta).toBe(3);
    expect(s.descontinuado).toBe(false);
    expect(s.seAgoto).toBe(true);
    expect(s.sugerencia6m).toBe(24); // 3.923 u/mes × 6
    expect(estadoTexto(s)).toBe("SE AGOTÓ hace 3 m");
  });

  it("caso real 31KAE22001001: 13 meses PASA el tope de 12 → ya no es agotado, es DESCONTINUADO", () => {
    const s = calcularStats(SERIE_22001001, HOY);
    expect(s.mesesDesdeUltimaVenta).toBe(13);
    expect(s.ritmoUltimosActivos).toBeCloseTo(4, 5); // (8+2+2)/3 — buen ritmo, y aun así
    expect(s.descontinuado).toBe(true);
    expect(s.seAgoto).toBe(false);
    // Antes del tope sugería 41 unidades de algo sin vender hace más de un año.
    expect(s.sugerencia6m).toBeNull();
    expect(estadoTexto(s)).toBe("DESCONTINUADO hace 13 m");
  });

  it("borde: última venta hace 2 meses NO es agotado (necesita ≥3)", () => {
    const serie: MesSerie[] = [
      { mes: "2026-04", unidades: 5, venta: 50 },
      { mes: "2026-05", unidades: 5, venta: 50 },
      { mes: "2026-06", unidades: 5, venta: 50 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.mesesDesdeUltimaVenta).toBe(2);
    expect(s.seAgoto).toBe(false);
  });

  it("borde: hace 3 meses exactos SÍ cuenta (≥, no >)", () => {
    const serie: MesSerie[] = [
      { mes: "2026-03", unidades: 4, venta: 40 },
      { mes: "2026-04", unidades: 4, venta: 40 },
      { mes: "2026-05", unidades: 4, venta: 40 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.mesesDesdeUltimaVenta).toBe(3);
    expect(s.seAgoto).toBe(true);
  });

  it("ritmo flojo (< 3 u/mes) NO es agotado: es 'no gustó', aunque lleve meses sin vender", () => {
    const serie: MesSerie[] = [
      { mes: "2025-06", unidades: 2, venta: 20 },
      { mes: "2025-08", unidades: 1, venta: 10 },
      { mes: "2025-10", unidades: 2, venta: 20 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.mesesDesdeUltimaVenta).toBe(10);
    expect(s.ritmoUltimosActivos).toBeCloseTo(5 / 3, 5); // < 3
    expect(s.seAgoto).toBe(false);
    expect(estadoTexto(s)).toBe("ACTIVO");
  });

  it("borde: ritmo de 3 u/mes exacto SÍ cuenta (≥, no >)", () => {
    const serie: MesSerie[] = [
      { mes: "2025-10", unidades: 3, venta: 30 },
      { mes: "2025-11", unidades: 3, venta: 30 },
      { mes: "2025-12", unidades: 3, venta: 30 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.seAgoto).toBe(true);
  });

  it("el ritmo mira los últimos meses ACTIVOS, saltando los huecos", () => {
    // Meses activos no consecutivos: el promedio es de los 3 últimos CON venta.
    const serie: MesSerie[] = [
      { mes: "2025-01", unidades: 9, venta: 90 },
      { mes: "2025-04", unidades: 6, venta: 60 },
      { mes: "2025-09", unidades: 3, venta: 30 },
      { mes: "2026-01", unidades: 3, venta: 30 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.ritmoUltimosActivos).toBe(4); // (6+3+3)/3 — el 9 de ene-25 queda fuera
  });

  it("nunca vendido: sin meses activos no hay agotado ni sugerencia", () => {
    const s = calcularStats([], HOY);
    expect(s.seAgoto).toBe(false);
    expect(s.sugerencia6m).toBeNull();
    expect(estadoTexto(s)).toBe("NUNCA VENDIDO");
    expect(estadoTexto(null)).toBe("NUNCA VENDIDO");
  });
});

describe("DESCONTINUADO — el tope de antigüedad del 'se agotó'", () => {
  it("caso real NB2075902: 27 meses sin vender → DESCONTINUADO y SIN sugerencia de compra", () => {
    const s = calcularStats(SERIE_NB2075902, HOY);
    expect(s.ultimaVenta).toBe("2024-05");
    expect(s.mesesDesdeUltimaVenta).toBe(27);
    // El ritmo que tenía sigue siendo alto — por eso el bug: la vieja regla
    // solo miraba el ritmo y proponía comprar 138 unidades (23 u/mes × 6).
    expect(s.uMesReal).toBeCloseTo(23, 5);
    expect(Math.round(s.uMesReal! * UMBRALES_AGOTADO.MESES_SUGERENCIA)).toBe(138);
    expect(s.descontinuado).toBe(true);
    expect(s.seAgoto).toBe(false);
    expect(s.sugerencia6m).toBeNull();
    expect(estadoTexto(s)).toBe("DESCONTINUADO hace 27 m");
  });

  it("los dos estados son EXCLUYENTES: nunca puede estar agotado y descontinuado a la vez", () => {
    for (const serie of [SERIE_22001001, SERIE_22003001, SERIE_NB2075902, []]) {
      const s = calcularStats(serie, HOY);
      expect(s.descontinuado && s.seAgoto).toBe(false);
    }
  });

  it("descontinuado NUNCA lleva sugerencia, aunque el ritmo dé de sobra", () => {
    const serie: MesSerie[] = [
      { mes: "2024-11", unidades: 50, venta: 500 },
      { mes: "2024-12", unidades: 50, venta: 500 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.ritmoUltimosActivos).toBe(50);
    expect(s.descontinuado).toBe(true);
    expect(s.sugerencia6m).toBeNull();
  });

  it("borde: 12 meses exactos TODAVÍA es agotado (el tope es >, no ≥)", () => {
    const serie: MesSerie[] = [
      { mes: "2025-06", unidades: 5, venta: 50 },
      { mes: "2025-07", unidades: 5, venta: 50 },
      { mes: "2025-08", unidades: 5, venta: 50 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.mesesDesdeUltimaVenta).toBe(12);
    expect(s.descontinuado).toBe(false);
    expect(s.seAgoto).toBe(true);
    expect(s.sugerencia6m).toBe(30);
  });

  it("borde: 13 meses ya es descontinuado", () => {
    const serie: MesSerie[] = [
      { mes: "2025-05", unidades: 5, venta: 50 },
      { mes: "2025-06", unidades: 5, venta: 50 },
      { mes: "2025-07", unidades: 5, venta: 50 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.mesesDesdeUltimaVenta).toBe(13);
    expect(s.descontinuado).toBe(true);
    expect(s.seAgoto).toBe(false);
  });

  it("el tope NO mira el ritmo: un artículo flojo que lleva más de un año sin vender también es descontinuado", () => {
    const serie: MesSerie[] = [
      { mes: "2025-01", unidades: 1, venta: 10 },
      { mes: "2025-02", unidades: 2, venta: 20 },
    ];
    const s = calcularStats(serie, HOY);
    expect(s.ritmoUltimosActivos).toBeCloseTo(1.5, 5); // por debajo del RITMO_MINIMO
    expect(s.seAgoto).toBe(false);
    expect(s.descontinuado).toBe(true);
    expect(estadoTexto(s)).toBe("DESCONTINUADO hace 18 m");
  });

  it("nunca vendido no es descontinuado: no hay última venta que envejecer", () => {
    const s = calcularStats([], HOY);
    expect(s.descontinuado).toBe(false);
    expect(estadoTexto(s)).toBe("NUNCA VENDIDO");
  });
});

describe("precio real y ventanas 3/6/12", () => {
  it("precio real = venta neta ÷ unidades netas", () => {
    const s = calcularStats(SERIE_22001001, HOY);
    expect(s.precioReal).toBeCloseTo(1078 / 48, 4); // $22.46
  });

  it("las ventanas terminan en el mes actual inclusive (rango sobre YYYY-MM, sin EXTRACT)", () => {
    const s = calcularStats(SERIE_22003001, HOY);
    // 3m = jun/jul/ago-2026 → 0 u; 6m = mar..ago-2026 → 2+3+8 = 13; 12m = sep-25..ago-26.
    expect(s.m3.unidades).toBe(0);
    expect(s.m6.unidades).toBe(13);
    expect(s.m12.unidades).toBe(1 + 5 + 6 + 6 + 2 + 3 + 8);
  });

  it("aritmética de meses: cruces de año", () => {
    expect(restarMeses("2026-02", 3)).toBe("2025-11");
    expect(restarMeses("2026-01", 12)).toBe("2025-01");
    expect(diffMeses("2026-08", "2025-07")).toBe(13);
  });
});

describe("serie continua para el gráfico", () => {
  it("rellena los meses sin venta con 0 y recorta a los últimos meses", () => {
    const serie: MesSerie[] = [
      { mes: "2026-01", unidades: 5, venta: 50 },
      { mes: "2026-04", unidades: 2, venta: 20 },
    ];
    const cont = serieContinua(serie, "2026-06");
    expect(cont.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(cont[1].unidades).toBe(0);
    expect(cont.length).toBeLessThanOrEqual(SERIE_GRAFICO_MESES);
  });
});

describe("modelo y color — los últimos 3 dígitos", () => {
  it("31KAE22003001 → modelo 31KAE22003, color 001", () => {
    expect(modeloDe("31KAE22003001")).toBe("31KAE22003");
    expect(colorDe("31KAE22003001")).toBe("001");
  });

  it("un código sin sufijo numérico de 3 dígitos es su propio modelo", () => {
    expect(modeloDe("KACKS26-A")).toBe("KACKS26-A");
    expect(colorDe("KACKS26-A")).toBeNull();
  });
});

describe("búsqueda", () => {
  it("normaliza: sin acentos, sin minúsculas, espacios colapsados", () => {
    expect(normalizarBusqueda("  káhlo   pásscase ")).toBe("KAHLO PASSCASE");
  });

  it("esCodigo acepta códigos reales y rechaza frases", () => {
    expect(esCodigo("31KAE22003001")).toBe(true);
    expect(esCodigo("KACKS26-0046")).toBe(true);
    expect(esCodigo("KAHLO PASSCASE")).toBe(false);
  });

  it("escapeLike neutraliza comodines", () => {
    expect(escapeLike("A%B_C")).toBe("A\\%B\\_C");
  });

  it("parsearListaCodigos: espacios, saltos de línea y comas; únicos; tope 50", () => {
    const { codigos, descartados } = parsearListaCodigos("31KAE22003 31kae22003\n31KAE22002,31KAE22001");
    expect(codigos).toEqual(["31KAE22003", "31KAE22002", "31KAE22001"]);
    expect(descartados).toBe(0);

    const muchos = Array.from({ length: 60 }, (_, i) => `COD${String(i).padStart(3, "0")}`).join(" ");
    const r = parsearListaCodigos(muchos);
    expect(r.codigos).toHaveLength(MAX_CODIGOS_MULTI);
    expect(r.descartados).toBe(10);
  });
});

describe("sumar series (colores de un modelo)", () => {
  it("suma mes a mes y ordena", () => {
    const total = sumarSeries([
      [
        { mes: "2026-02", unidades: 2, venta: 20 },
        { mes: "2026-01", unidades: 1, venta: 10 },
      ],
      [{ mes: "2026-02", unidades: 3, venta: 30 }],
    ]);
    expect(total).toEqual([
      { mes: "2026-01", unidades: 1, venta: 10 },
      { mes: "2026-02", unidades: 5, venta: 50 },
    ]);
  });
});
