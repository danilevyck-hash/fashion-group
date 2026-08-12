// Genera los assets del logo OFICIAL de Calvin Klein (el master que mandó
// Daniel el 12-ago-2026: wordmark "Calvin Klein" negro sobre transparente,
// 2075x575 con mucho aire — recortado queda 1733x270, aspecto ~6.42:1) en dos
// variantes PNG con transparencia:
//   public/calvin/calvin-wordmark.png         (negro, fondos claros)
//   public/calvin/calvin-wordmark-blanco.png  (blanco, bandas oscuras — negate)
// y deja en la consola los dataURL base64 + dimensiones para src/lib/calvin-logo.ts.
//
//   node scripts/_generar-logo-calvin.mjs [ruta-al-master.png]
//
// La variante blanca se obtiene invirtiendo SOLO el RGB (negate sin alfa): el
// negro pleno pasa a blanco y el antialiasing gris a gris claro, correcto
// sobre la banda negra del PDF de pedidos. Paleta de 16 colores (el arte es
// monocromo): PNG chico para viajar dentro de cada PDF (techo 30 KB dataURL,
// candado en logos-marca.test.ts).

import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(RAIZ, "public", "calvin");
mkdirSync(OUT, { recursive: true });

const MASTER =
  process.argv[2] ??
  "/Users/daniellevy/Library/CloudStorage/OneDrive-FashionGroup/Recursos de Marca/Calvin Klein/Logo/Calvin_Klein_Master_Logo.png";

// Ancho final de los PNG hosteados/embebidos (el master a 1733px es más de lo
// que piden la card, el header y el email; 900px sobra para retina y pesa poco).
const ANCHO = 900;

const base = await sharp(MASTER).trim().resize({ width: ANCHO }).png().toBuffer();

for (const [nombre, transform] of [
  ["calvin-wordmark.png", (img) => img],
  ["calvin-wordmark-blanco.png", (img) => img.negate({ alpha: false })],
]) {
  const png = await transform(sharp(base))
    .png({ palette: true, colors: 16 })
    .toBuffer();
  writeFileSync(join(OUT, nombre), png);
  const meta = await sharp(png).metadata();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  console.log(`${nombre}: ${meta.width}x${meta.height}, ${png.length} bytes, dataURL ${dataUrl.length} chars`);
  writeFileSync(join(OUT, nombre + ".b64.txt"), dataUrl);
}
