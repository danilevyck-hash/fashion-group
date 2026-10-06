// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — LO QUE NO SE PAGA NO SALE EN EL PAPEL, Y LOS TOTALES DEL EXCEL
// SON FÓRMULAS (6-oct-2026).
//
// 🩸 El PDF de Rodrigo (Vistana, sep) decía «Cobros $8,134 × 0.00% = $0», con la
// sección COBROS entera y «TOTAL VENTAS + COBROS $16,268»: Daniel leyó que
// Rodrigo cobraba. Y en el Excel «Total ventas 141700.5» era un valor fijo: si
// se borraba una línea, nada se recalculaba.
// Sostiene: (1) con tasa 0 % o «No pagable» la sección no sale en el PDF ni en
// el Excel —ni su línea del RESUMEN del pie, que es el mismo bloque del Excel
// (Daniel, 6-oct-2026: «quiero ver el resumen abajo, igual que en el Excel
// simple»)—; (2) con las dos fuera, la persona no sale; (3) «TOTAL VENTAS +
// COBROS» no vuelve; (4) los totales del Excel son fórmulas con el MISMO valor.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";
import { construirPdfComision } from "@/lib/comisiones/pdf-comision";
import { seccionesDelPapel, entraAlPapel } from "@/lib/comisiones/papel-pagable";
import { buildComisionDetalleSheet, buildComisionesResumenSheet, type ComisionDetalle } from "@/lib/ventas/comisionExcel";
import { buildReportSheet, formulaDelTotal, workbookBytes, workbookFromSheets } from "@/lib/excel-export";

async function textoDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += ((await page.getTextContent()).items as any[]).map((it) => it.str).join(" ") + " ";
  }
  return texto.replace(/\s+/g, " ");
}

/** Rodrigo en Vistana, septiembre: vende al 0.50 % y NO cobra (tasa de cobro 0 %). */
const RODRIGO: ComisionDetalle = {
  empresa_key: "vistana", year: 2026, mes: 9, vendedor: "RODRIGO",
  tasa_venta: 0.005, tasa_cobro: 0,
  ventas: [
    { fecha: "2026-09-01", cliente: "Outlet Duty Free N3, S.A.", secuencial: "11-000003063", tipo: "Factura", subtotal: 7590, pct_utilidad: 30 },
    { fecha: "2026-09-07", cliente: "Distribuidora Karen Viva Panama", secuencial: "11-000003070", tipo: "Factura", subtotal: 544, pct_utilidad: 25 },
  ],
  cobros: [{ fecha: "2026-09-10", cliente: "Hafez, S.A.", monto: 8134 }],
  ventas_base: 8134, cobros_base: 8134,
  comision_venta: 40.67, comision_cobro: 0, comision_total: 40.67,
} as unknown as ComisionDetalle;

const hoja = (data: ComisionDetalle, vendedor = data.vendedor) =>
  ({ data, descuentos: [], empresaNombre: "Vistana", vendedor, year: 2026, mes: 9 });

describe("qué secciones lleva el papel", () => {
  it("tasa de cobro 0 % → sin Cobros; «No pagable» → ninguna", () => {
    expect(seccionesDelPapel(RODRIGO, "RODRIGO")).toEqual({ ventas: true, cobros: false });
    expect(seccionesDelPapel({ tasa_venta: 0, tasa_cobro: 0.005 }, "EDWIN")).toEqual({ ventas: false, cobros: true });
    const def = seccionesDelPapel({ tasa_venta: 0.005, tasa_cobro: 0.005 }, "DEFAULT");
    expect(def).toEqual({ ventas: false, cobros: false });
    expect(entraAlPapel(def)).toBe(false);
  });
});

describe("🔴 el PDF sin cobros no tiene la sección", () => {
  it("Rodrigo: Ventas sí; Cobros, su línea y «TOTAL VENTAS + COBROS», no", async () => {
    const texto = await textoDelPdf(construirPdfComision([hoja(RODRIGO)]));
    expect(texto).toContain("VENTAS");
    expect(texto).not.toContain("COBROS");
    expect(texto).not.toContain("× 0.00%");
    expect(texto).not.toContain("TOTAL VENTAS + COBROS");
    expect(texto).not.toContain("Hafez");
    expect(texto).toContain("Comisión de ventas $40.67");
    // 🔴 6-oct-2026: el RESUMEN del pie —el mismo del Excel— solo lleva la línea
    // que aplica, y su total cuadra con el número grande de arriba.
    expect(texto).toContain("RESUMEN");
    expect(texto).toContain("Ventas $8,134.00 × 0.50% $40.67");
    expect(texto).toContain("Comisión total $40.67");
    expect(texto).not.toContain("Cobros $");
    expect(texto).not.toContain("en cobros");
  });

  it("quien no tiene ninguna sección no sale en el papel de varias empresas", async () => {
    const texto = await textoDelPdf(construirPdfComision([
      hoja(RODRIGO),
      hoja({ ...RODRIGO, vendedor: "DEFAULT" } as ComisionDetalle, "DEFAULT"),
    ]));
    expect(texto.match(/Comisión — /g)?.length).toBe(1);
  });
});

