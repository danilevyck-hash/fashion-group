/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 NINGUNA HOJA DEL PAPEL DEL CLIENTE SE QUEDA SIN DECIR DE QUIÉN ES
 * (22-sep-2026)
 *
 * 🩸 MEDIDO SOBRE LOS PAPELES REALES que recibieron los clientes, bajados el
 * 20-sep-2026:
 *
 *   · `pdf-pedido-reebok-PED-024.pdf` (adentro es **PED-023**, 3 hojas): la
 *     hoja 1 llevaba la banda con el logo, «Cliente: Nova Lux, S.A.»,
 *     «Pedido: PED-023» y «Fecha: 3 de septiembre de 2026». Las hojas **2 y 3**
 *     traían la fila de encabezados de la tabla **y nada más** — sin logo, sin
 *     cliente, sin número, sin fecha y **sin numeración de página**. Si al
 *     cliente se le suelta la hoja 3, no hay cómo saber de qué pedido es ni
 *     cuántas hojas eran.
 *
 *   · `pdf-cotizacion-tommy.pdf` (2 hojas): la hoja 2 traía DOS líneas —«20
 *     bultos · 224 piezas» y «$10,064»— y el **92 % en blanco**. El total se
 *     fue SOLO a una hoja nueva porque la tabla llegó pegada al borde.
 *
 * Los dos arreglos son de LUGAR, no de números: la cabecera se repite en cada
 * hoja, cada hoja dice «Página N de M», y la tabla reserva abajo el sitio del
 * total para que nunca tenga que saltar de hoja solo.
 *
 * 🔑 EL PAPEL SE ARMA DE VERDAD Y SE LEE CON pdfjs: mirar el código no dice si
 * la cabecera se dibujó en la hoja 3.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import {
  buildOrderPdfDoc,
  ALTO_PIE_MM,
  TOP_CONTENIDO_MM,
  type PdfOrderItem,
} from "@/lib/catalogo/order-pdf-core";
import { jsPDF } from "jspdf";

const CORE = fs.readFileSync(
  path.join(process.cwd(), "src/lib/catalogo/order-pdf-core.ts"),
  "utf8",
);
const sinComentarios = CORE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const CLIENTE = "Nova Lux, S.A.";
const NUMERO = "PED-023";

function items(n: number, preorderCada = 0): PdfOrderItem[] {
  return Array.from({ length: n }, (_, i) => ({
    sku: `1002600${String(i).padStart(3, "0")}`,
    name: `ZIG DYNAMICA ${i + 1}`,
    quantity: 1,
    unit_price: 56,
    image_url: "",
    category: "calzado",
    ...(preorderCada && i % preorderCada === 0 ? { is_preorder: true } : {}),
  }));
}

function papel(
  marca: "reebok" | "joybees" | "tommy" | "calvin",
  cuantos: number,
  preorderCada = 0,
): jsPDF {
  return buildOrderPdfDoc({
    marca,
    orderNumber: NUMERO,
    clientName: CLIENTE,
    createdAt: "2026-09-03",
    items: items(cuantos, preorderCada),
    bultoSize: () => 12,
    images: {},
    documentoLabel: marca === "tommy" ? "Cotización" : "Pedido",
  });
}

/** El texto de cada hoja, leído del PDF de verdad (no del código). */
async function hojas(doc: jsPDF): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(doc.output("arraybuffer") as ArrayBuffer),
    useSystemFonts: true,
  }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.push((content.items as any[]).map((it) => String(it.str)).join(" "));
  }
  return out;
}

describe("🔴 1. cada hoja dice de quién es el papel", () => {
  for (const marca of ["reebok", "joybees", "tommy", "calvin"] as const) {
    it(`${marca}: cliente, número y fecha en TODAS las hojas`, async () => {
      const doc = papel(marca, 60);
      const paginas = await hojas(doc);
      expect(paginas.length, "el pedido tiene que paginar").toBeGreaterThan(1);
      const etiqueta = marca === "tommy" ? "Cotización" : "Pedido";
      for (const [i, texto] of paginas.entries()) {
        expect(texto, `hoja ${i + 1} sin cliente`).toContain(CLIENTE);
        expect(texto, `hoja ${i + 1} sin número`).toContain(`${etiqueta}: ${NUMERO}`);
        expect(texto, `hoja ${i + 1} sin fecha`).toContain("3 de septiembre de 2026");
        // Y la banda de la marca, que es lo que se reconoce de lejos.
        expect(texto, `hoja ${i + 1} sin la banda de la casa`).toContain("Fashion Group · Panamá");
      }
    });
  }

  it("🩸 y la hoja 2 ya no es solo la fila de encabezados", async () => {
    // Así salía el papel real: la hoja 2 empezaba en «Producto SKU Bultos…».
    const paginas = await hojas(papel("reebok", 60));
    expect(paginas[1].trimStart().startsWith("Producto")).toBe(false);
  });
});

describe("🔴 2. «Página N de M» en todas las hojas", () => {
  for (const cuantos of [3, 20, 60, 120]) {
    it(`con ${cuantos} renglones, cada hoja se numera y el total es el REAL`, async () => {
      const doc = papel("reebok", cuantos);
      const paginas = await hojas(doc);
      const m = paginas.length;
      paginas.forEach((texto, i) => {
        expect(texto, `hoja ${i + 1} sin numeración`).toContain(`Página ${i + 1} de ${m}`);
      });
      // Ninguna hoja dice ser otra: el «N» no se repite.
      const numerados = paginas.filter((t) => /Página \d+ de \d+/.test(t));
      expect(numerados).toHaveLength(m);
    });
  }

  it("una sola hoja también se numera — «Página 1 de 1»", async () => {
    const paginas = await hojas(papel("calvin", 4));
    expect(paginas).toHaveLength(1);
    expect(paginas[0]).toContain("Página 1 de 1");
  });
});

