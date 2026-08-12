// Tests de la lib única de PDFs de catálogo (order-pdf-core + catalog-pdf).
//
// Bug histórico cubierto: el TOTAL del pedido salía repetido en CADA página
// (foot de jspdf-autotable con default 'everyPage'). La lib única lo dibuja
// con doc.text UNA vez al final — estos tests generan pedidos multipágina y
// verifican que la línea de total aparece exactamente 1 vez y en la última
// página.

import { describe, it, expect } from "vitest";
import { buildOrderPdfDoc, type PdfOrderItem } from "@/lib/catalogo/order-pdf-core";
import { buildCatalogPdfDoc } from "@/lib/catalogo/catalog-pdf";

async function extractPagesText(pdfBytes: Uint8Array): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: pdfBytes, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pages.push((content.items as any[]).map((it) => it.str).join(" "));
  }
  return pages;
}

function docBytes(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Uint8Array {
  return new Uint8Array(doc.output("arraybuffer"));
}

/** ¿El PDF embebe al menos una imagen? Con `images: {}` (sin fotos de
 *  producto) la única posible es el logo de la marca — y `doc.addImage` vive
 *  dentro de un try/catch, así que sin esto un logo roto pasaría inadvertido. */
function tieneImagenEmbebida(doc: { output: (t: "arraybuffer") => ArrayBuffer }): boolean {
  // OJO: se pide una copia FRESCA del PDF. pdf.js (extractPagesText) transfiere
  // el ArrayBuffer al worker y lo deja detached — reusar esos bytes da vacío.
  const raw = new TextDecoder("latin1").decode(docBytes(doc));
  return /\/Subtype\s*\/Image/.test(raw);
}

function makeItems(n: number, opts: { preorderEvery?: number } = {}): PdfOrderItem[] {
  return Array.from({ length: n }, (_, i) => ({
    sku: `SKU-${1000 + i}`,
    name: `Producto de prueba número ${i + 1}`,
    quantity: 2,
    unit_price: 10,
    image_url: "", // sin imagen: el test no debe tocar la red
    is_preorder: opts.preorderEvery ? i % opts.preorderEvery === 0 : false,
    category: "footwear",
  }));
}

const bultoReebok = () => 12;

describe("order-pdf-core — PDF de pedido único Reebok/Joybees", () => {
  it("pedido largo Reebok: multipágina y el TOTAL solo en la última página", async () => {
    const items = makeItems(60);
    const doc = buildOrderPdfDoc({
      marca: "reebok",
      orderNumber: "RBK-001",
      clientName: "Cliente Test",
      createdAt: "2026-07-24T12:00:00Z",
      items,
      bultoSize: bultoReebok,
      images: {},
    });
    const pages = await extractPagesText(docBytes(doc));
    expect(pages.length).toBeGreaterThan(1);

    // Línea de total: "120 bultos · 1440 piezas" y "$14,400" (sin `.00`:
    // los catálogos usan el formato de precio de src/lib/catalogo/precio.ts)
    const totalLine = "120 bultos · 1440 piezas";
    const withTotal = pages.filter((t) => t.includes(totalLine));
    expect(withTotal.length).toBe(1);
    expect(pages[pages.length - 1]).toContain(totalLine);
    expect(pages[pages.length - 1]).toContain("$14,400");
    // Ninguna página intermedia repite el total (regresión del foot everyPage)
    for (const p of pages.slice(0, -1)) {
      expect(p).not.toContain(totalLine);
      expect(p).not.toContain("$14,400");
    }
  });

  it("pedido largo Joybees: multipágina, logo en la banda y TOTAL una vez al final", async () => {
    const items = makeItems(55);
    const doc = buildOrderPdfDoc({
      marca: "joybees",
      orderNumber: "JB-001",
      clientName: "Cliente Test",
      createdAt: "2026-07-24",
      items,
      bultoSize: () => 12,
      images: {},
    });
    // La banda navy lleva el logo BLANCO de Joybees (antes era la palabra
    // "JOYBEES" en texto): ya no hay texto de marca que buscar, hay imagen.
    expect(tieneImagenEmbebida(doc)).toBe(true);
    const pages = await extractPagesText(docBytes(doc));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).not.toContain("JOYBEES");

    const totalLine = "110 bultos · 1320 piezas";
    expect(pages.filter((t) => t.includes(totalLine)).length).toBe(1);
    expect(pages[pages.length - 1]).toContain(totalLine);
    // "Panamá" con tilde (auditoría 26-jul-2026: el pie y la banda del PDF que
    // recibe el cliente decían "Panama" a secas).
    expect(pages[pages.length - 1]).toContain("Fashion Group Panamá · Joybees");
  });

  it("Reebok con pre-orden: secciones Pedido y Pre-orden separadas", async () => {
    const items = makeItems(10, { preorderEvery: 5 }); // 2 pre-orden, 8 regulares
    const doc = buildOrderPdfDoc({
      marca: "reebok",
      orderNumber: "RBK-002",
      clientName: "Cliente Test",
      createdAt: "2026-07-24T12:00:00Z",
      items,
      bultoSize: bultoReebok,
      images: {},
    });
    const text = (await extractPagesText(docBytes(doc))).join(" ");
    expect(text).toContain("Pedido");
    expect(text).toContain("Pre-orden");
    // El total sigue sumando TODO (regulares + pre-orden)
    expect(text).toContain("20 bultos · 240 piezas");
  });

  // Antes este test fijaba que la sección se titulara "Detalle". Se podó
  // (12-ago-2026): sin pre-órdenes hay UNA sola tabla en el documento y ese
  // rótulo no distinguía nada. "Pedido"/"Pre-orden" sí, y siguen (test de
  // arriba). Ahora fija lo contrario, que es el candado de la poda.
  it("sin pre-orden la tabla va SIN rótulo (ni 'Detalle' ni 'Pre-orden')", async () => {
    const doc = buildOrderPdfDoc({
      marca: "reebok",
      orderNumber: "RBK-003",
      clientName: "C",
      createdAt: "2026-07-24T12:00:00Z",
      items: makeItems(3),
      bultoSize: bultoReebok,
      images: {},
    });
    const text = (await extractPagesText(docBytes(doc))).join(" ");
    expect(text).not.toContain("Detalle");
    expect(text).not.toContain("Pre-orden");
    // Y la tabla SÍ está: que no haya rótulo no puede significar que se perdió.
    expect(text).toContain("Producto");
    expect(text).toContain("Subtotal");
  });
});

