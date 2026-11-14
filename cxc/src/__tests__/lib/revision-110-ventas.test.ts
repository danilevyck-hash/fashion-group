// Revisión 110 — grupo «ventas»: la lógica chica detrás de las pantallas.
import { describe, expect, it } from "vitest";
import { utilidadPorCodigo } from "@/lib/ventas/utilidad-por-codigo";
import { tieneCodigoDeCliente, ultimaCompraCorta } from "@/lib/ventas/celular";
import type { UtilidadClienteRow } from "@/lib/ventas/utilidad-cliente";

const fila = (p: Partial<UtilidadClienteRow>): UtilidadClienteRow => ({
  clienteSwitchId: 1, cliente: "X", empresaKey: "vistana", empresa: "Vistana", nDocs: 1,
  ventas: 0, costo: 0, utilidad: 0, margen: null, ...p,
});

describe("utilidadPorCodigo — la suma de las filas de la vista Utilidad", () => {
  const filas = [
    fila({ codigo: "D-25", empresaKey: "vistana", ventas: 100, ventasConCosto: 80, utilidad: 20 }),
    fila({ codigo: "D-25", empresaKey: "fashion_wear", ventas: 300, ventasConCosto: 300, utilidad: 90 }),
    fila({ codigo: "D-80", empresaKey: "vistana", ventas: 50, utilidad: -5 }),
    fila({ codigo: null, empresaKey: "vistana", ventas: 999, utilidad: 999 }),
  ];

  it("suma utilidad y saca el margen sobre la venta CON costo", () => {
    const m = utilidadPorCodigo(filas);
    expect(m.get("D-25")?.utilidad).toBe(110);
    expect(m.get("D-25")?.margen).toBeCloseTo(110 / 380);
    expect(m.get("D-25")?.porEmpresa.map((r) => r.empresaKey)).toEqual(["fashion_wear", "vistana"]);
    // sin `ventasConCosto` cae a `ventas`, como el servidor
    expect(m.get("D-80")?.margen).toBeCloseTo(-0.1);
  });

  it("una fila sin código no se le pega a nadie", () => {
    expect([...utilidadPorCodigo(filas).keys()].sort()).toEqual(["D-25", "D-80"]);
  });

  it("con una empresa elegida, solo esa", () => {
    const m = utilidadPorCodigo(filas, "fashion_wear");
    expect(m.get("D-25")?.utilidad).toBe(90);
    expect(m.has("D-80")).toBe(false);
  });

  it("sin filas, vacío", () => {
    expect(utilidadPorCodigo(null).size).toBe(0);
  });
});

describe("la línea gris del cliente", () => {
  it("n.º 4 · sin «Última compra:»", () => {
    expect(ultimaCompraCorta({ texto: "Última compra: hace 2 días", avisa: false })?.texto).toBe("hace 2 días");
    expect(ultimaCompraCorta(null)).toBeNull();
  });
  it("n.º 104 · «—» no es un código", () => {
    expect(tieneCodigoDeCliente("D-25")).toBe(true);
    expect(tieneCodigoDeCliente("—")).toBe(false);
    expect(tieneCodigoDeCliente("")).toBe(false);
    expect(tieneCodigoDeCliente(null)).toBe(false);
  });
});
