import { describe, it, expect } from "vitest";
import {
  REFERENCIA_EMPRESA_KEYS,
  signoTipo,
  agruparReferencias,
  sumarSeries,
  restarMeses,
  diffMeses,
  modeloDe,
  colorDe,
  normalizarBusqueda,
  esCodigo,
  escapeLike,
  ordenarComoPegado,
  parsearListaCodigos,
  pedidosNoEncontrados,
  posicionEnPegado,
  MAX_CODIGOS_MULTI,
  type FilaDiario,
  type MesSerie,
} from "@/lib/ventas/referencia";

// La lista REAL que pegó Daniel (12-ago-2026), tal cual: 48 tokens, duplicados
// y guiones finales incluidos. Es EL caso del bug — el modo pedido contestaba
// "No encontré los códigos… ni en ventas ni en compras" para TODOS.
const LISTA_REAL_DANIEL =
  "4D5029G 4D5029G 4D5077G 4D5077G 4D5077G- 4D5173G 4D5173G 4D5175G 4D5175G 4D5175G 4D5179G 4D5179G 4D5179G " +
  "4D5213G 4D5213G 4D5214G 4D5214G 4D5221G 4D5221G 4D5222G 4D5223G 4D5223G 4D5228G 4D5228G 4D5231G 4D5231G " +
  "4D5231G 4D5233G 4D5234G 4D5235G 4G5004G 4G5004G 4G5004G 4G5020G 4G5032G 4G5032G 4G5032G 4G5032G 4G5002G- " +
  "4G5002G- 4D4036G 4D1060G- 4D1138G- 4D1062G 4D1063G- 4D1454G 4D1455G 4D1440G";

// ─────────────────────────────────────────────────────────────────────────────
// Candados de las piezas COMPARTIDAS del tab "Referencia" de /ventas: el signo
// de los comprobantes, la aritmética de meses, modelo/color y la búsqueda.
//
// 🩸 Lo que este archivo YA NO prueba, porque ya no existe: "tandas" adivinadas
// desde las ventas, "se agotó" / "descontinuado", `sugerencia6m` ("compra ~138
// unidades") y las ventanas de 3/6/12 meses que metían el MES EN CURSO adentro
// del promedio. La medición de una COMPRA —cuánto llegó, en cuánto tiempo se
// vendió, qué queda— vive ahora en `compras.ts`, contra los ingresos de
// mercancía REALES, y su candado es `ventas-compras.test.ts`.
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

describe("aritmética de meses", () => {
  it("cruces de año", () => {
    expect(restarMeses("2026-02", 3)).toBe("2025-11");
    expect(restarMeses("2026-01", 12)).toBe("2025-01");
    expect(diffMeses("2026-08", "2025-07")).toBe(13);
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

  it("🔴 el GUIÓN FINAL se quita — medido: no existe NI UN código terminado en guión en las 3 fuentes", () => {
    // `scripts/_diag-referencia-guiones.ts` (12-ago-2026): LIKE '%-' da 0 en
    // switch_articulo_info, switch_articulo_diario y switch_ingresos_mercancia.
    // Es un artefacto del Excel del que Daniel copia.
    expect(parsearListaCodigos("4D5077G-").codigos).toEqual(["4D5077G"]);
    // Y `4D5077G` + `4D5077G-` son EL MISMO pedido: se deduplican en silencio.
    expect(parsearListaCodigos("4D5077G 4D5077G-").codigos).toEqual(["4D5077G"]);
    // Los guiones INTERIORES no se tocan (SKU reales los llevan).
    expect(parsearListaCodigos("KACKS26-0046").codigos).toEqual(["KACKS26-0046"]);
    expect(parsearListaCodigos("T1A8-32600-").codigos).toEqual(["T1A8-32600"]);
  });

  it("🔴 la lista REAL de Daniel: 48 tokens → 27 códigos únicos, orden = primera aparición, sin descartes", () => {
    const { codigos, descartados } = parsearListaCodigos(LISTA_REAL_DANIEL);
    expect(codigos).toHaveLength(27);
    expect(descartados).toBe(0);
    // Los del guión final quedan normalizados…
    for (const c of ["4D5077G", "4G5002G", "4D1060G", "4D1138G", "4D1063G"]) {
      expect(codigos).toContain(c);
    }
    // …y ninguno queda con el guión puesto.
    expect(codigos.every((c) => !c.endsWith("-"))).toBe(true);
    // El orden es el de la primera aparición: así se lee la tabla con su Excel.
    expect(codigos.slice(0, 4)).toEqual(["4D5029G", "4D5077G", "4D5173G", "4D5175G"]);
    expect(codigos[codigos.length - 1]).toBe("4D1440G");
  });
});

describe("pareo por PREFIJO — la MISMA semántica para 1 código que para 50", () => {
  it("posicionEnPegado: el modelo pegado es dueño de sus colores; gana la primera aparición", () => {
    expect(posicionEnPegado("4D5029G002", ["4D5029G", "4D5077G"])).toBe(0);
    expect(posicionEnPegado("4D5077G110", ["4D5029G", "4D5077G"])).toBe(1);
    // Un código con color pegado tal cual también matchea (prefijo de sí mismo).
    expect(posicionEnPegado("4D5029G002", ["4D5029G002"])).toBe(0);
    expect(posicionEnPegado("OTRACOSA", ["4D5029G"])).toBe(-1);
  });

  it("pedidosNoEncontrados: SOLO los que no trajeron ni un color — los genuinamente inexistentes", () => {
    const hallados = ["4D5029G002", "4D5077G001", "4D5077G110"];
    expect(pedidosNoEncontrados(["4D5029G", "4D5077G", "4D5173G"], hallados)).toEqual(["4D5173G"]);
    // La mutación del bug original: con match EXACTO, los 3 saldrían como no
    // encontrados aunque sus colores existan.
    expect(pedidosNoEncontrados(["4D5029G", "4D5077G", "4D5173G"], hallados)).not.toContain("4D5029G");
  });

  it("🔴 ordenarComoPegado parea por prefijo: los colores ordenan en el lugar de SU modelo", () => {
    const arts = [
      { codigo: "4D5029G002", empresa: "vistana" },
      { codigo: "4G5004G030", empresa: "vistana" },
      { codigo: "4G5004G001", empresa: "vistana" },
      { codigo: "4D5077G110", empresa: "vistana" },
      { codigo: "4D5077G001", empresa: "vistana" },
    ];
    // Pegado en un orden que NO es el alfabético.
    const orden = ordenarComoPegado(arts, ["4G5004G", "4D5077G", "4D5029G"]).map((a) => a.codigo);
    expect(orden).toEqual(["4G5004G001", "4G5004G030", "4D5077G001", "4D5077G110", "4D5029G002"]);
  });

  it("ordenarComoPegado: un artículo que no matchea ningún pegado va al final, nunca se pierde", () => {
    const arts = [
      { codigo: "XXX", empresa: "vistana" },
      { codigo: "4D5029G002", empresa: "vistana" },
    ];
    expect(ordenarComoPegado(arts, ["4D5029G"]).map((a) => a.codigo)).toEqual(["4D5029G002", "XXX"]);
  });
});

describe("sumar series (colores de un modelo)", () => {
  it("suma mes a mes y ordena", () => {
    const total: MesSerie[] = sumarSeries([
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
