import { describe, it, expect } from "vitest";
import {
  ULTIMA_COMPRA_JUNTA_2026_11,
  agruparPorDia,
  llaveDeCompra,
  montoDeLaCompra,
  ordenarDocumentos,
  rangoDelDia,
  ultimaCompraPositiva,
  juntarDelDiaMasReciente,
} from "@/lib/cxc/ultima-compra-junta";

describe("última compra junta (City Mall Paso Canoa, Vistana, 12-nov-2026)", () => {
  const leidos = [
    { empresa_key: "vistana", cliente_switch_id: 25, fecha: "2026-11-13T01:25:00Z", tipo: "Factura", secuencial: "11-000003185", total: 22277.4 },
    { empresa_key: "vistana", cliente_switch_id: 25, fecha: "2026-11-13T01:33:00Z", tipo: "Factura", secuencial: "11-000003186", total: 21230.94 },
    { empresa_key: "vistana", cliente_switch_id: 25, fecha: "2026-11-12T15:00:00Z", tipo: "Factura", secuencial: "11-000003187", total: 11131.21 },
    { empresa_key: "vistana", cliente_switch_id: 25, fecha: "2026-11-12T16:00:00Z", tipo: "Factura", secuencial: "11-000003188", total: 6154.64 },
    // otro día y otro cliente: no entran
    { empresa_key: "vistana", cliente_switch_id: 25, fecha: "2026-11-13T06:00:00Z", tipo: "Factura", secuencial: "11-000003190", total: 10 },
    { empresa_key: "vistana", cliente_switch_id: 80, fecha: "2026-11-12T16:00:00Z", tipo: "Factura", secuencial: "11-000003189", total: 10 },
  ];

  it("está PRENDIDO (Daniel aprobó el mismo día, 17-nov-2026)", () => {
    expect(ULTIMA_COMPRA_JUNTA_2026_11).toBe(true);
  });

  it("junta por empresa · cliente · día de PANAMÁ (las 8:25 p. m. del 12 son del 12)", () => {
    const docs = agruparPorDia(leidos).get(llaveDeCompra("vistana", 25, "2026-11-12"))!;
    expect(docs).toHaveLength(4);
    expect(montoDeLaCompra(docs)).toBe(60794.19);
  });

  it("la nota de crédito del mismo día RESTA (anulación de D-25, 23-oct-2026)", () => {
    const docs = [
      { secuencial: "13-000000851", tipo: "Nota de Crédito", total: 7087.68 },
      { secuencial: "11-000003152", tipo: "Factura", total: 7087.68 },
      { secuencial: "11-000003151", tipo: "Factura", total: 19.26 },
    ];
    expect(montoDeLaCompra(docs)).toBe(19.26);
    expect(ordenarDocumentos(docs).map((d) => d.secuencial)).toEqual(["11-000003151", "11-000003152", "13-000000851"]);
  });

  it("el rango del día es UTC−5 fijo", () => {
    expect(rangoDelDia("2026-11-12")).toEqual(["2026-11-12T05:00:00.000Z", "2026-11-13T05:00:00.000Z"]);
  });
});

describe("si el día da cero o negativo, va el último día con compra positiva", () => {
  // Multi Fashion Holding, Vistana: el 12-nov-2026 dio −$4,402.20 (NC más grandes que las facturas).
  const doc = (fecha: string, tipo: string, secuencial: string, total: number) =>
    ({ empresa_key: "vistana", cliente_switch_id: 7, fecha, tipo, secuencial, total });
  const docs = [
    doc("2026-11-11T15:00:00Z", "Factura", "11-1", 10000),
    doc("2026-11-11T16:00:00Z", "Factura", "11-2", 6846.15),
    doc("2026-11-12T15:00:00Z", "Factura", "11-3", 12990.8),
    doc("2026-11-12T16:00:00Z", "Nota de Crédito", "13-1", 17393),
  ];

  it("salta el 12 (negativo) y toma el 11", () => {
    const c = ultimaCompraPositiva(docs)!;
    expect(c.dia).toBe("2026-11-11");
    expect(c.monto).toBe(16846.15);
    expect(c.documentos).toHaveLength(2);
  });

  it("un día que da cero exacto también se salta", () => {
    const c = ultimaCompraPositiva([...docs.slice(0, 2), doc("2026-11-13T15:00:00Z", "Factura", "11-4", 50), doc("2026-11-13T16:00:00Z", "Nota de Crédito", "13-2", 50)])!;
    expect(c.dia).toBe("2026-11-11");
  });

  it("un día con solo notas de crédito no es una compra", () => {
    expect(ultimaCompraPositiva([doc("2026-11-12T16:00:00Z", "Nota de Crédito", "13-1", 5)])).toBeNull();
  });

  it("si el día positivo es el último, va ese", () => {
    expect(ultimaCompraPositiva(docs.slice(0, 3))!.dia).toBe("2026-11-12");
  });
});

describe("ficha del cliente: la última compra del grupo", () => {
  it("toma el día más reciente y suma las empresas que compraron ese día", () => {
    const c = juntarDelDiaMasReciente([
      { dia: "2026-11-10", monto: 999, documentos: [] },
      { dia: "2026-11-12", monto: 100.1, documentos: [{ secuencial: "a", tipo: "Factura", total: 100.1 }] },
      { dia: "2026-11-12", monto: 0.2, documentos: [{ secuencial: "b", tipo: "Factura", total: 0.2 }] },
    ])!;
    expect(c.dia).toBe("2026-11-12");
    expect(c.monto).toBe(100.3);
    expect(c.documentos).toHaveLength(2);
  });

  it("sin compras, null", () => {
    expect(juntarDelDiaMasReciente([])).toBeNull();
  });
});