describe("catalog-pdf — PDF del catálogo completo compartido", () => {
  const section = (label: string, n: number) => ({
    label,
    items: Array.from({ length: n }, (_, i) => ({
      name: `Modelo ${label} ${i + 1}`,
      sku: `${label}-${i + 1}`,
      price: 25,
      image_url: null,
      badge: null,
    })),
  });

  it("Reebok: secciones, contador y paginación con footer", async () => {
    const doc = buildCatalogPdfDoc({
      marca: "reebok",
      sections: [section("HOMBRE", 14), section("MUJER", 9)],
      subtitle: "Todos los productos",
      totalCount: 23,
      images: {},
    });
    const pages = await extractPagesText(docBytes(doc));
    const text = pages.join(" ");
    expect(text).toContain("CATÁLOGO");
    expect(text).toContain("HOMBRE");
    expect(text).toContain("MUJER");
    expect(text).toContain("23 productos");
    // 23 productos a 3 columnas → varias páginas; cada página con footer
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p).toContain("Fashion Group — Panamá");
  });

  it("Joybees: logo propio en el header (no el de Reebok, no texto)", async () => {
    const doc = buildCatalogPdfDoc({
      marca: "joybees",
      sections: [section("CLOGS", 3)],
      subtitle: "Todos los productos",
      totalCount: 3,
      images: {},
    });
    // Sin fotos de producto (images: {}), la única imagen posible es el logo.
    expect(tieneImagenEmbebida(doc)).toBe(true);
    const text = (await extractPagesText(docBytes(doc))).join(" ");
    expect(text).not.toContain("JOYBEES");
    expect(text).toContain("CLOGS");
    expect(text).toContain("3 productos");
  });
});
