// Candado del Excel "sin foto" con la forma de la plantilla del banco B2B
// (`Dash Search Template.xlsx`, 30-jul-2026).
//
// Lo que pidió Daniel y hay que sostener: los códigos en la COLUMNA B, ordenados
// A-Z, y el archivo listo para usar sin pegar nada a mano.
//
// Los valores esperados se midieron sobre la plantilla real (hoja, encabezados,
// combinaciones y anchos), no se inventaron.

import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import {
  HOJA_DASH,
  MAX_POR_HOJA,
  buildDashBusquedaSheet,
  buildDashBusquedaSheets,
  bloquesDeCodigos,
  expresionOr,
  nombreHoja,
} from "@/lib/catalogos/dash-busqueda-excel";
import { buildReebokSinFotoWorkbook } from "@/lib/catalogos/sinfoto-excel";

describe("hoja DASHBOARD DE BUSQUEDA — forma de la plantilla", () => {
  const ws = buildDashBusquedaSheet(["100037854", "100074741", "100200468"]);

  it("los códigos van en la columna B, desde la fila 2", () => {
    expect(ws.B2.v).toBe("100037854");
    expect(ws.B3.v).toBe("100074741");
    expect(ws.B4.v).toBe("100200468");
    expect(ws.B5).toBeUndefined();
  });

  it("los códigos son TEXTO (no número): hay SKU con guiones y con ceros al inicio", () => {
    const conGuion = buildDashBusquedaSheet(["T1A8-32600-313", "0012345"]);
    expect(conGuion.B2.t).toBe("s");
    expect(conGuion.B2.v).toBe("T1A8-32600-313");
    expect(conGuion.B3.v).toBe("0012345"); // como número perdería el 0
  });

  it("la columna A es el contador 1..n, igual que la plantilla", () => {
    expect(ws.A2.v).toBe(1);
    expect(ws.A3.v).toBe(2);
    expect(ws.A4.v).toBe(3);
    expect(ws.A2.t).toBe("n");
  });

  it("los encabezados son los de la plantilla, en B1 y D1, con el naranja FFC000", () => {
    expect(ws.B1.v).toBe("INSERTE ARTICLE NUMBER AQUÍ (máximo 200)");
    expect(ws.D1.v).toBe("COPIAR ");
    expect(ws.B1.s.fill.fgColor.rgb).toBe("FFC000");
    expect(ws.D1.s.fill.fgColor.rgb).toBe("FFC000");
    expect(ws.A1).toBeUndefined(); // A1 va vacía en la plantilla
  });

  it("D2 trae la expresión de búsqueda YA RESUELTA (sin fórmula ni hoja auxiliar)", () => {
    expect(ws.D2.v).toBe('"100037854" OR "100074741" OR "100200468"');
    expect(ws.D2.f).toBeUndefined();
  });

  it("respeta las combinaciones y los anchos de la plantilla", () => {
    expect(ws["!merges"]).toEqual([
      { s: { r: 0, c: 3 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 3 }, e: { r: 16, c: 10 } },
    ]);
    expect(ws["!cols"]!.map((c) => c.wch)).toEqual([4, 52.78, 8.89, 85.11]);
  });

  it("NO copia los ART Number de muestra de la plantilla", () => {
    const vacia = buildDashBusquedaSheet([]);
    expect(vacia.B2).toBeUndefined();
    expect(vacia.D2.v).toBe("");
    expect(JSON.stringify(vacia)).not.toContain("100037854");
  });
});

describe("orden A-Z en la columna B", () => {
  it("ordena aunque lleguen desordenados (la cola 'Faltan foto' viene por disponibilidad)", () => {
    const [{ ws }] = buildDashBusquedaSheets(["TWTIZZIN140", "FW0FW08518YBI", "T30408-800", "AA1"]);
    expect([ws.B2.v, ws.B3.v, ws.B4.v, ws.B5.v]).toEqual([
      "AA1",
      "FW0FW08518YBI",
      "T30408-800",
      "TWTIZZIN140",
    ]);
  });

  it("la columna B queda estrictamente creciente para los 18 SKU reales de Tommy sin foto", () => {
    const reales = [
      "FW0FW08518YBI", "T1A8-32600-313", "T1A8-32600313", "T1A8-32601302", "T1B8-32621800",
      "T1XH343351100", "T30408-800", "T30766-300", "T30766-800", "T30766-999", "T3B8-32623800",
      "TH100783C-000", "TH101101000", "TWCLEMENS210", "TWLORIO143", "TWPIPPER001",
      "TWREICE2400", "TWTIZZIN140",
    ];
    // Entra al revés a propósito.
    const [{ ws }] = buildDashBusquedaSheets([...reales].reverse());
    const col = reales.map((_, i) => ws[`B${i + 2}`].v as string);
    expect(col).toHaveLength(18);
    for (let i = 1; i < col.length; i++) {
      expect(col[i].toUpperCase() > col[i - 1].toUpperCase()).toBe(true);
    }
  });

  it("el orden de D2 es el MISMO que el de la columna B", () => {
    const [{ ws }] = buildDashBusquedaSheets(["ZZ", "AA", "MM"]);
    expect(ws.D2.v).toBe('"AA" OR "MM" OR "ZZ"');
  });
});

