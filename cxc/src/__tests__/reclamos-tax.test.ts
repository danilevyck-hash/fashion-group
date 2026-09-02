import { describe, it, expect } from "vitest";
import {
  reclamoTaxes, esActiveShoes, ocultaPedido, impLabel, itbmsLabel,
  TASA_ITBMS, TASA_IMPORTACION, FACTOR_TOTAL,
} from "../lib/reclamos/tax";
import { validateReclamoHeader } from "../lib/reclamos/validate";

// 🩸 CAMBIO DE DIRECCIÓN (1-sep-2026). Este archivo decía «ITBMS 7.7% sobre el
// subtotal» porque así estaba escrita la cuenta. La tasa real de Panamá es 7%,
// y se cobra sobre el subtotal CON la importación adentro: 1,10 × 0,07 = 0,077,
// o sea EXACTAMENTE la misma plata. Se cambió la forma de la cuenta, no el
// monto, para que el rótulo del papel — que se deriva de la tasa — dijera la
// tasa que existe. Los montos de abajo son los mismos de siempre.

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

describe("Reclamos tax — resto de empresas (imp 10% + ITBMS 7% sobre subtotal+importación)", () => {
  it.each(["Fashion Wear", "Vistana International", "Fashion Shoes", "Active Wear"])(
    "%s: reclamo $100 → imp $10, ITBMS $7.70, total $117.70",
    (empresa) => {
      const tx = reclamoTaxes(empresa, 100);
      expect(tx.importacion).toBeCloseTo(10, 5);
      // El monto NO se movió al pasar de «7.7% del subtotal» a «7% de la base».
      expect(tx.itbms).toBeCloseTo(7.7, 5);
      expect(tx.total).toBeCloseTo(117.7, 5);
      expect(tx.hasItbms).toBe(true);
    },
  );

  it("la tasa es 7% y el ITBMS sale de (subtotal + importación), no del subtotal", () => {
    expect(TASA_ITBMS).toBe(0.07);
    expect(itbmsLabel("Fashion Wear")).toBe("7%");
    for (const sub of [100, 1000, 250.75, 87.4, 3]) {
      const tx = reclamoTaxes("Fashion Wear", sub);
      const base = sub + sub * TASA_IMPORTACION;
      // 🔴 La cuenta es 7% de la BASE. Si alguien la devuelve a «subtotal ×
      // 0.077» el rótulo vuelve a decir una tasa que no existe en Panamá.
      expect(tx.itbms).toBeCloseTo(base * 0.07, 9);
      expect(tx.itbms).not.toBeCloseTo(sub * 0.07, 6);
    }
  });

  it("FACTOR_TOTAL sigue dando 1.177 (el total no se movió)", () => {
    expect(FACTOR_TOTAL).toBeCloseTo(1.177, 12);
    expect(reclamoTaxes("Fashion Wear", 1000).total).toBeCloseTo(1000 * FACTOR_TOTAL, 9);
  });

  it("no son Active Shoes, no ocultan pedido, label 10%", () => {
    expect(esActiveShoes("Fashion Wear")).toBe(false);
    expect(ocultaPedido("Fashion Wear")).toBe(false);
    expect(impLabel("Fashion Wear")).toBe("10%");
  });
});

// ⚠️ Active Shoes NO SE TOCA. El cambio de forma del ITBMS es de las otras
// empresas; esta no lleva ITBMS y su importación es 15%, no 10%.
describe("Active Shoes queda fuera del cambio de ITBMS", () => {
  it.each([100, 1000, 250.75])("subtotal $%s: sin ITBMS, importación 15%%", (sub) => {
    const tx = reclamoTaxes("Active Shoes", sub);
    expect(tx.itbms).toBe(0);
    expect(tx.itbmsRate).toBe(0);
    expect(tx.hasItbms).toBe(false);
    expect(tx.impRate).toBe(0.15);
    expect(tx.total).toBeCloseTo(sub * 1.15, 9);
    // Ni la tasa general ni la base con importación se le filtran.
    expect(tx.total).not.toBeCloseTo(sub * FACTOR_TOTAL, 6);
  });
  it("su rótulo de ITBMS no dice 7%", () => {
    expect(itbmsLabel("Active Shoes")).toBe("0%");
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
