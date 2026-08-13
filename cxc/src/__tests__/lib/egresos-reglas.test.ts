/**
 * Las reglas de negocio de EGRESOS VARIOS, contra el archivo REAL de Vistana.
 *
 * 🔑 Lo que más protege este archivo: que "SALIÓ PLATA" y "GASTÉ" NO se
 * confundan. De los $243.342,48 que salieron de Vistana en 7 meses, solo
 * $118.753,76 son gasto — el resto son transferencias entre cuentas propias,
 * planilla por pagar y pagos intercompañía. Un módulo que llama "gastos" a los
 * $243.342,48 está contando como gasto un préstamo devuelto.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsearEgresosCsv, type EgresoLinea } from "@/lib/egresos/parser";
import {
  resumirMesEgresos,
  duplicadosExactos,
  claveIdentidad,
  mesTocado,
  cuentaCorta,
  grupoDeCuenta,
  ultimoDiaDelMes,
  ETIQUETA_ESTADO_EGRESOS,
} from "@/lib/egresos/reglas";

const CSV = readFileSync(
  join(process.cwd(), "src/__tests__/fixtures/egresos-vistana-2026.csv"),
  "utf8",
);
const TODAS = parsearEgresosCsv(CSV).lineas;
const usd = (cent: number) => (cent / 100).toFixed(2);
const delMes = (mes: string) => TODAS.filter((l) => l.mes === mes);

/** El rango que se le pide a Switch: el año entero. */
const ANIO = [{ desde: "2026-01-01", hasta: "2026-12-31" }];

describe("enero-2026 de Vistana — el mes que también está en el mayor", () => {
  const r = resumirMesEgresos("2026-01", delMes("2026-01"), ANIO);

  it("salieron $41.419,65 en 46 pagos", () => {
    expect(usd(r.totalSalidaCent)).toBe("41419.65");
    expect(r.renglones).toBe(46);
    expect(r.estado).toBe("con_movimientos");
  });

  it("🔴 de eso, GASTO son $11.862,74 en 24 renglones — NO los $41.419,65", () => {
    expect(usd(r.totalGastoCent)).toBe("11862.74");
    expect(r.cuentasGasto.reduce((a, c) => a + c.renglones, 0)).toBe(24);
  });

  it("lo que no es gasto sale aparte, y las dos partes suman el total", () => {
    expect(usd(r.totalNoGastoCent)).toBe("29556.91");
    expect(r.totalGastoCent + r.totalNoGastoCent).toBe(r.totalSalidaCent);
  });

  it("las cuentas de gasto son todas del grupo 6, y las otras ninguna", () => {
    expect(r.cuentasGasto.every((c) => c.grupo === "6")).toBe(true);
    expect(r.cuentasNoGasto.some((c) => c.grupo === "6")).toBe(false);
  });

  it("van de mayor a menor, para que lo grande se vea primero", () => {
    const montos = r.cuentasGasto.map((c) => c.totalCent);
    expect([...montos].sort((a, b) => b - a)).toEqual(montos);
  });

  it("cada cuenta trae referencias: el CSV no manda el nombre de la cuenta", () => {
    const salarios = r.cuentasGasto.find((c) => c.cuenta === "6.02.01.00.00");
    expect(salarios).toBeTruthy();
    expect(salarios!.ejemplos.length).toBeGreaterThan(0);
    expect(salarios!.ejemplos.length).toBeLessThanOrEqual(3);
    expect(salarios!.corta).toBe("6.02.01");
  });

  it("los 46 renglones son 46 documentos distintos", () => {
    expect(r.documentos).toBe(46);
  });
});

describe("los 7 meses, y el total del año cuadra con el archivo", () => {
  it("la suma de los 12 meses da los $243.342,48 del archivo", () => {
    // Si un mes se perdiera por el camino, acá se ve.
    let total = 0;
    let renglones = 0;
    for (let m = 1; m <= 12; m++) {
      const mes = `2026-${String(m).padStart(2, "0")}`;
      const r = resumirMesEgresos(mes, delMes(mes), ANIO);
      total += r.totalSalidaCent;
      renglones += r.renglones;
    }
    expect(usd(total)).toBe("243342.48");
    expect(renglones).toBe(378);
  });

  it("y el gasto del año da $118.753,76", () => {
    let gasto = 0;
    for (let m = 1; m <= 12; m++) {
      const mes = `2026-${String(m).padStart(2, "0")}`;
      gasto += resumirMesEgresos(mes, delMes(mes), ANIO).totalGastoCent;
    }
    expect(usd(gasto)).toBe("118753.76");
  });
});

