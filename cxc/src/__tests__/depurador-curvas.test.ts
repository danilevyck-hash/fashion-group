import { describe, it, expect } from "vitest";
import { parseCurvas, buildCurvasAoa, curvasFilename, pickCurvasSheet, type SheetRow } from "../lib/depurador/curvas";
import type { NamedSheet } from "../lib/depurador/logic";

const H = ["REFERENCIA", "EAN", "TALLA", "CANTIDAD", "CODIGO_PREPACK", "CANTIDAD_ORD_X_PP", "NOMBRE_DE_ESTILO"];

// Curva del ejemplo real: 21/42/63/63/42/21 = 252 pzs, 12 pzs/bulto → 21 bultos → 1/2/3/3/2/1.
const W1A = [
  ["FS100", "111", "5", 21, "W1A", 12, "Runner Azul"],
  ["FS100", "112", "6", 42, "W1A", 12, "Runner Azul"],
  ["FS100", "113", "7", 63, "W1A", 12, "Runner Azul"],
  ["FS100", "114", "8", 63, "W1A", 12, "Runner Azul"],
  ["FS100", "115", "9", 42, "W1A", 12, "Runner Azul"],
  ["FS100", "116", "10", 21, "W1A", 12, "Runner Azul"],
];

describe("Curvas — distribución por bulto", () => {
  it("ejemplo real W1A: 252 pzs ÷ 12 = 21 bultos → 1/2/3/3/2/1", () => {
    const { curvas, warnings } = parseCurvas([H, ...W1A] as SheetRow[]);
    expect(warnings).toEqual([]);
    expect(curvas).toHaveLength(1);
    const c = curvas[0];
    expect(c.referencia).toBe("FS100");
    expect(c.codigo).toBe("W1A");
    expect(c.estilo).toBe("Runner Azul");
    expect(c.ordXPp).toBe(12);
    expect(c.bultos).toBe(21);
    expect(c.totalPiezas).toBe(252);
    expect(c.cuadra).toBe(true);
    expect(c.tallas.map((t) => [t.talla, t.porBulto])).toEqual(
      [["5", 1], ["6", 2], ["7", 3], ["8", 3], ["9", 2], ["10", 1]]
    );
    expect(c.tallas.map((t) => t.ean)).toEqual(["111", "112", "113", "114", "115", "116"]);
  });

  it("referencia con 2 curvas (W1A y W1B) → 2 grupos independientes", () => {
    const w1b = [
      ["FS100", "211", "5", 10, "W1B", 6, "Runner Azul"],
      ["FS100", "212", "6", 20, "W1B", 6, "Runner Azul"],
      ["FS100", "213", "7", 30, "W1B", 6, "Runner Azul"],
    ];
    const { curvas } = parseCurvas([H, ...W1A, ...w1b] as SheetRow[]);
    expect(curvas.map((c) => c.codigo).sort()).toEqual(["W1A", "W1B"]);
    const b = curvas.find((c) => c.codigo === "W1B")!;
    expect(b.bultos).toBe(10); // 60 ÷ 6
    expect(b.tallas.map((t) => t.porBulto)).toEqual([1, 2, 3]);
    expect(b.cuadra).toBe(true);
  });

  it("suma por bulto ≠ ordXPp → ámbar (cuadra=false), sin bloquear", () => {
    const rows = [
      ["FS200", "311", "5", 20, "W2A", 12, ""],
      ["FS200", "312", "6", 22, "W2A", 12, ""], // total 42 no múltiplo de 12
    ];
    const { curvas } = parseCurvas([H, ...rows] as SheetRow[]);
    expect(curvas).toHaveLength(1);
    expect(curvas[0].cuadra).toBe(false);
    expect(curvas[0].avisos.length).toBeGreaterThan(0);
  });

  it("división por talla no exacta → ámbar aunque el total sea múltiplo", () => {
    const rows = [
      ["FS300", "411", "5", 13, "W3A", 12, ""],
      ["FS300", "412", "6", 11, "W3A", 12, ""], // total 24 = 2 bultos, pero 13/2 y 11/2 no son enteros
    ];
    const { curvas } = parseCurvas([H, ...rows] as SheetRow[]);
    expect(curvas[0].bultos).toBe(2);
    expect(curvas[0].cuadra).toBe(false);
  });

  it("ordXPp inconsistente en la misma curva → ámbar", () => {
    const rows = [
      ["FS400", "511", "5", 12, "W4A", 12, ""],
      ["FS400", "512", "6", 12, "W4A", 6, ""],
    ];
    const { curvas } = parseCurvas([H, ...rows] as SheetRow[]);
    expect(curvas[0].cuadra).toBe(false);
    expect(curvas[0].avisos.join(" ")).toContain("inconsistente");
  });

  it("filas sin CODIGO_PREPACK se ignoran con warning; talla repetida se suma", () => {
    const rows = [
      ["FS500", "611", "5", 6, "W5A", 12, ""],
      ["FS500", "611", "5", 6, "W5A", 12, ""], // misma talla partida en 2 filas
      ["FS500", "612", "6", 12, "W5A", 12, ""],
      ["FS999", "999", "7", 5, "", 0, ""], // sin curva
    ];
    const { curvas, warnings } = parseCurvas([H, ...rows] as SheetRow[]);
    expect(warnings.join(" ")).toContain("sin CODIGO_PREPACK");
    expect(curvas).toHaveLength(1);
    const c = curvas[0];
    expect(c.totalPiezas).toBe(24);
    expect(c.bultos).toBe(2);
    expect(c.tallas.map((t) => [t.talla, t.cantidadTotal, t.porBulto])).toEqual([["5", 12, 6], ["6", 12, 6]]);
    expect(c.cuadra).toBe(true);
  });

  it("tallas se ordenan numéricamente (5, 6.5, 10 — no alfabético)", () => {
    const rows = [
      ["FS600", "711", "10", 12, "W6A", 36, ""],
      ["FS600", "712", "6.5", 12, "W6A", 36, ""],
      ["FS600", "713", "5", 12, "W6A", 36, ""],
    ];
    const { curvas } = parseCurvas([H, ...rows] as SheetRow[]);
    expect(curvas[0].tallas.map((t) => t.talla)).toEqual(["5", "6.5", "10"]);
  });

  it("columnas faltantes → error claro", () => {
    expect(() => parseCurvas([["REFERENCIA", "TALLA"], ["X", "5"]] as SheetRow[]))
      .toThrow(/CANTIDAD.*CODIGO_PREPACK|No encontré/);
  });
});

