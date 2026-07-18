import { describe, it, expect } from "vitest";
import {
  prorratearGrupo,
  estadoSemaforo,
  puntoEquilibrio,
} from "@/lib/vista-general-calc";

const round2 = (n: number) => Math.round(n * 100) / 100;

describe("prorratearGrupo", () => {
  it("splits 100.00 across 3 equal empresas cent-exact (33.33 + 33.33 + 33.34)", () => {
    const res = prorratearGrupo(100, [
      { key: "a", ventas: 1 },
      { key: "b", ventas: 1 },
      { key: "c", ventas: 1 },
    ]);
    const suma = round2([...res.values()].reduce((s, v) => s + v, 0));
    expect(suma).toBe(100);
    // Cada parte redondeada a centavos; el residuo (0.01) va a la "mayor"
    // (con ventas iguales queda en la primera).
    expect(res.get("a")).toBe(33.34);
    expect(res.get("b")).toBe(33.33);
    expect(res.get("c")).toBe(33.33);
  });

  it("assigns the rounding remainder to the empresa with most ventas", () => {
    const res = prorratearGrupo(100, [
      { key: "chica", ventas: 1 },
      { key: "grande", ventas: 2 },
    ]);
    // 100 * 1/3 = 33.333... → 33.33; 100 * 2/3 = 66.666... → 66.67 → suma 100 exacta.
    expect(res.get("chica")).toBe(33.33);
    expect(res.get("grande")).toBe(66.67);
    expect(round2([...res.values()].reduce((s, v) => s + v, 0))).toBe(100);
  });

  it("is cent-exact with messy proportions", () => {
    const res = prorratearGrupo(1234.56, [
      { key: "a", ventas: 10000.33 },
      { key: "b", ventas: 20000.77 },
      { key: "c", ventas: 555.55 },
      { key: "d", ventas: 999.99 },
    ]);
    const suma = round2([...res.values()].reduce((s, v) => s + v, 0));
    expect(suma).toBe(1234.56);
    // Todas las partes en centavos exactos.
    for (const v of res.values()) expect(round2(v)).toBe(v);
  });

  it("proportional shares reflect each empresa's weight", () => {
    const res = prorratearGrupo(1000, [
      { key: "a", ventas: 75 },
      { key: "b", ventas: 25 },
    ]);
    expect(res.get("a")).toBe(750);
    expect(res.get("b")).toBe(250);
  });

  it("empresas with ventas <= 0 get 0 and don't dilute the split", () => {
    const res = prorratearGrupo(100, [
      { key: "a", ventas: 50 },
      { key: "b", ventas: 0 },
      { key: "c", ventas: -10 },
      { key: "d", ventas: 50 },
    ]);
    expect(res.get("a")).toBe(50);
    expect(res.get("b")).toBe(0);
    expect(res.get("c")).toBe(0);
    expect(res.get("d")).toBe(50);
    expect(round2([...res.values()].reduce((s, v) => s + v, 0))).toBe(100);
  });

  it("returns all zeros when total ventas <= 0", () => {
    const res = prorratearGrupo(100, [
      { key: "a", ventas: 0 },
      { key: "b", ventas: -5 },
    ]);
    expect(res.get("a")).toBe(0);
    expect(res.get("b")).toBe(0);
  });

  it("returns all zeros for empty empresa list", () => {
    const res = prorratearGrupo(100, []);
    expect(res.size).toBe(0);
  });

  it("returns all zeros when grupoTotal is 0", () => {
    const res = prorratearGrupo(0, [
      { key: "a", ventas: 10 },
      { key: "b", ventas: 20 },
    ]);
    expect(res.get("a")).toBe(0);
    expect(res.get("b")).toBe(0);
  });
});

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

describe("puntoEquilibrio", () => {
  it("null margen → null", () => {
    expect(puntoEquilibrio(1000, null)).toBeNull();
  });

  it("margen <= 0 → null", () => {
    expect(puntoEquilibrio(1000, 0)).toBeNull();
    expect(puntoEquilibrio(1000, -0.2)).toBeNull();
  });

  it("gastosFijos <= 0 → null", () => {
    expect(puntoEquilibrio(0, 0.25)).toBeNull();
    expect(puntoEquilibrio(-100, 0.25)).toBeNull();
  });

  it("computes gastosFijos / margenPct", () => {
    expect(puntoEquilibrio(1000, 0.25)).toBe(4000);
    expect(puntoEquilibrio(500, 0.5)).toBe(1000);
  });
});
