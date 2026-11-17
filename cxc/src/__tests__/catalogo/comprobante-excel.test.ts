import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import { buildOrderExcelWorkbook, COLUMNAS_EXCEL } from "@/lib/catalogo/order-excel";
import { workbookBytes } from "@/lib/excel-export";
import { COMPROBANTE_EXCEL_2026_11 } from "@/lib/ui/comprobante-excel-2026-11";

const base = {
  orderNumber: "TOM-027",
  clientName: "Nova Lux, S.A.",
  createdAt: "2026-11-10T15:00:00Z",
  bultoSize: () => 12,
  documentoLabel: "Cotización",
};

describe("Excel del comprobante = el PDF", () => {
  it("encabezado, columnas del PDF, montos numéricos y total igual al del PDF", () => {
    const wb = buildOrderExcelWorkbook({
      ...base,
      marca: "tommy",
      items: [
        { sku: "A1", name: "Tenis", quantity: 2, unit_price: 10.5, image_url: "", category: "x" },
        { sku: "B2", name: "Sandalia", quantity: 1, unit_price: 3, image_url: "", category: "x" },
      ],
    });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(wb.SheetNames[0]).toBe("Cotización");
    expect(String(ws.A1.v)).toContain("Tommy Hilfiger");
    expect(ws.A2.v).toBe("Cliente: Nova Lux, S.A.");
    expect(ws.C2.v).toBe("Cotización: TOM-027");
    expect(ws.F2.t).toBe("n");
    expect(COLUMNAS_EXCEL.map((_, c) => ws[XLSX.utils.encode_cell({ r: 3, c })].v)).toEqual([...COLUMNAS_EXCEL]);
    expect(ws.F5).toMatchObject({ t: "n", v: 252, z: "$#,##0.00" }); // 2 × 12 × 10.5
    expect(ws.F8).toMatchObject({ t: "n", v: 288 }); // total
    expect(ws.C8.v).toBe(3);
    expect(ws.D8.v).toBe(36);
    expect(ws["!autofilter"]?.ref).toBe("A4:F6");
    expect(workbookBytes(wb).byteLength).toBeGreaterThan(0);
  });

  it("con preventa salen las dos secciones del PDF, Pedido y Preventa", () => {
    const wb = buildOrderExcelWorkbook({
      ...base,
      marca: "reebok",
      items: [
        { sku: "R1", name: "Uno", quantity: 1, unit_price: 1, image_url: "", category: "x" },
        { sku: "R2", name: "Dos", quantity: 1, unit_price: 1, image_url: "", category: "x", is_preorder: true },
      ],
    });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const textos = Object.values(ws).map((c) => (c as { v?: unknown })?.v);
    expect(textos).toContain("Pedido");
    expect(textos).toContain("Preventa");
  });

  it("el interruptor nace apagado", () => {
    expect(COMPROBANTE_EXCEL_2026_11).toBe(false);
  });
});