describe("tope de 200 del portal", () => {
  it("bloquesDeCodigos parte en tandas de 200", () => {
    const muchos = Array.from({ length: 450 }, (_, i) => `C${String(i).padStart(4, "0")}`);
    const bloques = bloquesDeCodigos(muchos);
    expect(bloques.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(MAX_POR_HOJA).toBe(200);
  });

  it("con más de 200 códigos se generan hojas extra y NADIE se pierde", () => {
    const muchos = Array.from({ length: 205 }, (_, i) => `C${String(i).padStart(4, "0")}`);
    const hojas = buildDashBusquedaSheets(muchos);
    expect(hojas.map((h) => h.name)).toEqual([HOJA_DASH, `${HOJA_DASH} 2`]);
    const todos = hojas.flatMap((h) =>
      Object.keys(h.ws)
        .filter((k) => /^B([2-9]|\d\d+)$/.test(k))
        .map((k) => h.ws[k].v as string),
    );
    expect(new Set(todos).size).toBe(205);
  });

  it("la primera hoja conserva el nombre EXACTO de la plantilla", () => {
    expect(nombreHoja(0)).toBe("DASHBOARD DE BUSQUEDA");
    expect(nombreHoja(0).length).toBeLessThanOrEqual(31); // límite de Excel
    expect(nombreHoja(4).length).toBeLessThanOrEqual(31);
  });

  it("sin códigos igual sale la hoja de la plantilla (archivo nunca sin hoja)", () => {
    const hojas = buildDashBusquedaSheets([]);
    expect(hojas).toHaveLength(1);
    expect(hojas[0].name).toBe(HOJA_DASH);
  });
});

describe("expresionOr", () => {
  it("entrecomilla cada código y los une con OR", () => {
    expect(expresionOr(["A", "B"])).toBe('"A" OR "B"');
    expect(expresionOr(["A"])).toBe('"A"');
    expect(expresionOr([])).toBe("");
  });
});

describe("workbook completo del botón 'Excel sin foto' (Reebok)", () => {
  const wb = buildReebokSinFotoWorkbook([
    { sku: "100200468", nombre: "Zapato B", categoria: "Calzado", disponible: 5, existencia: 5 },
    { sku: "100037854", nombre: "Zapato A", categoria: "Calzado", disponible: 9, existencia: 9 },
  ]);

  it("la hoja de la plantilla va PRIMERA (es la que abre Excel)", () => {
    expect(wb.SheetNames[0]).toBe(HOJA_DASH);
  });

  it("NO se perdió la hoja de detalle que ya existía", () => {
    expect(wb.SheetNames).toContain("Sin foto");
  });

  it("los códigos quedan en B, ordenados A-Z, aunque las filas vengan al revés", () => {
    const ws = wb.Sheets[HOJA_DASH];
    expect(ws.B2.v).toBe("100037854");
    expect(ws.B3.v).toBe("100200468");
  });

  it("sobrevive el viaje de escritura y lectura del .xlsx (no es solo el objeto en memoria)", () => {
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const leido = XLSX.read(buf, { cellStyles: true });
    expect(leido.SheetNames[0]).toBe(HOJA_DASH);
    const ws = leido.Sheets[HOJA_DASH];
    expect(ws.B1.v).toBe("INSERTE ARTICLE NUMBER AQUÍ (máximo 200)");
    expect(ws.B2.v).toBe("100037854");
    expect(ws.B3.v).toBe("100200468");
    expect(ws.D2.v).toBe('"100037854" OR "100200468"');
  });
});