describe("🔴 3. el total nunca se va solo a una hoja casi vacía", () => {
  /**
   * El barrido del 🩸: para CADA cantidad de renglones, la hoja donde cae el
   * total tiene que llevar renglones de la tabla. Se busca el número justo que
   * hacía saltar el total, sin saber cuál es.
   */
  for (const marca of ["reebok", "tommy"] as const) {
    it(`${marca}: la hoja del total SIEMPRE trae renglones, de 1 a 60`, async () => {
      for (let n = 1; n <= 60; n++) {
        const doc = papel(marca, n);
        const paginas = await hojas(doc);
        const ultima = paginas[paginas.length - 1];
        expect(ultima, `con ${n} renglones el total no está en la última hoja`)
          .toContain("bultos ·");
        // Un renglón de la tabla = un SKU. Si la última hoja no trae ninguno,
        // el total quedó solo — que es exactamente lo que pasaba en Tommy.
        const conSku = (ultima.match(/1002600\d{3}/g) ?? []).length;
        expect(conSku, `con ${n} renglones la hoja del total quedó sin renglones`)
          .toBeGreaterThan(0);
      }
    }, 120000);
  }

  it("🔴 el sitio del total se RESERVA: la tabla no baja de `alto − ALTO_PIE_MM`", () => {
    expect(sinComentarios).toContain("margin: { top: TOP_CONTENIDO_MM, bottom: ALTO_PIE_MM }");
    expect(ALTO_PIE_MM).toBeGreaterThan(TOP_CONTENIDO_MM - 8);
    // La cuenta del comentario: total en finalY+8, firma en finalY+18, y
    // «Página N de M» fijo en alto−10. Con menos aire la firma lo pisaría.
    expect(ALTO_PIE_MM).toBeGreaterThanOrEqual(18 + 13);
  });

  it("el guard de salto se queda como red de seguridad, pero ya no dispara", async () => {
    expect(sinComentarios).toContain("if (fy + 12 > hoja.alto - 7)");
    // Con la reserva puesta, ninguna hoja final del barrido de arriba quedó sin
    // renglones — o sea que el guard no se usó ni una vez.
    const paginas = await hojas(papel("tommy", 20));
    expect(paginas[paginas.length - 1]).toMatch(/1002600\d{3}/);
  });
});

describe("🔴 4. la cabecera es UNA sola, y se dibuja UNA vez por hoja", () => {
  it("existe una sola función de cabecera y el resto la llama", () => {
    expect((sinComentarios.match(/function dibujarCabecera\(\)/g) ?? [])).toHaveLength(1);
    // Nadie la llama directo: se pasa por el guard que evita repetirla.
    expect((sinComentarios.match(/\bdibujarCabecera\(\);/g) ?? [])).toHaveLength(1);
    expect(sinComentarios).toContain("willDrawPage: cabeceraSiFalta");
  });

  it("🩸 con DOS tablas (Pedido + Pre-orden) la cabecera no se dibuja dos veces", async () => {
    // autoTable avisa por TABLA, no por documento: sin el guard, la segunda
    // tabla volvía a estampar el mismo texto sobre la misma hoja.
    const doc = papel("reebok", 40, 7);
    const paginas = await hojas(doc);
    for (const [i, texto] of paginas.entries()) {
      const veces = (texto.match(/Cliente:/g) ?? []).length;
      expect(veces, `la hoja ${i + 1} repite la cabecera`).toBe(1);
    }
  });

  /**
   * ⚠️ DECISIÓN, NO OLVIDO: la firma de la marca («Fashion Group Panamá ·
   * Reebok Authorized Distributor») se queda SOLO en la última hoja, pegada al
   * total. Es la línea que CIERRA el documento, no un pie de página: repetirla
   * en las cinco hojas agrega ruido donde ya está la banda de la marca arriba.
   * Lo que cada hoja necesitaba —de quién es y cuántas son— ya lo llevan la
   * cabecera y «Página N de M». Cambiarlo es una línea, y lo decide Daniel.
   */
  it("⚠️ la firma de la marca va SOLO en la última hoja, a propósito", async () => {
    const paginas = await hojas(papel("reebok", 60));
    const firma = "Reebok Authorized Distributor";
    expect(paginas.filter((t) => t.includes(firma))).toHaveLength(1);
    expect(paginas[paginas.length - 1]).toContain(firma);
    // Y la banda de la marca SÍ está arriba en todas: la identidad no depende
    // de la firma.
    for (const t of paginas) expect(t).toContain("Fashion Group · Panamá");
  });

  it("el total sigue escribiéndose UNA sola vez, en la última hoja", async () => {
    const paginas = await hojas(papel("reebok", 60));
    const conTotal = paginas.filter((t) => t.includes("60 bultos · 720 piezas"));
    expect(conTotal).toHaveLength(1);
    expect(paginas[paginas.length - 1]).toContain("60 bultos · 720 piezas");
  });
});
