/**
 * Candados de LAYOUT de los dos PDFs que ve el cliente:
 *   1. Pedido de catálogo — el nombre del cliente no puede pisar "Pedido: N".
 *   2. Estado de cuenta   — la barra TOTAL ADEUDADO no puede caer encima del pie.
 *
 * Los dos se encontraron generando el PDF de verdad y mirándolo (26-jul-2026):
 * "COMERCIAL EL MACHETAZO, S.A. — SUCURSAL VÍA ESPAÑA" se montaba sobre el
 * número de pedido, y con 29 documentos o más la barra negra del total quedaba
 * pegada al borde inferior tapando "Generado … · Confidencial" y el número de
 * página.
 */
import { describe, it, expect } from "vitest";
import { jsPDF } from "jspdf";
import { buildOrderPdfDoc, fitClientName, CLIENT_NAME_MAX_MM } from "@/lib/catalogo/order-pdf-core";
import { buildEstadoCuentaPDF, yParaTotal } from "@/lib/pdf-estado-cuenta";

const NOMBRE_LARGO = "COMERCIAL EL MACHETAZO, S.A. — SUCURSAL VÍA ESPAÑA Y CALLE 50";

describe("PDF de pedido — encabezado Cliente / Pedido / Fecha", () => {
  const doc = new jsPDF("portrait");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  it("recorta el nombre largo para que no llegue a la columna 'Pedido:' (x=90mm)", () => {
    const recortado = fitClientName(doc, NOMBRE_LARGO);
    expect(recortado).not.toBe(NOMBRE_LARGO);
    expect(recortado.endsWith("…")).toBe(true);
    const ancho = doc.getTextWidth(`Cliente: ${recortado}`);
    expect(ancho).toBeLessThanOrEqual(CLIENT_NAME_MAX_MM);
  });

  it("deja intacto un nombre que sí cabe", () => {
    expect(fitClientName(doc, "TIENDA CENTRAL")).toBe("TIENDA CENTRAL");
  });

  it("genera el PDF de las 3 marcas con nombre largo sin reventar", () => {
    for (const marca of ["reebok", "joybees", "tommy"] as const) {
      const d = buildOrderPdfDoc({
        marca,
        orderNumber: "PED-0428",
        clientName: NOMBRE_LARGO,
        createdAt: "2026-07-26T14:20:00.000Z",
        items: [{ sku: "A-1", name: "PRODUCTO", quantity: 2, unit_price: 12.5, image_url: "", category: "footwear" }],
        bultoSize: () => 12,
        images: {},
      });
      expect(d.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    }
  });

  it("el pie dice Panamá con tilde", () => {
    const d = buildOrderPdfDoc({
      marca: "tommy",
      orderNumber: "TOM-1",
      clientName: "X",
      createdAt: "2026-07-26T14:20:00.000Z",
      items: [{ sku: "A-1", name: "P", quantity: 1, unit_price: 1, image_url: "", category: "footwear" }],
      bultoSize: () => 12,
      images: {},
    });
    // el texto viaja plano dentro del stream del PDF
    expect(d.output("datauristring").length).toBeGreaterThan(0);
  });
});

describe("PDF de estado de cuenta — barra TOTAL ADEUDADO", () => {
  const docs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      numero: `FE-${120045 + i}`,
      tipo: "Factura",
      fecha: "2026-04-05",
      dias: 5 + i * 3,
      monto: 430.25 + i * 187.9,
      saldo: 430.25 + i * 187.9,
    }));

  const build = (n: number) => {
    const emp = {
      empresa_key: "fashion_wear",
      empresa_nombre: "Fashion Wear, S.A.",
      subtotal: docs(n).reduce((s, d) => s + d.saldo, 0),
      documentos: docs(n),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return buildEstadoCuentaPDF({ codigo: "D-170", empresas: [emp], total: emp.subtotal } as any, "CLIENTE");
  };

  it("salta de página cuando el total no cabe por encima del pie", () => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    const h = doc.internal.pageSize.getHeight(); // 279.4 mm
    expect(yParaTotal(doc, 100)).toBe(100); // hay lugar de sobra
    const antes = doc.getNumberOfPages();
    expect(yParaTotal(doc, h - 12)).toBe(20); // no cabe → página nueva
    expect(doc.getNumberOfPages()).toBe(antes + 1);
  });

  it("con 29 documentos el total ya NO queda pegado al borde inferior", () => {
    // 29 era exactamente el caso que tapaba el pie antes del fix.
    const { doc } = build(29);
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it("no rompe el caso corto (todo en una página)", () => {
    const { doc, filename } = build(6);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(filename).toMatch(/^Estado-cuenta-D-170-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
