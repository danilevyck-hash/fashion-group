/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL PDF DEL PEDIDO ES CARTA, COMO TODO EL PAPEL DE LA CASA (20-sep-2026)
 *
 * 🩸 LO QUE ESTABA MAL: `order-pdf-core.ts` decía `new jsPDF("portrait")` sin
 * `format`, y el default de jsPDF es **A4**. Era el ÚNICO PDF del sistema en
 * A4: los otros catorce generadores dicen `format: "letter"` (uno `legal`),
 * incluido el PDF del catálogo del mismo módulo. El cliente imprime este papel
 * —y en Panamá la bandeja tiene carta, no A4—, así que se le recortaba.
 *
 * 🔴 Y EL ANCHO YA NO SE ESCRIBE A MANO. Había cuatro `doc.rect(0, 0, 210, 18)`
 * —210 mm es el ancho de A4— para las bandas de color del encabezado, y dos
 * textos anclados en 196 (= 210 − 14). Sobre carta (215,9 mm) esas bandas
 * habrían quedado **6 mm cortas**: una franja blanca al borde derecho de cada
 * hoja, justo donde va el color de la marca. Ahora el ancho, el alto y el
 * margen derecho salen de `medidasDeLaHoja(doc)`, que se lo pregunta al
 * documento.
 *
 * 🔑 EL PAPEL SE ARMA DE VERDAD, con un pedido de VARIAS HOJAS: leer el archivo
 * no dice si la banda llega al borde ni si el total se fue fuera de la página.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import {
  buildOrderPdfDoc,
  medidasDeLaHoja,
  MARGEN_MM,
  type PdfOrderItem,
} from "@/lib/catalogo/order-pdf-core";
import { jsPDF } from "jspdf";

const raiz = process.cwd();
const leer = (p: string): string => fs.readFileSync(path.join(raiz, p), "utf8");
const CORE = leer("src/lib/catalogo/order-pdf-core.ts");
const sinComentarios = CORE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Carta vertical, en milímetros. */
const CARTA_ANCHO = 215.9;
const CARTA_ALTO = 279.4;
const A4_ANCHO = 210;

function pedido(cuantos: number): PdfOrderItem[] {
  return Array.from({ length: cuantos }, (_, i) => ({
    sku: `RBK-${String(i + 1).padStart(3, "0")}`,
    name: `Zapatilla de prueba ${i + 1}`,
    quantity: 2,
    unit_price: 35,
    image_url: "",
    category: "calzado",
  }));
}

function papel(marca: "reebok" | "joybees" | "tommy" | "calvin", cuantos = 4): jsPDF {
  return buildOrderPdfDoc({
    marca,
    orderNumber: "RBK-001",
    clientName: "Nova Lux, S.A.",
    createdAt: "2026-09-20",
    items: pedido(cuantos),
    bultoSize: () => 12,
    images: {},
  });
}

/** Los `re` (rectángulos rellenos) del flujo del PDF: `x y w h re`. */
function rectangulos(doc: jsPDF): Array<{ x: number; y: number; w: number; h: number }> {
  const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
  const MM = 0.3527777778;
  return [...crudo.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) re/g)].map((m) => ({
    x: Number(m[1]) * MM,
    y: Number(m[2]) * MM,
    w: Number(m[3]) * MM,
    // jsPDF dibuja la banda desde ARRIBA con alto negativo: lo que importa es
    // cuánto mide, no hacia dónde crece.
    h: Math.abs(Number(m[4])) * MM,
  }));
}

describe("🔴 1. la hoja es carta, no A4", () => {
  it("el documento nace con `format: \"letter\"`, dicho a la cara", () => {
    expect(sinComentarios).toContain('format: "letter"');
    // 🩸 Y ya no existe el `new jsPDF("portrait")` a secas, que caía en A4.
    expect(sinComentarios).not.toMatch(/new jsPDF\(\s*"portrait"\s*\)/);
  });

  for (const marca of ["reebok", "joybees", "tommy", "calvin"] as const) {
    it(`${marca}: la hoja mide 215,9 × 279,4 mm`, () => {
      const doc = papel(marca);
      const hoja = medidasDeLaHoja(doc);
      expect(hoja.ancho).toBeCloseTo(CARTA_ANCHO, 1);
      expect(hoja.alto).toBeCloseTo(CARTA_ALTO, 1);
      // Y NO los 210 × 297 de A4.
      expect(hoja.ancho).not.toBeCloseTo(A4_ANCHO, 1);
    });
  }
});

