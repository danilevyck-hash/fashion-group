// Revisión 110 · ajustes: las dos reglas puras de pantalla.
import { describe, it, expect } from "vitest";
import { placeholderQueCabe, PLACEHOLDER_CORTO } from "@/lib/ui/placeholder-que-cabe";
import { pegarPorcentaje, NBSP } from "@/lib/ui/revision-110-ajustes";

const medir = (s: string) => s.length * 7;

describe("placeholderQueCabe", () => {
  it("el texto entero si cabe", () => {
    expect(placeholderQueCabe("Buscar colaborador", 200, medir)).toBe("Buscar colaborador");
  });
  it("«Buscar» si no cabe: nunca cortado a mitad de palabra", () => {
    expect(placeholderQueCabe("Buscar colaborador", 100, medir)).toBe(PLACEHOLDER_CORTO);
  });
  it("sin ancho medido deja el texto como viene", () => {
    expect(placeholderQueCabe("Buscar proveedor", 0, medir)).toBe("Buscar proveedor");
  });
});

describe("pegarPorcentaje", () => {
  it("pega el número a su %", () => {
    expect(pegarPorcentaje("sábado (24 %)")).toBe(`sábado (24${NBSP}%)`);
  });
  it("no toca lo que no es número + %", () => {
    expect(pegarPorcentaje("hoy % ayer")).toBe("hoy % ayer");
  });
});
