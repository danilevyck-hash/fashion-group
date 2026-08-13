/**
 * El parser de EGRESOS VARIOS, contra EL ARCHIVO REAL que bajó Daniel a mano
 * del panel de Switch (Vistana, 1-ene → 13-ago-2026).
 *
 * 🔑 ESTE ES EL TEST QUE MÁS IMPORTA DEL MÓDULO: el número que el sync tiene que
 * dar es **378 renglones por $243.342,48**, al centavo, y sale de acá. Si el
 * parser se desvía, todo lo que hay encima está midiendo otra cosa.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsearEgresosCsv,
  pareceCsvDeEgresos,
  fechaEgresoAIso,
  normalizarEncabezado,
} from "@/lib/egresos/parser";
import { esGasto, duplicadosExactos } from "@/lib/egresos/reglas";

const CSV = readFileSync(
  join(process.cwd(), "src/__tests__/fixtures/egresos-vistana-2026.csv"),
  "utf8",
);

const usd = (cent: number) => (cent / 100).toFixed(2);

describe("el archivo REAL de Vistana", () => {
  const r = parsearEgresosCsv(CSV);

  it("no descarta ni un renglón", () => {
    expect(r.errores).toEqual([]);
  });

  it("trae 378 renglones por $243.342,48 — el número contra el que se certifica", () => {
    expect(r.lineas.length).toBe(378);
    expect(usd(r.lineas.reduce((a, l) => a + l.totalCent, 0))).toBe("243342.48");
  });

  it("cubre los 7 meses, con el conteo y el monto de cada uno", () => {
    // Contra el mayor, que de la misma empresa y el mismo año solo tiene enero.
    const porMes = new Map<string, { n: number; cent: number }>();
    for (const l of r.lineas) {
      const p = porMes.get(l.mes) ?? { n: 0, cent: 0 };
      p.n += 1;
      p.cent += l.totalCent;
      porMes.set(l.mes, p);
    }
    expect([...porMes.keys()].sort()).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
    const esperado: Record<string, [number, string]> = {
      "2026-01": [46, "41419.65"],
      "2026-02": [35, "17472.45"],
      "2026-03": [77, "67794.84"],
      "2026-04": [65, "39885.56"],
      "2026-05": [63, "24854.64"],
      "2026-06": [45, "32152.76"],
      "2026-07": [47, "19762.58"],
    };
    for (const [mes, [n, cent]] of Object.entries(esperado)) {
      expect([mes, porMes.get(mes)!.n, usd(porMes.get(mes)!.cent)]).toEqual([mes, n, cent]);
    }
  });

  it("son 42 cuentas contables distintas", () => {
    expect(new Set(r.lineas.map((l) => l.cuenta)).size).toBe(42);
  });

  it("🔴 NO es solo el grupo 6: el gasto es MENOS de la mitad de lo que salió", () => {
    // Si esto se rompe, alguien está por pintar $243.342,48 como "gastos" —
    // contando como gasto una transferencia entre cuentas propias.
    const porGrupo = new Map<string, { n: number; cent: number }>();
    for (const l of r.lineas) {
      const g = l.cuenta.split(".")[0];
      const p = porGrupo.get(g) ?? { n: 0, cent: 0 };
      p.n += 1;
      p.cent += l.totalCent;
      porGrupo.set(g, p);
    }
    expect(porGrupo.get("6")).toEqual({ n: 233, cent: 11875376 });
    expect(porGrupo.get("2")).toEqual({ n: 101, cent: 3601281 });
    expect(porGrupo.get("1")).toEqual({ n: 40, cent: 8343975 });
    expect(porGrupo.get("3")).toEqual({ n: 2, cent: 421234 });
    expect(porGrupo.get("5")).toEqual({ n: 2, cent: 92382 });

    const gasto = r.lineas.filter((l) => esGasto(l.cuenta));
    expect(gasto.length).toBe(233);
    expect(usd(gasto.reduce((a, l) => a + l.totalCent, 0))).toBe("118753.76");
  });

  it("los 378 renglones son distintos entre sí — no hay nada que contar dos veces", () => {
    expect(duplicadosExactos(r.lineas)).toEqual([]);
    expect(new Set(r.lineas.map((l) => l.nInterno)).size).toBe(378);
  });

  it("lee bien la primera fila, campo por campo", () => {
    expect(r.lineas[0]).toEqual({
      fecha: "2026-03-22",
      mes: "2026-03",
      nInterno: "120-000001276",
      cuenta: "6.03.98.00.00",
      sucursal: "PRINCIPAL",
      proveedor: "",
      referencia: "BAC INTERNATION-5536206912346041-ALBERTO LEVY SASSON BLACK",
      totalCent: 900000,
      linea: 1,
    });
  });

  it("el rango observado va del 1-ene al 31-jul (agosto todavía no tiene egresos)", () => {
    expect(r.rangoObservado).toEqual({ desde: "2026-01-01", hasta: "2026-07-31" });
  });

  it("no hay ni un monto negativo ni un cero en el archivo real", () => {
    expect(r.lineas.filter((l) => l.totalCent <= 0)).toEqual([]);
  });

  it("el egreso más grande es $11.700,95 — el récord que calibra el guard de montos", () => {
    const max = Math.max(...r.lineas.map((l) => l.totalCent));
    expect(usd(max)).toBe("11700.95");
  });
});

describe("la fecha viene YYYY-MM-DD, no DD-MM-YYYY", () => {
  it("lee el formato que manda este reporte", () => {
    expect(fechaEgresoAIso("2026-03-22")).toBe("2026-03-22");
  });

  it("acepta también DD-MM-YYYY, por si Switch cambia de formato", () => {
    // Sin esto, un cambio de formato vaciaría el módulo EN SILENCIO — que es
    // exactamente lo que le pasó a sync-proveedores (821 de 821 en null).
    expect(fechaEgresoAIso("22-03-2026")).toBe("2026-03-22");
  });

  it("rechaza lo que no es una fecha del calendario", () => {
    expect(fechaEgresoAIso("2026-02-31")).toBeNull();
    expect(fechaEgresoAIso("2026-13-01")).toBeNull();
    expect(fechaEgresoAIso("")).toBeNull();
    expect(fechaEgresoAIso("marzo")).toBeNull();
  });

  it("todas las fechas del archivo real quedaron en el año pedido", () => {
    const { lineas } = parsearEgresosCsv(CSV);
    expect(lineas.every((l) => l.fecha.startsWith("2026-"))).toBe(true);
  });
});

describe("reconocer el archivo", () => {
  it("reconoce el CSV real", () => {
    expect(pareceCsvDeEgresos(CSV)).toBe(true);
  });

  it("NO reconoce el HTML de excepción de Switch (que llega con HTTP 200)", () => {
    expect(pareceCsvDeEgresos("<!DOCTYPE html><html><body>Whoops</body></html>")).toBe(false);
  });

  it("NO reconoce el CSV del MAYOR — son dos reportes distintos", () => {
    expect(
      pareceCsvDeEgresos("ASIENTO;DESCRIPCION;FECHA; NOMBRE  CUENTA ;CUENTA;DEBITO;CREDITO"),
    ).toBe(false);
  });

  it("acepta el encabezado sin la columna PROVEEDOR (Switch la omite fuera de Panamá)", () => {
    expect(pareceCsvDeEgresos("FECHA;N.INTERNO; CUENTA  CONTABLE ;SUCURSAL;REFERENCIA;TOTAL")).toBe(
      true,
    );
  });

  it("normaliza los dobles espacios del encabezado", () => {
    expect(normalizarEncabezado(" CUENTA  CONTABLE ")).toBe("cuenta contable");
  });
});

describe("filas que no se pueden leer se REPORTAN, no se cuentan como cero", () => {
  const cab = "FECHA;N.INTERNO; CUENTA  CONTABLE ;SUCURSAL;PROVEEDOR;REFERENCIA;TOTAL";

  it("un monto ilegible no entra como 0", () => {
    const r = parsearEgresosCsv(`${cab}\n2026-01-02;120-1;6.02.01.00.00;PRINCIPAL;;X;abc`);
    expect(r.lineas).toEqual([]);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].motivo).toContain("Monto ilegible");
  });

  it("una cuenta que no tiene 5 segmentos no entra", () => {
    const r = parsearEgresosCsv(`${cab}\n2026-01-02;120-1;6.02;PRINCIPAL;;X;10.00`);
    expect(r.lineas).toEqual([]);
    expect(r.errores[0].motivo).toContain("Código de cuenta inválido");
  });

  it("un renglón sin N. INTERNO no entra: sin él no se puede auditar contra Switch", () => {
    const r = parsearEgresosCsv(`${cab}\n2026-01-02;;6.02.01.00.00;PRINCIPAL;;X;10.00`);
    expect(r.lineas).toEqual([]);
    expect(r.errores[0].motivo).toContain("N. INTERNO");
  });

  it("un archivo que no es este reporte se rechaza entero, no fila por fila", () => {
    const r = parsearEgresosCsv("A;B;C\n1;2;3");
    expect(r.lineas).toEqual([]);
    expect(r.errores[0].motivo).toContain("No parece el archivo de egresos varios");
  });

  it("una fila buena y una mala: la buena entra igual", () => {
    const r = parsearEgresosCsv(
      `${cab}\n2026-01-02;120-1;6.02.01.00.00;PRINCIPAL;;OK;10.00\n2026-01-03;120-2;NO;PRINCIPAL;;MAL;5.00`,
    );
    expect(r.lineas).toHaveLength(1);
    expect(r.errores).toHaveLength(1);
  });
});
