import { describe, it, expect } from "vitest";
import {
  cellValue,
  cellDelta,
  cellPrevValue,
  isNaComparison,
  marginRatio,
  renderCellValue,
  buildSlotsMetrica,
  celdaKey,
  MARGEN_VENTAS_MIN,
  type CeldaBase,
} from "@/lib/ventas/celda";

const celda: CeldaBase = {
  ventas: 120_000,
  ventasPrev: 100_000,
  utilidad: 42_000,
  utilidadPrev: 30_000,
};

describe("matemática de la celda", () => {
  it("margen es null por debajo del piso de ventas", () => {
    expect(marginRatio(MARGEN_VENTAS_MIN - 1, 50)).toBeNull();
    expect(marginRatio(MARGEN_VENTAS_MIN, 50)).toBeCloseTo(0.5, 6);
  });

  it("cellValue devuelve el valor del modo activo", () => {
    expect(cellValue(celda, "ventas")).toBe(120_000);
    expect(cellValue(celda, "utilidad")).toBe(42_000);
    expect(cellValue(celda, "margen")).toBeCloseTo(0.35, 6);
  });

  it("cellPrevValue devuelve el mismo período del año previo", () => {
    expect(cellPrevValue(celda, "ventas")).toBe(100_000);
    expect(cellPrevValue(celda, "margen")).toBeCloseTo(0.3, 6);
  });

  it("delta: ratio en ventas/utilidad, puntos en margen", () => {
    expect(cellDelta(celda, "ventas")).toBeCloseTo(0.2, 6);
    expect(cellDelta(celda, "utilidad")).toBeCloseTo(0.4, 6);
    expect(cellDelta(celda, "margen")).toBeCloseTo(0.05, 6); // 35% − 30% = +5 pts
  });

  it("sin base del año previo no hay comparativo", () => {
    const sinPrev: CeldaBase = { ventas: 500, ventasPrev: 0, utilidad: 100, utilidadPrev: 0 };
    expect(cellDelta(sinPrev, "ventas")).toBeNull();
    expect(isNaComparison(sinPrev, "ventas")).toBe(true);
  });

  it("mes futuro (sin data) no tiene valor", () => {
    const futuro: CeldaBase = { ventas: null, ventasPrev: 9_000, utilidad: null, utilidadPrev: 2_000 };
    expect(cellValue(futuro, "ventas")).toBeNull();
    expect(cellDelta(futuro, "ventas")).toBeNull();
  });

  it("formato del monto: sin centavos, con separador de miles", () => {
    expect(renderCellValue(null, "ventas")).toBe("—");
    expect(renderCellValue(120_000, "ventas")).toBe("$120,000");
    expect(renderCellValue(0.35, "margen")).toBe("35.0%");
  });
});

describe("buildSlotsMetrica — contenido de la fila transformada", () => {
  it("siempre trae las 3 métricas, en orden", () => {
    const slots = buildSlotsMetrica(celda, "ventas");
    expect(slots.map((s) => s.key)).toEqual(["ventas", "utilidad", "margen"]);
    expect(slots.map((s) => s.label)).toEqual(["Ventas", "Utilidad", "Margen"]);
  });

  it("cada dato trae valor del período, del año previo y Δ", () => {
    const [ventas, utilidad, margen] = buildSlotsMetrica(celda, "ventas");

    expect(ventas.valor).toBe("$120,000");
    expect(ventas.prev).toBe("$100,000");
    expect(ventas.delta).toContain("20");
    expect(ventas.tone).toBe("emerald");

    expect(utilidad.valor).toBe("$42,000");
    expect(utilidad.prev).toBe("$30,000");

    expect(margen.valor).toBe("35.0%");
    expect(margen.prev).toBe("30.0%");
  });

  it("en celular (conPrev=false) se cae el monto del año previo, no el Δ", () => {
    const slots = buildSlotsMetrica(celda, "ventas", false);
    expect(slots.every((s) => s.prev === null)).toBe(true);
    expect(slots[0].delta).toContain("20");
    expect(slots.map((s) => s.valor)).toEqual(["$120,000", "$42,000", "35.0%"]);
  });

  it("destaca la métrica del toggle activo de la tabla", () => {
    expect(buildSlotsMetrica(celda, "margen").map((s) => s.destacado)).toEqual([false, false, true]);
    expect(buildSlotsMetrica(celda, "utilidad").map((s) => s.destacado)).toEqual([false, true, false]);
  });

  it("una caída se marca en tono naranja", () => {
    const cayo: CeldaBase = { ventas: 50_000, ventasPrev: 100_000, utilidad: 5_000, utilidadPrev: 30_000 };
    expect(buildSlotsMetrica(cayo, "ventas")[0].tone).toBe("orange");
  });

  it("sin comparativo muestra n/a en vez de un Δ inventado", () => {
    const sinPrev: CeldaBase = { ventas: 500, ventasPrev: 0, utilidad: 100, utilidadPrev: 0 };
    expect(buildSlotsMetrica(sinPrev, "ventas")[0].delta).toBe("n/a");
    expect(buildSlotsMetrica(sinPrev, "ventas")[0].prev).toBeNull();
  });

  it("mes futuro: sin valor actual pero conserva el del año previo", () => {
    const futuro: CeldaBase = { ventas: null, ventasPrev: 9_000, utilidad: null, utilidadPrev: 2_000 };
    const [ventas] = buildSlotsMetrica(futuro, "ventas");
    expect(ventas.valor).toBe("—");
    expect(ventas.prev).toBe("$9,000");
    expect(ventas.delta).toBe("—");
  });
});

describe("celdaKey — a qué celda devolverle el foco al cerrar", () => {
  it("distingue por fila y por columna", () => {
    expect(celdaKey("d", "vistana", "6")).toBe(celdaKey("d", "vistana", "6"));
    expect(celdaKey("d", "vistana", "6")).not.toBe(celdaKey("d", "vistana", "7"));
    expect(celdaKey("d", "vistana", "6")).not.toBe(celdaKey("d", "fwear", "6"));
  });

  it("desktop y celular no colisionan (las dos tablas viven en el mismo árbol)", () => {
    expect(celdaKey("d", "vistana", "6")).not.toBe(celdaKey("m", "vistana", "6"));
  });

  it("la celda Total no colisiona con la de un mes", () => {
    expect(celdaKey("d", "vistana", "total")).not.toBe(celdaKey("d", "vistana", "6"));
  });
});
