import { describe, it, expect } from "vitest";
import { listaSiCambio } from "@/lib/catalogo/reebok-catalogo-2026-11";

// catalogo-mas-02b (15-nov-2026): «Lista $X» tachado solo si el precio se cambió.
describe("el precio cambiado contra el de lista", () => {
  it("igual a la lista → nada tachado", () => {
    expect(listaSiCambio(10, 10)).toBeNull();
    expect(listaSiCambio(10.0000001, 10)).toBeNull();
  });
  it("distinto → devuelve la lista para tacharla", () => {
    expect(listaSiCambio(9, 10)).toBe(10);
    expect(listaSiCambio(10.01, 10)).toBe(10);
  });
  it("sin lista conocida (carrito viejo, nunca cambiado) → no se inventa", () => {
    expect(listaSiCambio(9, undefined)).toBeNull();
    expect(listaSiCambio(9, null)).toBeNull();
    expect(listaSiCambio(9, 0)).toBeNull();
  });
});
