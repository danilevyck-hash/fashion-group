import { describe, expect, it } from "vitest";
import { empresaReclamoDesdeTexto, EMPRESAS_MAP } from "@/lib/reclamos/empresas";

describe("empresaReclamoDesdeTexto — «reclamos de vistana» abre Vistana", () => {
  it.each([
    ["vistana", "Vistana International"],
    ["Vistana", "Vistana International"],
    ["VISTANA INTERNATIONAL", "Vistana International"],
    ["fashion_wear", "Fashion Wear"],
    ["fashion wear", "Fashion Wear"],
    ["active_shoes", "Active Shoes"],
    ["joystep", "Joystep"],
  ])("%s → %s", (texto, nombre) => {
    expect(empresaReclamoDesdeTexto(texto)).toBe(nombre);
  });

  it("toda clave y todo nombre del mapa resuelven", () => {
    for (const [nombre, info] of Object.entries(EMPRESAS_MAP)) {
      expect(empresaReclamoDesdeTexto(nombre)).toBe(nombre);
      expect(empresaReclamoDesdeTexto(info.empresa_key)).toBe(nombre);
    }
  });

  it("lo que no reconoce vuelve igual", () => {
    expect(empresaReclamoDesdeTexto("Boston")).toBe("Boston");
  });
});
