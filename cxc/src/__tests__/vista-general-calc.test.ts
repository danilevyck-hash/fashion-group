import { describe, it, expect } from "vitest";
import { estadoSemaforo } from "@/lib/vista-general-calc";

describe("estadoSemaforo", () => {
  it("null rentabilidad → sin_gastos (regardless of ventas)", () => {
    expect(estadoSemaforo(null, 1000)).toBe("sin_gastos");
    expect(estadoSemaforo(null, 0)).toBe("sin_gastos");
  });

  it("negative rentabilidad → rojo", () => {
    expect(estadoSemaforo(-0.01, 1000)).toBe("rojo");
    expect(estadoSemaforo(-500, 0)).toBe("rojo");
  });

  it("pct below 5% → ambar", () => {
    // 4.99 / 100 = 4.99% < 5%
    expect(estadoSemaforo(4.99, 100)).toBe("ambar");
  });

  it("rentabilidad exactly 0 with ventas > 0 → ambar", () => {
    expect(estadoSemaforo(0, 100)).toBe("ambar");
  });

  it("pct exactly 5% → verde (boundary is inclusive for verde)", () => {
    expect(estadoSemaforo(5, 100)).toBe("verde");
  });

  it("pct above 5% → verde", () => {
    expect(estadoSemaforo(10, 100)).toBe("verde");
    expect(estadoSemaforo(5.01, 100)).toBe("verde");
  });

  it("edge: ventas <= 0 with rentabilidad >= 0 → ambar (no base for pct)", () => {
    expect(estadoSemaforo(5, 0)).toBe("ambar");
    expect(estadoSemaforo(0, 0)).toBe("ambar");
    expect(estadoSemaforo(100, -50)).toBe("ambar");
  });
});
