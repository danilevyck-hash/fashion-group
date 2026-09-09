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
      saldoSwitch: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return buildEstadoCuentaPDF({ codigo: "D-170", clienteNombre: "Cliente Del Papel", empresas: [emp], total: emp.subtotal } as any, "CLIENTE");
  };

  /** Los renglones dibujados en cada página, con su altura desde el BORDE DE
   *  ABAJO en milímetros — que es donde vive el pie. */
  async function renglonesPorPagina(doc: { output: (t: "arraybuffer") => ArrayBuffer }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
    const salida: Array<Array<{ str: string; mmDesdeAbajo: number }>> = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      salida.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (content.items as any[])
          .filter((it) => String(it.str).trim())
          .map((it) => ({ str: String(it.str), mmDesdeAbajo: (it.transform[5] as number) / 72 * 25.4 })),
      );
    }
    return salida;
  }

  it("salta de página cuando el total no cabe por encima del pie", () => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    const h = doc.internal.pageSize.getHeight(); // 279.4 mm
    expect(yParaTotal(doc, 100)).toBe(100); // hay lugar de sobra
    const antes = doc.getNumberOfPages();
    expect(yParaTotal(doc, h - 12)).toBe(20); // no cabe → página nueva
    expect(doc.getNumberOfPages()).toBe(antes + 1);
  });

  // 🔄 9-sep-2026 — CAMBIA DE DIRECCIÓN, NO DE SENTIDO. El candado exigía «con
  // 29 documentos son 2 páginas», que era la CONSECUENCIA del arreglo en el
  // papel de entonces. El papel pasó a tener la forma de Switch —diez columnas,
  // renglones más chicos— así que 29 documentos ahora entran en una hoja y ese
  // conteo dejó de significar nada.
  //
  // Lo que siempre quiso decir se exige ahora directo, y sirve para cualquier
  // papel futuro: NINGÚN renglón del documento puede caer en la banda del pie.
  // Se mide con el PDF de verdad, en milímetros.
  it("🔴 nada se dibuja encima del pie — ni con 29 documentos ni con 120", async () => {
    for (const n of [29, 120]) {
      const { doc } = build(n);
      const paginas = await renglonesPorPagina(doc);
      for (const [i, renglones] of paginas.entries()) {
        const invasores = renglones.filter(
          (r) => r.mmDesdeAbajo < 14 && !/Confidencial|fashiongr\.com|^\d+ ?\/ ?\d+$/.test(r.str),
        );
        expect(
          invasores.map((r) => `${r.str} @ ${r.mmDesdeAbajo.toFixed(1)}mm`),
          `con ${n} documentos, la hoja ${i + 1} dibuja encima del pie`,
        ).toEqual([]);
      }
    }
  });

  it("no rompe el caso corto (todo en una página)", () => {
    const { doc, filename } = build(6);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(filename).toMatch(/^Estado-cuenta-D-170-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  // CONTROL de que el papel sigue paginando: con 120 documentos no cabe en una
  // hoja, y si algún día cupieran todos habría que volver a mirar el candado de
  // arriba, no darlo por bueno.
  it("con 120 documentos el papel pagina", () => {
    expect(build(120).doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
