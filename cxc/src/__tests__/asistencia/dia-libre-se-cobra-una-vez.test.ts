// 30-sep-2026 · La deuda del día libre se cobraba DOS veces: en el rango corto
// que mide los días del corte (11–15 sep) y otra vez en la quincena. Alejandra:
// $25.81 de extras → llegaban $1.65 y le quedaban «debiendo $22.51».
// Contable: «no está sumando las horas extras». Se cobra SOLO en la quincena.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("día libre · se cobra una sola vez", () => {
  const src = readFileSync("src/app/api/asistencia/planilla/route.ts", "utf-8");
  it("aplicarDiaLibreEnLinea solo corre cuando el período es una quincena", () => {
    const i = src.indexOf("aplicarDiaLibreEnLinea(\n");
    expect(i).toBeGreaterThan(0);
    const antes = src.slice(Math.max(0, i - 300), i);
    expect(antes).toMatch(/if \(q\.esQuincena\) \{/);
  });
});
