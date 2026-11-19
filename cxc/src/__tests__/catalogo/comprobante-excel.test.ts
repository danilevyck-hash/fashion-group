import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import { buildOrderExcelWorkbook, COLUMNAS_EXCEL, COLUMNA_FOTO, orderExcelBytes } from "@/lib/catalogo/order-excel";
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
    expect(ws.D2.v).toBe("Cotización: TOM-027");
    expect(ws.G2.t).toBe("n");
    expect(COLUMNAS_EXCEL.map((_, c) => ws[XLSX.utils.encode_cell({ r: 3, c })].v)).toEqual([...COLUMNAS_EXCEL]);
    expect(ws.G5).toMatchObject({ t: "n", v: 252, z: "$#,##0.00" }); // 2 × 12 × 10.5
    expect(ws.G8).toMatchObject({ t: "n", v: 288 }); // total
    expect(ws.D8.v).toBe(3);
    expect(ws.E8.v).toBe(36);
    expect(ws["!autofilter"]?.ref).toBe("A4:G6");
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

  it("🔴 lleva la FOTO de cada producto en la columna «Foto» (19-nov-2026), y una que no carga no tumba el Excel", async () => {
    const JSZip = (await import("jszip")).default;
    // JPEG mínimo: los bytes no se decodifican, solo se empaquetan.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = await orderExcelBytes(
      {
        ...base,
        marca: "calvin",
        items: [
          { sku: "C1", name: "Bolso", quantity: 1, unit_price: 5, image_url: "https://x/ok.jpg", category: "x" },
          { sku: "C2", name: "Sin foto", quantity: 1, unit_price: 5, image_url: "https://x/404.jpg", category: "x" },
          { sku: "C3", name: "Revienta", quantity: 1, unit_price: 5, image_url: "https://x/boom.jpg", category: "x" },
        ],
      },
      async (url) => {
        if (url.endsWith("ok.jpg")) return { bytes: jpeg, ancho: 200, alto: 100 };
        if (url.endsWith("boom.jpg")) throw new Error("red caída");
        return null;
      },
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).filter((p) => p.startsWith("xl/media/") && !zip.files[p].dir)).toHaveLength(1);
    const dibujo = await zip.file("xl/drawings/drawing1.xml")!.async("string");
    const anclas = dibujo.match(/<xdr:oneCellAnchor>/g) ?? [];
    expect(anclas).toHaveLength(1);
    // Columna de la foto, fila del primer producto (0-based: 4 = fila 5).
    expect(dibujo).toContain(`<xdr:col>${COLUMNA_FOTO}</xdr:col>`);
    expect(dibujo).toContain("<xdr:row>4</xdr:row>");
    expect(dibujo).toContain('descr="Bolso"');
    // El panel fijo sigue (primero workbookBytes, después las fotos).
    const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(hoja).toContain("<drawing ");
    expect(hoja).toMatch(/<pane\b/);
    expect(COLUMNAS_EXCEL[COLUMNA_FOTO]).toBe("Foto");
  });

  it("sin ninguna foto sale el mismo Excel de siempre", async () => {
    const opts = {
      ...base, marca: "joybees" as const,
      items: [{ sku: "J1", name: "Clog", quantity: 1, unit_price: 5, image_url: "", category: "x" }],
    };
    const bytes = await orderExcelBytes(opts, async () => { throw new Error("no se debe llamar"); });
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).some((p) => p.startsWith("xl/media/"))).toBe(false);
  });

  it("el interruptor está prendido (17-nov-2026)", () => {
    expect(COMPROBANTE_EXCEL_2026_11).toBe(true);
  });
});
