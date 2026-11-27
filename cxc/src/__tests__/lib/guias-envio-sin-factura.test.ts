import { describe, expect, it } from "vitest";
import { esSinFactura, facturasSinFactura, queLlevaDe } from "@/lib/guias/envio-sin-factura";
import { claveDeFactura, facturasParaElPapel } from "@/lib/guias/numero-factura";
import { armarEnvioSinFactura, EMPRESA_NINGUNA } from "@/app/despachos/components/AgregarSinFactura";

describe("Envío sin factura", () => {
  it("se guarda en `facturas` y sale tal cual en el papel", () => {
    const f = facturasSinFactura("  Muebles Tommy, CK ");
    expect(f).toBe("Sin factura · Muebles Tommy / CK");
    expect(esSinFactura(f)).toBe(true);
    expect(queLlevaDe(f)).toBe("Muebles Tommy / CK");
    expect(facturasParaElPapel(f)).toBe(f);
  });
  it("los números de lo que lleva no son una factura", () => {
    expect(claveDeFactura("Sin factura · 12 paraguas")).toBe("");
    expect(esSinFactura("Sin facturas")).toBe(false);
  });
  it("todo es obligatorio; «Ninguna» guarda empresa vacía", () => {
    const vacio = armarEnvioSinFactura({ queLleva: "", empresa: "", cliente: null, bultos: "", destino: "", orden: 1 });
    expect(vacio).toEqual({ ok: false, falta: ["qué lleva", "la empresa", "el cliente", "los bultos", "el destino"] });
    const r = armarEnvioSinFactura({ queLleva: "Documentos", empresa: EMPRESA_NINGUNA, cliente: { nombre: "Multi Fashion", codigo: "D-108" }, bultos: "1", destino: "Albrook", orden: 1 });
    expect(r.ok && r.item.empresa).toBe("");
    expect(r.ok && r.item.facturas).toBe("Sin factura · Documentos");
  });
});