describe("🔴 2. ningún ancho de A4 escrito a mano", () => {
  it("🩸 no queda un solo 210 ni un 196 de coordenada en el archivo", () => {
    // Los números de A4 (210 de ancho, 196 = 210 − 14 de margen derecho) y el
    // 290 del guard de salto (297 − 7) salían de la hoja equivocada.
    for (const linea of sinComentarios.split("\n")) {
      expect(linea, linea.trim()).not.toMatch(/\b(?:210|196|290|297)\b/);
    }
  });

  it("🔴 el ancho, el alto y el margen derecho salen de la HOJA", () => {
    expect(sinComentarios).toContain("doc.internal.pageSize.getWidth()");
    expect(sinComentarios).toContain("doc.internal.pageSize.getHeight()");
    expect(sinComentarios).toContain("const hoja = medidasDeLaHoja(doc);");
    // Las cuatro bandas de color, una por marca, todas contra el ancho real.
    expect(sinComentarios.match(/doc\.rect\(0, 0, hoja\.ancho, 18, "F"\);/g) ?? []).toHaveLength(4);
    // Los textos pegados a la derecha. 🔄 22-sep-2026: eran DOS («Fashion Group
    // · Panamá» y el monto del total) y ahora son TRES — se sumó «Página N de
    // M», que también vive contra el borde derecho de la hoja REAL. Lo que se
    // exige no cambió: ninguno se ancla a un número escrito a mano.
    expect(sinComentarios.match(/hoja\.derecha/g) ?? []).toHaveLength(3);
    expect(MARGEN_MM).toBe(14);
  });

  for (const marca of ["reebok", "joybees", "tommy", "calvin"] as const) {
    it(`${marca}: la banda de color llega al borde derecho de la hoja`, () => {
      const banda = rectangulos(papel(marca)).find((r) => r.h > 17 && r.h < 19);
      expect(banda, "no se dibujó la banda del encabezado").toBeTruthy();
      expect(banda!.x).toBeCloseTo(0, 2);
      expect(banda!.w).toBeCloseTo(CARTA_ANCHO, 1);
      // 🩸 Con el 210 de A4 quedaban 5,9 mm de papel blanco al borde.
      expect(CARTA_ANCHO - banda!.w).toBeLessThan(0.5);
    });
  }
});

describe("🔴 3. con varias hojas no se sale ni se corta nada", () => {
  /** Los textos del papel, con su `x` y su `y` en milímetros. */
  function textos(doc: jsPDF): Array<{ t: string; x: number; y: number }> {
    const crudo = Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1");
    const MM = 0.3527777778;
    return [...crudo.matchAll(/([-\d.]+)\s+([-\d.]+)\s+Td\s*\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) => ({
      t: m[3],
      x: Number(m[1]) * MM,
      // El origen del PDF está abajo: se pasa a «desde arriba de SU hoja».
      y: CARTA_ALTO - Number(m[2]) * MM,
    }));
  }

  it("un pedido largo ocupa varias hojas y todo el texto cae DENTRO de la hoja", () => {
    const doc = papel("reebok", 90);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    for (const t of textos(doc)) {
      expect(t.x, `«${t.t}» arranca fuera`).toBeGreaterThanOrEqual(-0.01);
      expect(t.x, `«${t.t}» arranca pasado el borde`).toBeLessThanOrEqual(CARTA_ANCHO);
      expect(t.y, `«${t.t}» cae fuera de lo alto`).toBeGreaterThan(0);
      expect(t.y, `«${t.t}» cae fuera de lo alto`).toBeLessThan(CARTA_ALTO);
    }
  });

  it("🔴 el total del pie se escribe UNA vez y queda dentro de la hoja", () => {
    for (const cuantos of [1, 18, 19, 20, 40, 90]) {
      const doc = papel("joybees", cuantos);
      const totales = textos(doc).filter((t) => t.t.startsWith("$"));
      // El `$` del total del pie: los subtotales de la tabla van por autotable.
      const pie = totales.filter((t) => t.x > CARTA_ANCHO - MARGEN_MM - 40);
      expect(pie.length).toBeGreaterThanOrEqual(1);
      for (const t of pie) expect(t.y).toBeLessThan(CARTA_ALTO - 5);
    }
  });

  it("🔴 el guard de salto mira el ALTO de la hoja, no el de A4", () => {
    expect(sinComentarios).toContain("if (fy + 12 > hoja.alto - 7)");
  });
});

describe("lo que el cambio de hoja NO tocó", () => {
  it("las columnas Cliente / Pedido / Fecha siguen en 14, 90 y 150 mm", () => {
    expect(sinComentarios).toContain("`Cliente: ${fitClientName(doc, clientName)}`, 14, 26");
    expect(sinComentarios).toContain("`${documentoLabel}: ${orderNumber}`, 90, 26");
    expect(sinComentarios).toContain("`Fecha: ${fechaLabel}`, 150, 26");
  });

  it("sigue habiendo UN solo generador del PDF de pedido", () => {
    expect((CORE.match(/export function buildOrderPdfDoc/g) ?? [])).toHaveLength(1);
    // Los dos wrappers solo bajan las fotos: no dibujan.
    for (const w of ["src/lib/catalogo/order-pdf.ts", "src/lib/catalogo/order-pdf-client.ts"]) {
      expect(leer(w)).not.toMatch(/doc\.(rect|text|addPage)\(/);
    }
  });

  it("🔴 y TODO el papel del sistema sigue siendo carta (o legal): ni un A4", () => {
    const libs = [
      "src/lib/pdf-cxc.ts",
      "src/lib/pdf-estado-cuenta.ts",
      "src/lib/guias/pdf-guia.ts",
      "src/lib/guias/pdf-etiquetas.ts",
      "src/lib/comisiones/pdf-comision.ts",
      "src/lib/reclamos/pdf-bulk.ts",
      "src/lib/catalogo/catalog-pdf.ts",
      "src/lib/catalogo/order-pdf-core.ts",
      "src/lib/marketing/pdf-entrega-mueble.ts",
    ];
    for (const lib of libs) {
      const src = leer(lib).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      // Ningún `new jsPDF` puede quedarse sin decir en qué hoja imprime.
      for (const llamada of src.match(/new jsPDF\([\s\S]{0,140}?\)/g) ?? []) {
        expect(llamada, `${lib}: un jsPDF sin formato cae en A4`).toMatch(/format:/);
        expect(llamada, `${lib}: A4`).not.toMatch(/"a4"/i);
      }
    }
  });
});
