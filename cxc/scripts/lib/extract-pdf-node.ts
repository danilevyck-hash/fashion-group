/**
 * Extracción de texto + rawLines de un PDF usando pdfjs-dist en Node.
 *
 * Mismo algoritmo que src/app/packing-lists/page.tsx::extractTextFromPDF
 * (clustering por Y, orden por X ascendente dentro de línea, Y descendente
 * entre líneas) pero versión Node usando el build legacy/build/pdf.mjs.
 *
 * Usado por:
 *   - scripts/generate-pl-fixture.ts  (congela el input del test)
 *   - scripts/reprocess-pl-pdf.ts     (diff de un PDF vs DB)
 *
 * No se usa en runtime del app. El frontend tiene su propia copia en page.tsx
 * para evitar traer el legacy build al bundle del browser.
 */
import { readFileSync } from "node:fs";
import type { RawLine } from "../../src/lib/parse-packing-list";

export interface ExtractedPdf {
  text: string;
  rawLines: RawLine[];
}

export async function extractPdfFromFile(path: string): Promise<ExtractedPdf> {
  const buf = readFileSync(path);
  // Buffer de fs es subclase de Uint8Array pero pdfjs en Node verifica la
  // constructor identity estricta. Clonamos a Uint8Array "puro".
  return extractPdfFromBuffer(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
}

export async function extractPdfFromBuffer(buf: Uint8Array): Promise<ExtractedPdf> {
  // Import dinámico del build legacy; tipos de pdfjs-dist en esa ruta no son
  // estrictos, se castea a un shape mínimo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = buf;
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  let fullText = "";
  const rawLines: RawLine[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = content.items as any[];
    const pdfItems: { x: number; y: number; str: string }[] = [];
    for (const item of items) {
      if (!item.str || !item.str.trim()) continue;
      pdfItems.push({ x: item.transform[4], y: item.transform[5], str: item.str });
    }
    pdfItems.sort((a, b) => b.y - a.y);
    const lineMap = new Map<number, { x: number; str: string }[]>();
    let currentClusterY = -Infinity;
    for (const item of pdfItems) {
      if (Math.abs(item.y - currentClusterY) > 2) currentClusterY = item.y;
      if (!lineMap.has(currentClusterY)) lineMap.set(currentClusterY, []);
      lineMap.get(currentClusterY)!.push({ x: item.x, str: item.str });
    }
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = lineItems.map(li => li.str).join("  ") + "\n";
      fullText += lineText;
      rawLines.push({
        text: lineText.trimEnd(),
        items: lineItems.map(li => ({ x: li.x, str: li.str })),
      });
    }
    fullText += "\n";
    rawLines.push({ text: "", items: [] });
  }
  return { text: fullText, rawLines };
}
