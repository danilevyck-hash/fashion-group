import { describe, it, expect } from "vitest";
import { matchReclamo, matchHint } from "@/app/reclamos/components/search";
import type { Reclamo, RItem } from "@/app/reclamos/components/types";

const item = (over: Partial<RItem>): RItem => ({
  referencia: "",
  descripcion: "",
  talla: "",
  cantidad: 1,
  precio_unitario: 0,
  subtotal: 0,
  motivo: "",
  genero: "",
  nro_factura: "",
  nro_orden_compra: "",
  ...over,
});

const reclamo = (over: Partial<Reclamo>): Reclamo => ({
  id: "1",
  nro_reclamo: "RCL-001",
  empresa: "Reebok",
  proveedor: "Reebok",
  marca: "Reebok",
  nro_factura: "F-4521",
  nro_orden_compra: "",
  fecha_reclamo: "2026-07-01",
  estado: "Creado",
  notas: "",
  created_at: "2026-07-01",
  ...over,
});

describe("matchReclamo", () => {
  it("matchea por N° de reclamo (parcial, sin mayúsculas)", () => {
    expect(matchReclamo(reclamo({}), "rcl-0")).toEqual({ tipo: "reclamo", valor: "RCL-001" });
  });

  it("matchea por factura del header", () => {
    expect(matchReclamo(reclamo({}), "4521")).toEqual({ tipo: "factura", valor: "F-4521" });
  });

  it("matchea por factura de un ítem (reclamo multi-factura)", () => {
    const r = reclamo({ reclamo_items: [item({ nro_factura: "F-9900" })] });
    expect(matchReclamo(r, "9900")).toEqual({ tipo: "factura", valor: "F-9900" });
  });

  it("matchea por código/referencia de ítem", () => {
    const r = reclamo({ reclamo_items: [item({ referencia: "RBK-2034" })] });
    expect(matchReclamo(r, "rbk-20")).toEqual({ tipo: "item", valor: "RBK-2034" });
  });

  it("sin match devuelve null; query vacío devuelve null", () => {
    expect(matchReclamo(reclamo({}), "zzz")).toBeNull();
    expect(matchReclamo(reclamo({}), "  ")).toBeNull();
  });

  it("prioridad: reclamo > factura > ítem", () => {
    const r = reclamo({
      nro_reclamo: "77",
      nro_factura: "77",
      reclamo_items: [item({ referencia: "77" })],
    });
    expect(matchReclamo(r, "77")?.tipo).toBe("reclamo");
  });
});

describe("matchHint", () => {
  it("match por reclamo o factura del header → sin hint (ya es obvio en la fila)", () => {
    const r = reclamo({});
    expect(matchHint(r, matchReclamo(r, "rcl"))).toBeNull();
    expect(matchHint(r, matchReclamo(r, "4521"))).toBeNull();
  });

  it("match por factura de ítem → 'Factura X'", () => {
    const r = reclamo({ reclamo_items: [item({ nro_factura: "F-9900" })] });
    expect(matchHint(r, matchReclamo(r, "9900"))).toBe("Factura F-9900");
  });

  it("match por código de ítem → 'Ítem: X'", () => {
    const r = reclamo({ reclamo_items: [item({ referencia: "RBK-2034" })] });
    expect(matchHint(r, matchReclamo(r, "2034"))).toBe("Ítem: RBK-2034");
  });

  it("sin match → sin hint", () => {
    expect(matchHint(reclamo({}), null)).toBeNull();
  });
});
