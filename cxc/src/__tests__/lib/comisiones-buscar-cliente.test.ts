// Comisiones › «Buscar cliente» (3-nov-2026): empresa, motivos, redondeo como la RPC, retenciones juntas.
import { describe, expect, it } from "vitest";
import {
  comisionPagable,
  comisionPorVendedor,
  empresasDeLaBusqueda,
  resultadoFactura,
  resultadoRecibo,
  separarRetenciones,
  type DocFactura,
  type DocRecibo,
  type FilaConBase,
} from "@/lib/comisiones/buscar-cliente";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";

const factura: DocFactura = { tipo: "Factura", cliente: "City Mall David", pctUtilidad: 30, subtotal: 1000, vendedor: "EDWIN", excluido: false, tasa: 0.005 };
const recibo: DocRecibo = { esRetencion: false, clienteCodigo: "D-24", total: 1000, vendedor: "EDWIN", excluido: false, tasa: 0.005 };

describe("la búsqueda respeta la empresa elegida", () => {
  it("«Todas» (sin empresa) busca en las 6 del grupo", () => {
    expect(empresasDeLaBusqueda(null)).toEqual([...EMPRESAS_COMISIONAN]);
    expect(empresasDeLaBusqueda("")).toEqual([...EMPRESAS_COMISIONAN]);
    expect(EMPRESAS_COMISIONAN).toHaveLength(6);
  });
  it("una empresa del grupo busca SOLO en ella", () => {
    expect(empresasDeLaBusqueda("vistana")).toEqual(["vistana"]);
  });
  it("Boston, ACS o cualquier otra no son válidas", () => {
    expect(empresasDeLaBusqueda("confecciones_boston")).toBeNull();
    expect(empresasDeLaBusqueda("american_classic")).toBeNull();
    expect(empresasDeLaBusqueda("cualquiera")).toBeNull();
  });
});

describe("el motivo de cada factura, con las reglas de comision_b2b_detalle", () => {
  it("utilidad > 20 cuenta, con la tasa del vendedor", () => {
    expect(resultadoFactura(factura)).toEqual({ base: 1000, comision: 5, motivo: null });
  });
  it("utilidad de 20 % o menos no cuenta, y 19,94 no se lee «20 %»", () => {
    expect(resultadoFactura({ ...factura, pctUtilidad: 20 })).toMatchObject({ base: 0, comision: null, motivo: "Utilidad 20 %" });
    expect(resultadoFactura({ ...factura, pctUtilidad: 19.94 }).motivo).toBe("Utilidad 19 %");
  });
  it("cliente excluido no cuenta (factura y cobro)", () => {
    expect(resultadoFactura({ ...factura, excluido: true }).motivo).toBe("Cliente excluido");
    expect(resultadoRecibo({ ...recibo, excluido: true }).motivo).toBe("Cliente excluido");
  });
  it("venta al contado: cliente VENTAS/CONTADO y el recibo de TCKCTA", () => {
    expect(resultadoFactura({ ...factura, cliente: " contado " }).motivo).toBe("Venta al contado");
    expect(resultadoFactura({ ...factura, cliente: "VENTAS" }).motivo).toBe("Venta al contado");
    expect(resultadoRecibo({ ...recibo, clienteCodigo: "TCKCTA" }).motivo).toBe("Venta al contado");
  });
  it("vendedor no pagable: se calcula pero se marca", () => {
    expect(resultadoFactura({ ...factura, vendedor: "DEFAULT" })).toMatchObject({ comision: 5, motivo: "Vendedor no pagable" });
    expect(resultadoRecibo({ ...recibo, vendedor: "DANIEL LEVY" })).toMatchObject({ comision: 5, motivo: "Vendedor no pagable" });
  });
  it("la nota de crédito resta aunque su utilidad sea negativa; la de débito no cuenta", () => {
    expect(resultadoFactura({ ...factura, tipo: "Nota de Crédito", subtotal: -440, pctUtilidad: -75 })).toMatchObject({ base: -440, motivo: null });
    expect(resultadoFactura({ ...factura, tipo: "Nota de Débito" })).toMatchObject({ base: 0, motivo: "Nota de Débito" });
  });
  it("retención no comisiona", () => {
    expect(resultadoRecibo({ ...recibo, esRetencion: true })).toMatchObject({ base: 0, comision: null, motivo: "Retención" });
  });
});

describe("el total se redondea como la RPC: la suma, no fila por fila", () => {
  const fila = (base: number, extra: Partial<FilaConBase> = {}): FilaConBase => ({
    empresa: "vistana", vendedor: "EDWIN", base, tasa: 0.005, motivo: null, comision: Math.round(base * 0.005 * 100) / 100, ...extra,
  });
  it("tres ventas de $1 a 0,5 %: la RPC da $0.02 (fila por fila daría $0.03)", () => {
    const [v] = comisionPorVendedor([fila(1), fila(1), fila(1)], []);
    expect(v.comision).toBe(0.02);
  });
  it("ventas y cobros se redondean por separado y se suman", () => {
    const [v] = comisionPorVendedor([fila(1), fila(2)], [fila(1)]);
    expect(v).toMatchObject({ ventas_base: 3, cobros_base: 1, comision: 0.03 });
  });
  it("lo que no cuenta no entra, y lo no pagable no se suma al cliente", () => {
    const filas = [fila(1000), fila(0, { comision: null, motivo: "Utilidad 5 %" }), fila(1000, { vendedor: "DEFAULT", motivo: "Vendedor no pagable" })];
    const porVendedor = comisionPorVendedor(filas, []);
    expect(porVendedor).toHaveLength(2);
    expect(comisionPagable(porVendedor)).toBe(5);
  });
});

describe("las retenciones van juntas en una línea", () => {
  it("se sacan de las filas y se cuentan con su monto", () => {
    const cobros = [
      { motivo: "Retención", monto: 189 },
      { motivo: null, monto: 8898.42 },
      { motivo: "Retención", monto: 50.75 },
    ];
    const { filas, retenciones } = separarRetenciones(cobros);
    expect(filas).toEqual([{ motivo: null, monto: 8898.42 }]);
    expect(retenciones).toEqual({ cantidad: 2, monto: 239.75 });
  });
  it("sin retenciones, la línea no tiene nada que decir", () => {
    expect(separarRetenciones([{ motivo: null, monto: 1 }]).retenciones.cantidad).toBe(0);
  });
});