describe("🔴 el Excel sin cobros no tiene la sección, y sus totales son fórmulas", () => {
  it("Rodrigo: sin COBROS, el resumen solo con Ventas, todo con fórmulas", async () => {
    const ws = await buildComisionDetalleSheet(RODRIGO, "Vistana");
    const celdas = Object.entries(ws).filter(([k]) => !k.startsWith("!")) as [string, XLSX.CellObject][];
    const textos = celdas.map(([, c]) => c.v);
    expect(textos).not.toContain("COBROS");
    expect(textos).not.toContain("Total cobros");
    expect(textos).not.toContain("Cobros");
    // Total ventas = SUMA del rango, con el valor del sistema de respaldo.
    const totalVentas = celdas.find(([k]) => k.startsWith("E") && ws[`D${k.slice(1)}`]?.v === "Total ventas")!;
    expect(totalVentas[1].f).toBe("SUM(E4:E5)");
    expect(totalVentas[1].v).toBe(8134);
    // Resumen: base = el total de arriba, tasa en % en su celda, comisión = base × tasa.
    const filaVentas = celdas.find(([k, c]) => k.startsWith("A") && c.v === "Ventas")![0].slice(1);
    expect(ws[`B${filaVentas}`].f).toBe(totalVentas[0]);
    expect(ws[`C${filaVentas}`].v).toBe(0.005);
    expect(String(ws[`C${filaVentas}`].z)).toContain("%");
    expect(ws[`D${filaVentas}`].f).toBe(`ROUND(B${filaVentas}*C${filaVentas},2)`);
    const filaTotal = celdas.find(([k, c]) => k.startsWith("A") && c.v === "Comisión total")![0].slice(1);
    expect(ws[`D${filaTotal}`].f).toBe(`D${filaVentas}`);
    expect(ws[`D${filaTotal}`].v).toBe(40.67);
  });

  it("el resumen por empresa suma con fórmula y resta a quien no se paga", async () => {
    const ws = await buildComisionesResumenSheet({
      empresaKey: "vistana", empresaNombre: "Vistana", year: 2026, mes: 9,
      vendedores: [
        { vendedor: "EDWIN", base: 100, comision: 1, base_cobro: 50, comision_cobro: 0.5, comision_total: 1.5 },
        { vendedor: "DEFAULT", base: 30, comision: 0.3, base_cobro: 0, comision_cobro: 0, comision_total: 0.3, se_paga: false },
        { vendedor: "RODRIGO", base: 200, comision: 2, base_cobro: 0, comision_cobro: 0, comision_total: 2 },
      ],
    });
    expect(ws["B6"].f).toBe("SUM(B2:B4)-B3");
    expect(ws["B6"].v).toBe(300);
    expect(ws["F6"].f).toBe("SUM(F2:F4)-F3");
  });
});

describe("🔴 en TODO el sistema, el pie que es una suma va con fórmula", () => {
  it("si el total es la suma de su columna, fórmula; si no (un margen), valor", () => {
    const rows = [["A", 10, 0.2], ["B", 30, 0.4]];
    expect(formulaDelTotal(1, rows, 2, 40)).toBe("SUM(B2:B3)");
    expect(formulaDelTotal(2, rows, 2, 0.35)).toBeNull();
    const ws = buildReportSheet({
      columns: [{ header: "Vendedora", wch: 20 }, { header: "Venta", wch: 12 }, { header: "Margen", wch: 10 }],
      rows,
      totals: ["Total", 40, 0.35],
    });
    expect(ws["B5"].f).toBe("SUM(B2:B3)");
    expect(ws["B5"].v).toBe(40);
    expect(ws["C5"].f).toBeUndefined();
  });

  it("y la fórmula sobrevive al archivo de verdad (con el panel fijo)", async () => {
    const ws = await buildComisionDetalleSheet(RODRIGO, "Vistana");
    const bytes = workbookBytes(workbookFromSheets([{ name: "Comisión", ws }]));
    const leido = XLSX.read(bytes, { type: "array", cellFormula: true }).Sheets["Comisión"];
    const conFormula = Object.keys(leido).filter((k) => !k.startsWith("!") && leido[k].f);
    expect(conFormula.length).toBeGreaterThanOrEqual(3);
  });
});
