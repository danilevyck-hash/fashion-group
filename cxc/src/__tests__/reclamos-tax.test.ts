import { describe, it, expect } from "vitest";
import { reclamoTaxes, esActiveShoes, ocultaPedido, impLabel } from "../lib/reclamos/tax";
import { validateReclamoHeader } from "../lib/reclamos/validate";

describe("Reclamos tax — Active Shoes (importación 15%, sin ITBMS)", () => {
  it("reclamo $100 → importación $15, ITBMS $0, total $115", () => {
    const tx = reclamoTaxes("Active Shoes", 100);
    expect(tx.importacion).toBeCloseTo(15, 5);
    expect(tx.itbms).toBe(0);
    expect(tx.total).toBeCloseTo(115, 5);
    expect(tx.hasItbms).toBe(false);
    expect(tx.impRate).toBe(0.15);
  });
  it("acepta la key 'active_shoes' además de la etiqueta", () => {
    expect(reclamoTaxes("active_shoes", 100).total).toBeCloseTo(115, 5);
    expect(esActiveShoes("active_shoes")).toBe(true);
    expect(esActiveShoes("Active Shoes")).toBe(true);
  });
  it("impLabel 15% y oculta pedido", () => {
    expect(impLabel("Active Shoes")).toBe("15%");
    expect(ocultaPedido("Active Shoes")).toBe(true);
  });
});

describe("Reclamos tax — resto de empresas (idénticas: imp 10% + ITBMS 7.7%)", () => {
  it.each(["Fashion Wear", "Vistana International", "Fashion Shoes", "Active Wear"])(
    "%s: reclamo $100 → imp $10, ITBMS $7.70, total $117.70",
    (empresa) => {
      const tx = reclamoTaxes(empresa, 100);
      expect(tx.importacion).toBeCloseTo(10, 5);
      expect(tx.itbms).toBeCloseTo(7.7, 5);
      expect(tx.total).toBeCloseTo(117.7, 5);
      expect(tx.hasItbms).toBe(true);
    },
  );
  it("no son Active Shoes, no ocultan pedido, label 10%", () => {
    expect(esActiveShoes("Fashion Wear")).toBe(false);
    expect(ocultaPedido("Fashion Wear")).toBe(false);
    expect(impLabel("Fashion Wear")).toBe("10%");
  });
});

describe("Reclamos validación — N° pedido obligatorio salvo Active Shoes", () => {
  const base = { nro_factura: "F1", fecha_reclamo: "2026-07-01" };
  it("otra empresa sin pedido → error", () => {
    expect(validateReclamoHeader({ ...base, empresa: "Fashion Wear", nro_orden_compra: "" }))
      .toBe("Falta el N° de pedido.");
  });
  it("otra empresa con pedido → OK", () => {
    expect(validateReclamoHeader({ ...base, empresa: "Fashion Wear", nro_orden_compra: "PO-1" })).toBeNull();
  });
  it("Active Shoes sin pedido → OK (no es obligatorio)", () => {
    expect(validateReclamoHeader({ ...base, empresa: "Active Shoes", nro_orden_compra: "" })).toBeNull();
  });
});