describe("Curvas — Excel de salida", () => {
  it("una sección por referencia+curva: título + encabezados + filas por talla", () => {
    const { curvas } = parseCurvas([H, ...W1A] as SheetRow[]);
    const { aoa, meta } = buildCurvasAoa(curvas);
    expect(meta.titleRows).toEqual([0]);
    expect(meta.headerRows).toEqual([1]);
    expect(String(aoa[0][0])).toContain("FS100 · Curva W1A · 21 bultos · 12 pzs/bulto");
    expect(aoa[1]).toEqual(["Referencia", "Talla", "Código de barra", "Cantidad"]);
    expect(aoa[2]).toEqual(["FS100", "5", "111", 1]);
    expect(aoa[7]).toEqual(["FS100", "10", "116", 1]);
    expect(aoa).toHaveLength(8);
  });

  it("dos secciones → fila en blanco entre ellas", () => {
    const { curvas } = parseCurvas([H, ...W1A, ["FS100", "211", "5", 6, "W1B", 6, ""]] as SheetRow[]);
    const { aoa, meta } = buildCurvasAoa(curvas);
    expect(meta.titleRows).toHaveLength(2);
    expect(aoa[meta.titleRows[1] - 1]).toEqual([]); // separador
  });

  it("nombre de archivo", () => {
    const { curvas } = parseCurvas([H, ...W1A] as SheetRow[]);
    expect(curvasFilename(curvas)).toBe("CURVAS_FS100.xlsx");
    expect(curvasFilename([...curvas, ...curvas])).toBe("CURVAS_FS100_y_1_mas.xlsx");
  });
});

describe("Curvas — detección de hoja", () => {
  it("elige la hoja con PREPACK sobre otras", () => {
    const sheets: NamedSheet[] = [
      { name: "Resumen", rows: [["TOTALES"], ["X"]] },
      { name: "DATA_TXT", rows: [H, ...W1A] as SheetRow[] },
    ];
    expect(pickCurvasSheet(sheets)).toBe(sheets[1].rows);
  });
});
