// La tarjeta «mes a mes» de Ventas (27-nov-2026, `GESTOS_IPHONE_2026_11`).
import { describe, expect, it } from "vitest";
import { cambioDelMes, delClienteEnLaFila, marcaDelMesEnCurso, mesesDeSeries } from "@/lib/ventas/mes-a-mes";
import { delPeriodo } from "@/lib/ventas/resumen-mes";
import { porcentajeDeLaTabla } from "@/lib/ventas/celular";
import { variacionPct } from "@/lib/variacion";

describe("cambioDelMes", () => {
  it("▲ verde, ▼ rojo y gris sin flecha dentro de ±5 %: EXACTO como la tabla (`porcentajeDeLaTabla`)", () => {
    expect(cambioDelMes(112, 100)).toEqual({ texto: "▲ +12%", tono: "up" });
    expect(cambioDelMes(92, 100)).toEqual({ texto: "▼ −8%", tono: "dn" });
    expect(cambioDelMes(103.4, 100)).toEqual({ texto: "+3%", tono: "fl" });
    expect(cambioDelMes(96, 100)).toEqual({ texto: "−4%", tono: "fl" });
    for (const [a, p] of [[112, 100], [92, 100], [103.4, 100], [96, 100], [105.2, 100]] as const) {
      expect(cambioDelMes(a, p)).toEqual(porcentajeDeLaTabla(variacionPct(a, p)));
    }
  });
  it("Fashion Wear nov-2026 (medido 27-nov): 1–26 nov contra 1–26 nov 2025 en DÍA DE PANAMÁ es +0,49 % → «+0.5%» (un decimal bajo 1 %, igual en la tabla); el +3 % sale de cortar en UTC", () => {
    expect(cambioDelMes(704252.0, 700821.19)).toEqual({ texto: "+0.5%", tono: "fl" });
    expect(porcentajeDeLaTabla(variacionPct(704252.0, 700821.19)).texto).toBe("+0.5%");
    // 682.856,19 = mismo rango cortado en UTC: pierde lo facturado el 26-nov-2025 después de las 7 p. m.
    expect(cambioDelMes(704252.0, 682856.19).texto).toBe("+3%");
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
