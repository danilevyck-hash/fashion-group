// La tarjeta «mes a mes» de Ventas (27-nov-2026, `GESTOS_IPHONE_2026_11`).
import { describe, expect, it } from "vitest";
import { cambioDelMes, delClienteEnLaFila, marcaDelMesEnCurso, mesesDeSeries } from "@/lib/ventas/mes-a-mes";
import { delPeriodo } from "@/lib/ventas/resumen-mes";

describe("cambioDelMes", () => {
  it("▲ verde, ▼ rojo, redondeado como la tabla", () => {
    expect(cambioDelMes(112, 100)).toEqual({ texto: "▲ +12%", tono: "up" });
    expect(cambioDelMes(92, 100)).toEqual({ texto: "▼ −8%", tono: "dn" });
    expect(cambioDelMes(103.4, 100)).toEqual({ texto: "▲ +3%", tono: "up" });
  });
  it("sin base del año pasado dice «Nuevo», nunca «+0 %»", () => {
    expect(cambioDelMes(500, 0).texto).toBe("Nuevo");
    expect(cambioDelMes(500, null).texto).toBe("Nuevo");
    expect(cambioDelMes(0, 0).texto).toBe("—");
  });
});

describe("los meses", () => {
  it("el mes en curso lleva «hasta el D»; uno cerrado, no", () => {
    expect(marcaDelMesEnCurso(11, 2026, "2026-11-27")).toBe("hasta el 27");
    expect(marcaDelMesEnCurso(10, 2026, "2026-11-27")).toBeNull();
    expect(marcaDelMesEnCurso(12, 2025, "2025-12-31")).toBeNull();
  });
  it("Resumen: cada mes es la MISMA cifra de la tabla con ese mes elegido", () => {
    const act = [10.11, 20.22, 30.33, null, null];
    const prev = [9, 0, 31, null, null];
    const meses = mesesDeSeries(act, prev, 3);
    for (const m of meses) {
      expect(m.actual).toBe(delPeriodo(act, m.mes));
      expect(m.previo ?? 0).toBe(delPeriodo(prev, m.mes));
    }
    expect(meses).toHaveLength(3);
  });
  it("Clientes: una empresa la de la fila; con varias, la suma", () => {
    const datos = {
      corte: "2026-02-10",
      empresas: [
        { empresaKey: "vistana", actual: 30, previo: 10, meses: [{ mes: 1, actual: 10, previo: 10 }, { mes: 2, actual: 20, previo: 0 }, { mes: 3, actual: 0, previo: 0 }] },
        { empresaKey: "fashion_wear", actual: 5, previo: 0, meses: [{ mes: 1, actual: 5, previo: 0 }] },
      ],
    };
    const una = delClienteEnLaFila(datos, { empresaKey: "vistana", empresas_count: 1 });
    expect(una.meses).toEqual([{ mes: 1, actual: 10, previo: 10 }, { mes: 2, actual: 20, previo: 0 }]);
    expect([una.actual, una.previo]).toEqual([30, 10]);
    const todas = delClienteEnLaFila(datos, { empresaKey: "vistana", empresas_count: 2 });
    expect(todas.meses[0]).toEqual({ mes: 1, actual: 15, previo: 10 });
    expect(todas.actual).toBe(35);
  });
});
