// Genera las imágenes de vista previa (Open Graph) de los catálogos públicos:
// public/og/catalogo-<marca>.png, 1200x630, una por marca.
//
// Es lo que se ve en WhatsApp cuando alguien manda el link del catálogo. Se
// generan a partir de los MISMOS logos que usa la web (public/<marca>/...), así
// que si el logo cambia se vuelve a correr esto y las tres quedan al día:
//
//   node scripts/generar-og-catalogos.mjs
//
// 1200x630 = relación 1.91:1, la que WhatsApp/Facebook recortan sin cortar
// nada. PNG (WhatsApp NO renderiza SVG en og:image).

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(RAIZ, "public");

const dataUri = (rel) => {
  const ext = rel.split(".").pop().toLowerCase();
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
  return `data:${mime};base64,${readFileSync(join(PUBLIC, rel)).toString("base64")}`;
};

const MARCAS = [
  {
    marca: "reebok",
    fondo: "#1A2656",
    acento: "#E4002B",
    texto: "#FFFFFF",
    tenue: "rgba(255,255,255,0.55)",
    // El PNG de Reebok es SOLO el símbolo: la palabra se escribe al lado,
    // igual que en el header del catálogo.
    logo: `<img src="${dataUri("reebok/reebok-logo.png")}" style="height:96px" />
           <span style="font-size:92px;font-weight:900;letter-spacing:0.12em;color:#fff">REEBOK</span>`,
  },
  {
    marca: "joybees",
    fondo: "#FFE443",
    acento: "#404041",
    texto: "#404041",
    tenue: "rgba(64,64,65,0.55)",
    // El PNG de Joybees ya trae el wordmark: no se repite la palabra.
    logo: `<img src="${dataUri("joybees/joybees-logo.png")}" style="height:150px" />`,
  },
  {
    marca: "tommy",
    fondo: "#152342",
    acento: "#AE0029",
    texto: "#FFFFFF",
    tenue: "rgba(255,255,255,0.55)",
    logo: `<img src="${dataUri("tommy/tommy-flag.png")}" style="height:110px" />
           <img src="${dataUri("tommy/tommy-horizontal-blanco.png")}" style="height:46px" />`,
  },
  {
    marca: "calvin",
    // Blanco/negro minimalista: fondo negro, sin color de acento (el blob va
    // en blanco tenue). Wordmark oficial (ver calvin-logo.ts).
    fondo: "#0A0A0A",
    acento: "#FFFFFF",
    texto: "#FFFFFF",
    tenue: "rgba(255,255,255,0.55)",
    logo: `<img src="${dataUri("calvin/calvin-wordmark-blanco.png")}" style="height:64px" />`,
  },
];

const html = (m) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:${m.fondo};
       font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;
       display:flex;flex-direction:column;justify-content:center;
       padding:0 96px;position:relative;overflow:hidden}
  /* Abajo a la derecha: el wordmark de Tommy es ancho (llega a x≈1100) y
     arriba a la derecha le quedaba encima, comiéndole el contraste a "FIGER".
     Aquí no choca con el logo (centro-izquierda) ni con el sello Fashion
     Group (abajo-izquierda) en ninguna de las tres marcas. */
  .blob{position:absolute;right:-170px;bottom:-170px;width:480px;height:480px;
        border-radius:50%;background:${m.acento};opacity:0.16}
  .logo{display:flex;align-items:center;gap:28px;margin-bottom:44px}
  .tag{font-size:44px;letter-spacing:0.3em;text-transform:uppercase;
       color:${m.tenue};font-weight:500}
  .fg{position:absolute;bottom:56px;left:96px;display:flex;align-items:center;gap:14px}
  .bar{width:8px;height:34px;border-radius:99px;background:${m.acento}}
  .fgt{font-size:28px;letter-spacing:0.18em;text-transform:uppercase;
       color:${m.tenue};font-weight:600}
</style></head><body>
  <div class="blob"></div>
  <div class="logo">${m.logo}</div>
  <div class="tag">Catálogo Panamá</div>
  <div class="fg"><div class="bar"></div><div class="fgt">Fashion Group</div></div>
</body></html>`;

mkdirSync(join(PUBLIC, "og"), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const m of MARCAS) {
  await page.setContent(html(m), { waitUntil: "load" });
  const destino = join(PUBLIC, "og", `catalogo-${m.marca}.png`);
  await page.screenshot({ path: destino });
  console.log(`✓ public/og/catalogo-${m.marca}.png`);
}
await browser.close();