describe("🔑 'no salió plata' y 'no sabemos' NO son lo mismo", () => {
  it("agosto: se pidió el año entero y vino vacío → sin movimientos", () => {
    const r = resumirMesEgresos("2026-08", [], ANIO);
    expect(r.estado).toBe("sin_movimientos");
    expect(r.totalSalidaCent).toBe(0);
  });

  it("un mes que NUNCA se pidió → sin datos (no un $0)", () => {
    const r = resumirMesEgresos("2025-08", [], ANIO);
    expect(r.estado).toBe("sin_datos");
  });

  it("las dos etiquetas se leen distinto en pantalla", () => {
    expect(ETIQUETA_ESTADO_EGRESOS.sin_movimientos).not.toBe(ETIQUETA_ESTADO_EGRESOS.sin_datos);
  });

  it("el MES EN CURSO cuenta como pedido aunque el rango llegue solo hasta hoy", () => {
    // 🩸 Si se exigiera cobertura COMPLETA del mes (como hace el mayor), el mes
    // en curso quedaría siempre en "no traído" — o sea, el mes que más se mira
    // sería el único invisible.
    expect(mesTocado("2026-08", [{ desde: "2026-01-01", hasta: "2026-08-13" }])).toBe(true);
    expect(mesTocado("2026-09", [{ desde: "2026-01-01", hasta: "2026-08-13" }])).toBe(false);
  });
});

describe("anti-duplicado: la llave de identidad", () => {
  const base: EgresoLinea = {
    fecha: "2026-01-02",
    mes: "2026-01",
    nInterno: "120-000001281",
    cuenta: "6.02.01.00.00",
    sucursal: "PRINCIPAL",
    proveedor: "",
    referencia: "DANIEL LEVY",
    totalCent: 200000,
    linea: 1,
  };

  it("el archivo real no tiene ni un duplicado", () => {
    expect(duplicadosExactos(TODAS)).toEqual([]);
  });

  it("el MISMO renglón dos veces se detecta", () => {
    expect(duplicadosExactos([base, { ...base, linea: 2 }])).toHaveLength(1);
  });

  it("🔴 un mismo documento repartido en DOS cuentas NO es un duplicado", () => {
    // Colapsarlo por N.INTERNO perdería plata — el error simétrico y también
    // caro. Por eso la llave lleva la cuenta.
    const otraCuenta = { ...base, cuenta: "6.03.12.00.00", linea: 2 };
    expect(duplicadosExactos([base, otraCuenta])).toEqual([]);
    expect(claveIdentidad(base)).not.toBe(claveIdentidad(otraCuenta));
  });

  it("y sumar los dos renglones da el total del documento, no el doble", () => {
    const otraCuenta = { ...base, cuenta: "6.03.12.00.00", totalCent: 50000, linea: 2 };
    const r = resumirMesEgresos("2026-01", [base, otraCuenta], ANIO);
    expect(r.totalSalidaCent).toBe(250000);
    expect(r.renglones).toBe(2);
    expect(r.documentos).toBe(1); // la pantalla puede decirlo
  });
});

describe("los negativos se muestran negativos, nunca en valor absoluto", () => {
  it("un reverso RESTA del total", () => {
    // 🩸 La firma del error clásico de este negocio: con valor absoluto la
    // diferencia da exactamente el doble del reverso.
    const l = (totalCent: number, n: string): EgresoLinea => ({
      fecha: "2026-01-02",
      mes: "2026-01",
      nInterno: n,
      cuenta: "6.02.01.00.00",
      sucursal: "",
      proveedor: "",
      referencia: "",
      totalCent,
      linea: 1,
    });
    const r = resumirMesEgresos("2026-01", [l(100000, "a"), l(-40000, "b")], ANIO);
    expect(r.totalSalidaCent).toBe(60000);
    expect(r.totalGastoCent).toBe(60000);
  });
});

describe("utilidades", () => {
  it("cuentaCorta se queda con 3 segmentos", () => {
    expect(cuentaCorta("6.03.98.00.00")).toBe("6.03.98");
  });
  it("grupoDeCuenta es el primer segmento", () => {
    expect(grupoDeCuenta("6.03.98.00.00")).toBe("6");
    expect(grupoDeCuenta("1.01.02.00.00")).toBe("1");
  });
  it("ultimoDiaDelMes conoce febrero", () => {
    expect(ultimoDiaDelMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDelMes("2024-02")).toBe("2024-02-29");
  });
});
