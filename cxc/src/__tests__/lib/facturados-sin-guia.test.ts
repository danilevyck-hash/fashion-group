import { describe, expect, it } from "vitest";
import { FACTURADOS_CORTE_DIAS_2026_11, FACTURADOS_DIAS_HABILES, ROTULO_VENTANA_FACTURADOS, empresasDelRenglon, entraEnFacturados, primerDiaDeFacturados, esCobroSuelto, estaEnGuia, indiceEnGuia } from "@/lib/guias/facturados-sin-guia";

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

describe("cobros sueltos", () => {
  it("pedido leído y vacío = cobro suelto; sin leer o con pedido = se queda", () => {
    expect(esCobroSuelto({ pedido_referencia: null, pedido_leido_en: "2026-11-26T10:00:00Z" })).toBe(true);
    expect(esCobroSuelto({ pedido_referencia: " ", pedido_leido_en: "2026-11-26T10:00:00Z" })).toBe(true);
    expect(esCobroSuelto({ pedido_referencia: null, pedido_leido_en: null })).toBe(false);
    expect(esCobroSuelto({ pedido_referencia: "16-000002463", pedido_leido_en: "2026-11-26T10:00:00Z" })).toBe(false);
  });
  it("un rango en la guía cubre sus facturas", () => {
    const i = indiceEnGuia([{ empresa: "Vistana", facturas: "3171-3172" }]);
    expect(estaEnGuia(i, "vistana", "11-000003171")).toBe(true);
  });

  it("corte: la factura sale sola pasados 5 días hábiles (lunes a viernes)", () => {
    expect(FACTURADOS_CORTE_DIAS_2026_11).toBe(true);
    expect(FACTURADOS_DIAS_HABILES).toBe(5);
    expect(ROTULO_VENTANA_FACTURADOS).toBe("últimos 5 días hábiles");
    // Jueves 26-nov: se ven las del jueves 19 en adelante (vie, lun, mar, mié, jue = 5 hábiles).
    expect(primerDiaDeFacturados("2026-11-26")).toBe("2026-11-19");
    // Lunes 23-nov: desde el lunes 16 (mar a vie, lun); el fin de semana no cuenta.
    expect(primerDiaDeFacturados("2026-11-23")).toBe("2026-11-16");
    // Sábado 28-nov: desde el viernes 20 (lun a vie).
    expect(primerDiaDeFacturados("2026-11-28")).toBe("2026-11-20");
    // Apagado = los 30 días de antes.
    expect(primerDiaDeFacturados("2026-11-26", false)).toBe("2026-10-27");
  });
});
