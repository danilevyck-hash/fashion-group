import { describe, it, expect } from "vitest";
import {
  buildFilasMetrica,
  cellValue,
  cellDelta,
  cellPrevValue,
  isNaComparison,
  marginRatio,
  renderCellValue,
  renderCellValueFull,
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

  it("formato compacto en la tabla, completo en el panel", () => {
    expect(renderCellValue(null, "ventas")).toBe("—");
    expect(renderCellValueFull(120_000, "ventas")).toBe("$120,000.00");
    expect(renderCellValueFull(0.35, "margen")).toBe("35.0%");
  });
});

describe("buildFilasMetrica — contenido del panel lateral", () => {
  it("siempre trae las 3 métricas, en orden", () => {
    const filas = buildFilasMetrica(celda, "ventas");
    expect(filas.map((f) => f.mode)).toEqual(["ventas", "utilidad", "margen"]);
    expect(filas.map((f) => f.label)).toEqual(["Ventas", "Utilidad", "Margen"]);
  });

  it("cada fila trae año actual, año previo y Δ", () => {
    const [ventas, utilidad, margen] = buildFilasMetrica(celda, "ventas");

    expect(ventas.cur).toBe("$120,000.00");
    expect(ventas.prev).toBe("$100,000.00");
    expect(ventas.delta).toContain("20");
    expect(ventas.tone).toBe("emerald");

    expect(utilidad.cur).toBe("$42,000.00");
    expect(utilidad.prev).toBe("$30,000.00");

    expect(margen.cur).toBe("35.0%");
    expect(margen.prev).toBe("30.0%");
  });

  it("destaca la métrica del toggle activo de la tabla", () => {
    expect(buildFilasMetrica(celda, "margen").map((f) => f.destacado)).toEqual([false, false, true]);
    expect(buildFilasMetrica(celda, "utilidad").map((f) => f.destacado)).toEqual([false, true, false]);
  });

  it("una caída se marca en tono naranja", () => {
    const cayo: CeldaBase = { ventas: 50_000, ventasPrev: 100_000, utilidad: 5_000, utilidadPrev: 30_000 };
    expect(buildFilasMetrica(cayo, "ventas")[0].tone).toBe("orange");
  });

  it("sin comparativo muestra n/a en vez de un Δ inventado", () => {
    const sinPrev: CeldaBase = { ventas: 500, ventasPrev: 0, utilidad: 100, utilidadPrev: 0 };
    expect(buildFilasMetrica(sinPrev, "ventas")[0].delta).toBe("n/a");
    expect(buildFilasMetrica(sinPrev, "ventas")[0].prev).toBe("—");
  });

  it("mes futuro: sin valor actual pero conserva el del año previo", () => {
    const futuro: CeldaBase = { ventas: null, ventasPrev: 9_000, utilidad: null, utilidadPrev: 2_000 };
    const [ventas] = buildFilasMetrica(futuro, "ventas");
    expect(ventas.cur).toBe("—");
    expect(ventas.prev).toBe("$9,000.00");
    expect(ventas.delta).toBe("—");
  });
});
