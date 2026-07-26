// Precios del PDF de catálogo — el número que el cliente lee y por el que
// después reclama.
//
// Bug arreglado el 26-jul-2026: la celda dibujaba `price.toFixed(0)`, que
// REDONDEA. $12.50 salía "$13" — el PDF cotizaba 50 ¢ de más por unidad.
// Auditado contra la base ese día: de los 797 productos de las 3 marcas, 68
// tienen precio terminado en `.50` (67 Tommy + 1 Joybees) y ninguno tiene otro
// decimal, o sea que el único caso real que existe era justo el roto.
//
// Regla: entero → `$35` (sin `.00`, que ensucia la grilla de 3 columnas);
// con decimales → `$12.50`.

import { describe, it, expect } from "vitest";
import { buildCatalogPdfDoc, formatCatalogPrice, type CatalogPdfProduct } from "@/lib/catalogo/catalog-pdf";
import { fmtPrecio, precioTexto } from "@/lib/catalogo/precio";

async function extractText(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out += (content.items as any[]).map((it) => it.str).join(" ") + "\n";
  }
  return out;
}

const producto = (sku: string, price: number | null): CatalogPdfProduct => ({
  name: `Producto ${sku}`, sku, color: null, price, image_url: null, badge: null,
});

describe("formatCatalogPrice", () => {
  it("un precio entero va SIN decimales", () => {
    expect(formatCatalogPrice(35)).toBe("$35");
    expect(formatCatalogPrice(4)).toBe("$4");
    expect(formatCatalogPrice(61)).toBe("$61");
  });

  it("un precio con medio dólar conserva los dos decimales (no se redondea)", () => {
    // Los casos textuales de Daniel y los reales de la base.
    expect(formatCatalogPrice(12.5)).toBe("$12.50");
    expect(formatCatalogPrice(17.5)).toBe("$17.50"); // 37 productos Tommy
    expect(formatCatalogPrice(19.5)).toBe("$19.50"); // 30 productos Tommy
    expect(formatCatalogPrice(16.5)).toBe("$16.50"); // UKTRK.MPS (Joybees)
  });

  it("NUNCA redondea hacia arriba — el bug era exactamente eso", () => {
    for (const p of [12.5, 16.5, 17.5, 19.5, 49.98]) {
      expect(formatCatalogPrice(p)).not.toBe(`$${Math.round(p)}`);
    }
  });

  it("un decimal que no es .50 tampoco se pierde", () => {
    expect(formatCatalogPrice(49.98)).toBe("$49.98");
    expect(formatCatalogPrice(9.99)).toBe("$9.99");
  });
});

describe("catalog-pdf — precios impresos en el PDF real", () => {
  it("el PDF muestra $17.50 y $35, nunca $18 ni $35.00", async () => {
    const doc = buildCatalogPdfDoc({
      marca: "tommy",
      sections: [{ label: "Hombre", items: [producto("A-1", 17.5), producto("A-2", 35), producto("A-3", 19.5)] }],
      subtitle: "Todos los productos",
      totalCount: 3,
      images: {},
    });
    const texto = await extractText(doc);

    expect(texto).toContain("$17.50");
    expect(texto).toContain("$19.50");
    expect(texto).toContain("$35");
    // El redondeo viejo habría escrito estos:
    expect(texto).not.toContain("$18");
    expect(texto).not.toContain("$20");
    // Y el `.00` que ensucia la grilla tampoco aparece:
    expect(texto).not.toContain("$35.00");
  });

  it("las 3 marcas imprimen el medio dólar igual (paridad)", async () => {
    for (const marca of ["reebok", "joybees", "tommy"] as const) {
      const doc = buildCatalogPdfDoc({
        marca,
        sections: [{ label: "Sección", items: [producto("X-1", 12.5)] }],
        subtitle: "Todos los productos",
        totalCount: 1,
        images: {},
      });
      const texto = await extractText(doc);
      expect(texto, `marca ${marca}`).toContain("$12.50");
      expect(texto, `marca ${marca}`).not.toContain("$13");
    }
  });

  it("un producto sin precio sigue mostrando el guión", async () => {
    const doc = buildCatalogPdfDoc({
      marca: "reebok",
      sections: [{ label: "Sección", items: [producto("SIN", null)] }],
      subtitle: "Todos los productos",
      totalCount: 1,
      images: {},
    });
    expect(await extractText(doc)).toContain("—");
  });
});

// ── El helper ÚNICO que ahora usan pantalla, PDF, correo, WhatsApp y Telegram ──
describe("precio.ts — formato único de los catálogos", () => {
  it("nunca imprime `.00`", () => {
    expect(fmtPrecio(35)).toBe("$35");
    expect(fmtPrecio(0)).toBe("$0");
    expect(fmtPrecio(4422)).toBe("$4,422");
  });

  it("separa los miles", () => {
    expect(fmtPrecio(4422)).toBe("$4,422");
    expect(fmtPrecio(14400)).toBe("$14,400");
    expect(fmtPrecio(1234.5)).toBe("$1,234.50");
  });

  it("un TOTAL que cae en medio conserva los dos decimales", () => {
    // 3 unidades de $12.50 = $37.50 (completo); 2 de $18.50 = $37 (sin .00).
    expect(fmtPrecio(3 * 12.5)).toBe("$37.50");
    expect(fmtPrecio(2 * 18.5)).toBe("$37");
  });

  it("precioTexto es lo mismo sin el signo (para plantillas que ya lo ponen)", () => {
    expect(precioTexto(35)).toBe("35");
    expect(precioTexto(12.5)).toBe("12.50");
    expect(precioTexto(4422)).toBe("4,422");
  });

  it("la suma flotante clásica no saca un `.00` fantasma", () => {
    // 0.1 + 0.2 = 0.30000000000000004 y 3 * 12.5 puede arrastrar epsilon.
    expect(fmtPrecio(17.5 * 4 * 12)).toBe("$840");
    expect(fmtPrecio(0.1 + 0.2)).toBe("$0.30");
  });
});
