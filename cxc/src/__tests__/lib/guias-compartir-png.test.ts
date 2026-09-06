// ─────────────────────────────────────────────────────────────────────────────
// 🔴 COMPARTIR: IMAGEN HASTA 6 RENGLONES, PDF DE AHÍ PARA ARRIBA.
//
// Daniel, 5-sep-2026: *«en el grupo de WhatsApp siempre ponen compartir cuando
// terminan (llega en pdf)»* — y eligió la imagen, con corte.
//
// 🔑 Una imagen se LEE dentro del chat; un PDF hay que abrirlo. Pero WhatsApp
// achica la imagen, así que con muchas líneas la letra se pierde. Medido contra
// producción el 5-sep-2026 sobre las 222 guías vivas: **60% tienen UN renglón,
// 79% tres o menos, 94% seis o menos**; solo el 6% tiene 7 o más.
//
// 🩸 Y EL ARCHIVO SE ARMA SIN UN SOLO `await`: Safari en iOS solo abre la hoja
// de compartir DENTRO del gesto del toque.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { MAX_RENGLONES_PNG, formatoParaCompartir } from "@/lib/guias/compartir-formato";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

describe("🔴 el corte está en SEIS renglones", () => {
  it("la constante dice seis", () => {
    expect(MAX_RENGLONES_PNG).toBe(6);
  });

  it("de 1 a 6 renglones sale IMAGEN — el 94% de las guías", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(formatoParaCompartir(n)).toBe("png");
  });

  it("de 7 para arriba sale PDF — el 6% restante", () => {
    for (const n of [7, 8, 17]) expect(formatoParaCompartir(n)).toBe("pdf");
  });

  it("⚠️ cero renglones cae en PDF: una imagen vacía no sirve", () => {
    expect(formatoParaCompartir(0)).toBe("pdf");
    expect(formatoParaCompartir(-1)).toBe("pdf");
    expect(formatoParaCompartir(NaN)).toBe("pdf");
  });
});

describe("🩸 el archivo se arma SÍNCRONO — iOS exige el gesto del toque", () => {
  const papel = leer("src/lib/guias/papel-de-la-guia.ts");
  const armado = /function archivoParaCompartir\(g: Guia\): File \{[\s\S]*?\n\}/.exec(papel)?.[0] ?? "";

  it("existe y no espera nada", () => {
    expect(armado.length).toBeGreaterThan(0);
    expect(armado).not.toContain("await ");
    expect(armado).not.toContain("import(");
  });

  it("decide con el módulo puro, no con un número suelto", () => {
    expect(armado).toContain("formatoParaCompartir(");
    expect(armado).not.toMatch(/length\s*<=\s*\d/);
  });

  it("⚠️ sin canvas cae al PDF de siempre: nunca se queda sin compartir", () => {
    expect(armado).toContain("if (png) return png");
    expect(armado).toContain("construirPdfGuia(g)");
  });

  it("el generador de la imagen tampoco espera nada", () => {
    const png = leer("src/lib/guias/png-guia.ts");
    const fn = /export function construirPngGuia\(g: Guia\): File \| null \{[\s\S]*?\n\}/.exec(png)?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toContain("await ");
    // `toBlob` es asíncrono; `toDataURL` no.
    expect(fn).toContain('canvas.toDataURL("image/png")');
    expect(fn).not.toContain("toBlob");
    expect(png).not.toContain("fetch(");
  });

  it("🔴 las firmas se precargan al ABRIR la guía, no al tocar el botón", () => {
    for (const p of [
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/[id]/page.tsx",
      "src/app/guias/components/GuiaDetail.tsx",
    ]) {
      expect(leer(p), p).toContain("precargarFirmasGuia");
    }
  });

  it("⚠️ y una firma que NO está lista no se inventa: se dibuja la caja vacía", () => {
    const png = leer("src/lib/guias/png-guia.ts");
    expect(png).toContain("img.complete && img.naturalWidth > 0");
    expect(png).toContain("const img = firmaLista(src)");
  });
});

describe("⚠️ lo que NO cambió", () => {
  it("el botón se sigue llamando «Compartir» y decide solo", () => {
    for (const p of [
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/[id]/page.tsx",
    ]) {
      const src = leer(p);
      expect(src).toContain("Compartir");
      // Nada de preguntarle a la persona cuántos renglones tiene su guía.
      expect(src).not.toMatch(/Compartir como (imagen|PDF)/i);
    }
  });

  it("🔴 IMPRIMIR no cambió: el papel es y sigue siendo el PDF", () => {
    const papel = leer("src/lib/guias/papel-de-la-guia.ts");
    const imprimir = /export function imprimirGuia\(g: Guia\)[\s\S]*?\n\}/.exec(papel)?.[0] ?? "";
    expect(imprimir).toContain("construirPdfGuia(g)");
    expect(imprimir).toContain("doc.autoPrint()");
    expect(imprimir).not.toContain("Png");
  });

  it("hay UNA sola puerta de compartir: la pantalla de imprimir no arma su propio PDF", () => {
    const detalle = leer("src/app/guias/components/GuiaDetail.tsx");
    expect(detalle).toContain("compartirGuia(guia)");
    expect(detalle).not.toContain("construirPdfGuia(");
  });

  it("⚠️ png-guia NO arrastra jsPDF: se puede importar sin engordar la pantalla", () => {
    const png = leer("src/lib/guias/png-guia.ts");
    expect(png).not.toContain("jspdf");
    expect(png).not.toContain("./pdf-guia");
  });
});
