/**
 * 🔴 CANDADO — EL DÍA QUE SE TOCA Y LO DE AYER NACEN APAGADOS (4-oct-2026).
 *
 * Propuesta para Multifashion en el celular: tocar una barra dice el día
 * («Sáb 3 oct · $7,104 · 100 tickets») y la línea gris pasa a «hoy · ayer ·
 * Actualizado 4:00 pm ↻». Detrás de `MF_DIA_2026_10`; se prende con el «sí»
 * de Daniel. Ver `lib/multifashion/celular.ts`.
 */
import { describe, it, expect } from "vitest";
import { MF_DIA_2026_10, lineaDelDia, subtituloDelMes, subtituloHoyAyer } from "@/lib/multifashion/celular";

describe("MF_DIA_2026_10", () => {
  it("prendido el 4-oct-2026 con el «sí» de Daniel", () => {
    expect(MF_DIA_2026_10).toBe(true);
  });
});

describe("lineaDelDia", () => {
  it("día de la semana con mayúscula, monto corto y tickets", () => {
    expect(lineaDelDia({ anio: 2026, mes: 10, dia: 3, ventas: 7104.2, tickets: 100 })).toBe("Sáb 3 oct · $7,104 · 100 tickets");
    expect(lineaDelDia({ anio: 2026, mes: 10, dia: 2, ventas: 50, tickets: 1 })).toBe("Vie 2 oct · $50 · 1 ticket");
  });
});

describe("subtituloHoyAyer", () => {
  it("en el mes de hoy dice hoy y ayer, sin los días", () => {
    expect(subtituloHoyAyer({ dias: 4, hoy: { hayVentas: true, ventas: 1979, ayer: 7104 } })).toBe("hoy $1,979 · ayer $7,104");
    expect(subtituloHoyAyer({ dias: 4, hoy: { hayVentas: false, ventas: 0, ayer: 7104 } })).toBe("hoy sin ventas todavía · ayer $7,104");
  });

  it("en otro mes, o sin el dato todavía, dice lo mismo que hoy", () => {
    expect(subtituloHoyAyer({ dias: 30, hoy: null })).toBe(subtituloDelMes({ dias: 30, hoy: null }));
    expect(subtituloHoyAyer({ dias: 4 })).toBe(subtituloDelMes({ dias: 4 }));
  });
});
