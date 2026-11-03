// 🔴 CANDADO — en PANTALLA el no pagable (Oficina, Daniel Levy) se ve completo;
// solo la tasa 0 % esconde una sección. El PAPEL no cambia (3-nov-2026).
import { describe, it, expect } from "vitest";
import { seccionesDePantalla, seccionesDelPapel } from "@/lib/comisiones/papel-pagable";

const TASAS = { tasa_venta: 0.005, tasa_cobro: 0.005 };

describe("detalle de comisión en pantalla", () => {
  it("el no pagable con tasas > 0 muestra ventas y cobros", () => {
    expect(seccionesDePantalla(TASAS, "DEFAULT")).toEqual({ ventas: true, cobros: true });
    expect(seccionesDePantalla(TASAS, "DANIEL LEVY ")).toEqual({ ventas: true, cobros: true });
  });
  it("tasa de cobro 0 % sigue escondiendo cobros (Rodrigo)", () => {
    expect(seccionesDePantalla({ tasa_venta: 0.005, tasa_cobro: 0 }, "RODRIGO")).toEqual({ ventas: true, cobros: false });
  });
  it("el papel no cambia: el no pagable no lleva secciones", () => {
    expect(seccionesDelPapel(TASAS, "DEFAULT")).toEqual({ ventas: false, cobros: false });
  });
  it("con el interruptor apagado, la pantalla es la del papel", () => {
    expect(seccionesDePantalla(TASAS, "DEFAULT", false)).toEqual({ ventas: false, cobros: false });
  });
});
