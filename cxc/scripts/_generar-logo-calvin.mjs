// Genera el placeholder tipográfico de Calvin Klein (texto "CALVIN KLEIN"
// limpio, sin arte oficial — Daniel manda el logo definitivo después, igual que
// el de Tommy) en dos variantes PNG con transparencia:
//   public/calvin/calvin-wordmark.png         (texto casi negro, fondos claros)
//   public/calvin/calvin-wordmark-blanco.png  (texto blanco, bandas oscuras)
// y deja en la consola los dataURL base64 + dimensiones para src/lib/calvin-logo.ts.
//
//   node scripts/_generar-logo-calvin.mjs

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(RAIZ, "public", "calvin");
mkdirSync(OUT, { recursive: true });

const html = (color) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  body{background:transparent;display:inline-block}
  .wm{font-family:"Futura","Avenir Next","Helvetica Neue",Arial,sans-serif;
      font-weight:600;font-size:96px;letter-spacing:0.18em;
      text-transform:uppercase;color:${color};white-space:nowrap;
      padding:8px 12px 8px 4px}
</style></head><body><span class="wm">Calvin&nbsp;Klein</span></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 220 } });

for (const [nombre, color] of [
  ["calvin-wordmark.png", "#1a1a1a"],
  ["calvin-wordmark-blanco.png", "#ffffff"],
]) {
  await page.setContent(html(color));
  const el = page.locator(".wm");
  const raw = await el.screenshot({ omitBackground: true });
  // trim + compresión con paleta (el texto es 1 color): PNG chico para jsPDF.
  const png = await sharp(raw).trim().png({ palette: true, colors: 16 }).toBuffer();
  writeFileSync(join(OUT, nombre), png);
  const meta = await sharp(png).metadata();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  console.log(`${nombre}: ${meta.width}x${meta.height}, ${png.length} bytes, dataURL ${dataUrl.length} chars`);
  writeFileSync(join(OUT, nombre + ".b64.txt"), dataUrl);
}

await browser.close();
