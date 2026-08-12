// Genera los assets del logo OFICIAL de Tommy Hilfiger (el master que mandó
// Daniel: wordmark navy + bandera sobre transparente, 886x107 con aire —
// recortado queda 831x48, aspecto ~17.31:1) en dos variantes PNG con
// transparencia:
//   public/tommy/tommy-horizontal.png         (color, fondos claros)
//   public/tommy/tommy-horizontal-blanco.png  (blanco, bandas navy #152342)
// y deja en la consola los dataURL base64 + dimensiones para src/lib/tommy-logo.ts.
//
//   node scripts/_generar-logo-tommy.mjs [ruta-al-master.png]
//
// Hasta el 12-ago-2026 estos dos PNG se rasterizaban de `tommy-horizontal.svg`,
// un trazado que NO era el arte oficial: aspecto 17.64 contra 17.31 y otro
// interletrado (6,8% de los píxeles distintos, medido). Ese SVG se eliminó para
// que quede UNA sola fuente de verdad, igual que se hizo con Calvin en #499.
//
// 🩸 LA VARIANTE BLANCA NO SE HACE CON `negate`, que es lo que sí sirve para
// Calvin. El arte de Calvin es monocromo negro; el de Tommy tiene navy
// (#00154D), rojo (#D71635) y —esto es lo que rompe— las franjas blancas de la
// bandera pintadas como blanco OPACO. Invertir el RGB dejaría el wordmark
// amarillo y la bandera celeste. Y blanquear todo a lo bruto convertiría la
// bandera en un rectángulo blanco macizo, perdiendo las franjas.
// La regla correcta es: el color se fuerza a blanco y la OPACIDAD sale de qué
// tan oscuro era el píxel. El navy y el rojo quedan OPACOS y el blanco de las
// franjas se vuelve transparente, así que sobre la banda navy del PDF la
// bandera se sigue leyendo como bandera. Es el mismo aspecto que tenía la
// variante blanca vieja, ahora derivado del arte oficial.
//
// ⚠️ La opacidad NO es proporcional a la oscuridad, es una rampa que satura:
// `min(1, oscuridad/128)`. Con la proporcional pura, el rojo (#D71635, min de
// canal 22) salía al 91% y el bloque de la bandera se veía GRIS al lado de las
// letras blancas — un detalle que en la miniatura del PDF se lee como "el logo
// está mal". La rampa deja el rojo y el navy en 100% y conserva el degradado
// del antialiasing, que es para lo único que hace falta el intermedio.
//
// Paleta de 16 colores: PNG chico para viajar dentro de cada PDF (techo 30 KB
// del dataURL, candado en logos-marca.test.ts).

import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(RAIZ, "public", "tommy");
mkdirSync(OUT, { recursive: true });

const MASTER =
  process.argv[2] ??
  "/Users/daniellevy/Library/CloudStorage/OneDrive-FashionGroup/Recursos de Marca/Tommy Hilfiger/Logo/Tommy_Hilfiger_Logo.png";

// Ancho final de los PNG hosteados/embebidos. El master recortado mide 831 px
// de ancho por 48 de alto, y 48 es EXACTAMENTE lo que pide el header (`h-4` =
// 16 px CSS) en una pantalla 3x. 900 deja ese margen sin inventar resolución.
const ANCHO = 900;

const base = await sharp(MASTER).trim().resize({ width: ANCHO }).png().toBuffer();

/** Blanco con la opacidad tomada de qué tan oscuro era el píxel (ver arriba). */
async function aBlanco(buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const oscuridad = 255 - Math.min(data[i], data[i + 1], data[i + 2]);
    const cobertura = Math.min(1, oscuridad / 128);
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = Math.round(data[i + 3] * cobertura);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

for (const [nombre, transform] of [
  ["tommy-horizontal.png", async (b) => b],
  ["tommy-horizontal-blanco.png", aBlanco],
]) {
  const png = await sharp(await transform(base)).png({ palette: true, colors: 16 }).toBuffer();
  writeFileSync(join(OUT, nombre), png);
  const meta = await sharp(png).metadata();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  console.log(
    `${nombre}: ${meta.width}x${meta.height} (aspecto ${(meta.width / meta.height).toFixed(3)}), ` +
      `${png.length} bytes, dataURL ${dataUrl.length} chars`,
  );
  writeFileSync(join(OUT, nombre + ".b64.txt"), dataUrl);
}
