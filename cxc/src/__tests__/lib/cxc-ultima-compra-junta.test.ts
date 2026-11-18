import { describe, it, expect } from "vitest";
import {
  ULTIMA_COMPRA_JUNTA_2026_11,
  DIAS_DE_LA_COMPRA,
  montoDeLaCompra,
  ordenarDocumentos,
  rangoDeDias,
  inicioDeVentana,
  rangoDeLaCompra,
  ultimaCompraPositiva,
  juntarDelDiaMasReciente,
} from "@/lib/cxc/ultima-compra-junta";

const doc = (fecha: string, tipo: string, secuencial: string, total: number) =>
  ({ empresa_key: "vistana", cliente_switch_id: 12, fecha, tipo, secuencial, total });

describe("«Últ. compra» = los 7 días corridos que terminan en la última factura (Daniel, 17-nov-2026)", () => {
  it("prendido, con 7 días", () => {
    expect(ULTIMA_COMPRA_JUNTA_2026_11).toBe(true);
    expect(DIAS_DE_LA_COMPRA).toBe(7);
    expect(inicioDeVentana("2026-11-17")).toBe("2026-11-11");
  });

  // City Mall Paso Canoa, Vistana: 6 facturas el 12-nov y 1 el 17-nov → una compra.
  const cmpc = [
    doc("2026-11-12T15:00:00Z", "Factura", "11-3185", 82340.78),
    doc("2026-11-17T21:29:33Z", "Factura", "11-3215", 4333.5),
  ];

  it("junta el 12 y el 17 (dentro de 7 días)", () => {
    const c = ultimaCompraPositiva(cmpc)!;
    expect(c.dia).toBe("2026-11-17");
    expect(c.desde).toBe("2026-11-11");
    expect(c.monto).toBe(86674.28);
    expect(rangoDeLaCompra(c.documentos)).toBe("12–17 nov");
  });

  it("lo del día 10 (8 días antes) NO entra, y la ventana NO se encadena", () => {
    const c = ultimaCompraPositiva([doc("2026-11-10T15:00:00Z", "Factura", "11-1", 999), ...cmpc])!;
    expect(c.monto).toBe(86674.28);
    expect(c.documentos).toHaveLength(2);
  });

  it("la factura de las 8:25 p. m. del 11 es del 11 de Panamá (entra)", () => {
    const c = ultimaCompraPositiva([doc("2026-11-12T01:25:00Z", "Factura", "11-1", 1), ...cmpc])!;
    expect(c.monto).toBe(86675.28);
  });

  it("las notas de crédito de la ventana RESTAN", () => {
    const c = ultimaCompraPositiva([...cmpc, doc("2026-11-13T15:00:00Z", "Nota de Crédito", "13-1", 340.78)])!;
    expect(c.monto).toBe(86333.5);
  });

  it("si la ventana da cero o negativo, va la ventana anterior positiva (anclada en la factura de antes)", () => {
    const c = ultimaCompraPositiva([
      doc("2026-10-20T15:00:00Z", "Factura", "11-1", 500),
      doc("2026-10-25T15:00:00Z", "Factura", "11-2", 300),
      doc("2026-11-12T15:00:00Z", "Factura", "11-3", 100),
      doc("2026-11-12T16:00:00Z", "Nota de Crédito", "13-1", 100),
    ])!;
    expect(c.dia).toBe("2026-10-25");
    expect(c.monto).toBe(800);
  });

  it("solo notas de crédito o nada positivo → null", () => {
    expect(ultimaCompraPositiva([doc("2026-11-12T16:00:00Z", "Nota de Crédito", "13-1", 5)])).toBeNull();
    expect(ultimaCompraPositiva([doc("2026-11-12T15:00:00Z", "Factura", "1", 5), doc("2026-11-12T16:00:00Z", "Nota de Crédito", "2", 5)])).toBeNull();
  });

  it("monto en centavos enteros y orden por día, facturas antes que NC", () => {
    const docs = [
      { secuencial: "13-851", tipo: "Nota de Crédito", total: 7087.68, dia: "2026-10-23" },
      { secuencial: "11-3152", tipo: "Factura", total: 7087.68, dia: "2026-10-23" },
      { secuencial: "11-3100", tipo: "Factura", total: 19.26, dia: "2026-10-20" },
    ];
    expect(montoDeLaCompra(docs)).toBe(19.26);
    expect(ordenarDocumentos(docs).map((d) => d.secuencial)).toEqual(["11-3100", "11-3152", "13-851"]);
  });

  it("rangos en corto y UTC−5 fijo", () => {
    expect(rangoDeLaCompra([{ secuencial: "a", tipo: "Factura", total: 1, dia: "2026-11-12" }])).toBe("12 nov");
    expect(rangoDeLaCompra([
      { secuencial: "a", tipo: "Factura", total: 1, dia: "2026-10-28" },
      { secuencial: "b", tipo: "Factura", total: 1, dia: "2026-11-03" },
    ])).toBe("28 oct – 3 nov");
    expect(rangoDeDias("2026-11-11", "2026-11-17")).toEqual(["2026-11-11T05:00:00.000Z", "2026-11-18T05:00:00.000Z"]);
  });
});

describe("ficha del cliente: la última compra del grupo", () => {
  it("la ventana más reciente; si varias empresas terminan ese día, se suman", () => {
    const c = juntarDelDiaMasReciente([
      { desde: "2026-11-04", dia: "2026-11-10", monto: 999, documentos: [] },
      { desde: "2026-11-06", dia: "2026-11-12", monto: 100.1, documentos: [{ secuencial: "a", tipo: "Factura", total: 100.1, dia: "2026-11-12" }] },
      { desde: "2026-11-08", dia: "2026-11-12", monto: 0.2, documentos: [{ secuencial: "b", tipo: "Factura", total: 0.2, dia: "2026-11-09" }] },
    ])!;
    expect(c.dia).toBe("2026-11-12");
    expect(c.desde).toBe("2026-11-06");
    expect(c.monto).toBe(100.3);
    expect(c.documentos.map((d) => d.secuencial)).toEqual(["b", "a"]);
  });

  it("sin compras, null", () => {
    expect(juntarDelDiaMasReciente([])).toBeNull();
  });
});
