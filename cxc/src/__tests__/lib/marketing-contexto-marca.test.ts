// ============================================================================
// CANDADO — la línea de contexto de marca del overlay del proyecto.
//
// Daniel, textual: *"si me gustaria entrar a un projecto y ver ambas marcas"*.
// Al abrir un proyecto desde el período de UNA marca, la línea explica el
// salto entre la tarjeta tocada (esa marca/período) y el total del overlay
// (todas las marcas). Lo que defiende:
//   1. El texto aprobado, con el caso REAL de Nova Lux (12-ago-2026):
//      CK $2.600 en el período · TH $2.470 en el proyecto.
//   2. Los montos de las otras marcas salen de lo YA cargado: entregas
//      (total_por_marca, plata literal) + facturas (porcentaje NORMALIZADO,
//      la MISMA fórmula de resumen-inicio — pct/sumPct, nunca /100).
//   3. Sin otras marcas NO hay línea (no habría salto que explicar).
//   4. Facturas anuladas y claves en $0 no cuentan.
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  lineaContextoMarca,
  totalesPorMarcaDeProyecto,
} from "@/lib/marketing/contexto-marca";

const CK = "m-ck";
const TH = "m-th";
const J = "m-j";

const NOMBRES = new Map([
  [CK, "Calvin Klein"],
  [TH, "Tommy Hilfiger"],
  [J, "Joybees"],
]);

describe("totalesPorMarcaDeProyecto", () => {
  it("las entregas aportan su total_por_marca tal cual (plata literal)", () => {
    const t = totalesPorMarcaDeProyecto(
      [],
      [
        { total_por_marca: { [CK]: 2600 } },
        { total_por_marca: { [TH]: 2470 } },
      ],
    );
    expect(t.get(CK)).toBe(2600);
    expect(t.get(TH)).toBe(2470);
  });

  it("una clave en $0 en total_por_marca NO crea la marca", () => {
    const t = totalesPorMarcaDeProyecto(
      [],
      [{ total_por_marca: { [CK]: 1040, [TH]: 0 } }],
    );
    expect(t.has(TH)).toBe(false);
  });

  it("las facturas reparten por porcentaje NORMALIZADO (pct/sumPct, no /100)", () => {
    // 50/50 → mitades exactas.
    const mitades = totalesPorMarcaDeProyecto(
      [
        {
          total: 1000,
          anulado_en: null,
          marcas: [
            { marca: { id: CK }, porcentaje: 50 },
            { marca: { id: TH }, porcentaje: 50 },
          ],
        },
      ],
      [],
    );
    expect(mitades.get(CK)).toBe(500);
    expect(mitades.get(TH)).toBe(500);

    // UNA marca al 50%: normalizado, se lleva el 100% de la factura — la
    // misma semántica de agregarResumenInicio. Dividir /100 daría 500 y
    // haría que la línea contradiga las tarjetas del inicio.
    const sola = totalesPorMarcaDeProyecto(
      [
        {
          total: 1000,
          anulado_en: null,
          marcas: [{ marca: { id: CK }, porcentaje: 50 }],
        },
      ],
      [],
    );
    expect(sola.get(CK)).toBe(1000);
  });

  it("una factura ANULADA no aporta nada", () => {
    const t = totalesPorMarcaDeProyecto(
      [
        {
          total: 1000,
          anulado_en: "2026-08-01T00:00:00Z",
          marcas: [{ marca: { id: CK }, porcentaje: 100 }],
        },
      ],
      [],
    );
    expect(t.size).toBe(0);
  });

  it("facturas + entregas de la misma marca se suman, a 2 decimales", () => {
    const t = totalesPorMarcaDeProyecto(
      [
        {
          total: 100.555,
          anulado_en: null,
          marcas: [{ marca: { id: CK }, porcentaje: 100 }],
        },
      ],
      [{ total_por_marca: { [CK]: 50 } }],
    );
    expect(t.get(CK)).toBe(150.56);
  });
});

describe("lineaContextoMarca", () => {
  it("el caso real de Nova Lux: el texto aprobado, palabra por palabra", () => {
    const linea = lineaContextoMarca({
      marcaId: CK,
      marcaNombre: "Calvin Klein",
      periodoNombre: "Período 2026",
      montoEnPeriodo: 2600,
      totales: new Map([
        [CK, 2600],
        [TH, 2470],
      ]),
      nombres: NOMBRES,
    });
    expect(linea).toBe(
      "En Calvin Klein · Período 2026: $2,600.00 — este proyecto también tiene $2,470.00 de Tommy Hilfiger",
    );
  });

  it("sin OTRAS marcas no hay línea — no hay salto que explicar", () => {
    expect(
      lineaContextoMarca({
        marcaId: CK,
        marcaNombre: "Calvin Klein",
        periodoNombre: "Período 2026",
        montoEnPeriodo: 2600,
        totales: new Map([[CK, 2600]]),
        nombres: NOMBRES,
      }),
    ).toBeNull();
  });

  it("una 'otra marca' en $0 tampoco cuenta como otra marca", () => {
    expect(
      lineaContextoMarca({
        marcaId: CK,
        marcaNombre: "Calvin Klein",
        montoEnPeriodo: 2600,
        totales: new Map([
          [CK, 2600],
          [TH, 0],
        ]),
        nombres: NOMBRES,
      }),
    ).toBeNull();
  });

  it("varias otras marcas: de mayor a menor, con 'y' antes de la última", () => {
    const linea = lineaContextoMarca({
      marcaId: CK,
      marcaNombre: "Calvin Klein",
      periodoNombre: "Período 2026",
      montoEnPeriodo: 100,
      totales: new Map([
        [CK, 100],
        [J, 1540],
        [TH, 2470],
      ]),
      nombres: NOMBRES,
    });
    expect(linea).toBe(
      "En Calvin Klein · Período 2026: $100.00 — este proyecto también tiene $2,470.00 de Tommy Hilfiger y $1,540.00 de Joybees",
    );
  });

  it("sin monto del período la línea igual dice dónde estás y qué más hay", () => {
    const linea = lineaContextoMarca({
      marcaId: CK,
      marcaNombre: "Calvin Klein",
      periodoNombre: "Período 2026",
      montoEnPeriodo: null,
      totales: new Map([[TH, 2470]]),
      nombres: NOMBRES,
    });
    expect(linea).toBe(
      "En Calvin Klein · Período 2026 — este proyecto también tiene $2,470.00 de Tommy Hilfiger",
    );
  });

  it("sin nombre de período: solo la marca", () => {
    const linea = lineaContextoMarca({
      marcaId: CK,
      marcaNombre: "Calvin Klein",
      periodoNombre: null,
      montoEnPeriodo: 2600,
      totales: new Map([[TH, 2470]]),
      nombres: NOMBRES,
    });
    expect(linea).toBe(
      "En Calvin Klein: $2,600.00 — este proyecto también tiene $2,470.00 de Tommy Hilfiger",
    );
  });

  it("una marca sin nombre resoluble se omite (nada legible que decir)", () => {
    expect(
      lineaContextoMarca({
        marcaId: CK,
        marcaNombre: "Calvin Klein",
        montoEnPeriodo: 2600,
        totales: new Map([["m-fantasma", 999]]),
        nombres: NOMBRES,
      }),
    ).toBeNull();
  });
});
