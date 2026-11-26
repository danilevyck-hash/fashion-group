import { describe, expect, it } from "vitest";
import { empresasDelRenglon, entraEnFacturados, estaEnGuia, indiceEnGuia } from "@/lib/guias/facturados-sin-guia";

describe("Facturados sin guía", () => {
  it("normaliza el texto sucio de la empresa", () => {
    expect(empresasDelRenglon("Fashion Shoes ")).toEqual(["fashion_shoes"]);
    expect(empresasDelRenglon("Fahion Wear")).toEqual(["fashion_wear"]);
    expect(empresasDelRenglon("VISTANA / FASHION WEAR")).toEqual(["vistana", "fashion_wear"]);
    expect(empresasDelRenglon("D")).toHaveLength(6);
  });

  it("compara por los últimos 4 dígitos dentro de la empresa; lo ambiguo cuenta en todas", () => {
    const idx = indiceEnGuia([
      { empresa: "Vistana", facturas: "3162, 3163" },
      { empresa: "Karl Laguerfeld", facturas: "2609" },
    ]);
    expect(estaEnGuia(idx, "vistana", "11-000003162")).toBe(true);
    expect(estaEnGuia(idx, "fashion_wear", "11-000003162")).toBe(false);
    expect(estaEnGuia(idx, "fashion_shoes", "11-000002609")).toBe(true);
    expect(estaEnGuia(idx, "vistana", "Traslado")).toBe(false);
  });

  it("D-108 y el mostrador quedan fuera, por código", () => {
    expect(entraEnFacturados("D-108")).toBe(false);
    expect(entraEnFacturados("TCKCTA")).toBe(false);
    expect(entraEnFacturados("D-25")).toBe(true);
  });
});
