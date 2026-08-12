// Capturas + medición del catálogo público tras la poda de textos, el logo
// oficial de Tommy y las píldoras derivadas de los productos (12-ago-2026).
// SOLO LECTURA. ANTES = producción (www.fashiongr.com), DESPUÉS = build local.
//
//   node scripts/_capturas-header-poda.mjs            # después (localhost:3155)
//   ETAPA=antes node scripts/_capturas-header-poda.mjs # antes (producción)
//
// Mide, por marca y por ancho: arrastre horizontal de la PÁGINA, alto del
// header (que no quede un hueco donde estaba "CATÁLOGO PANAMÁ") y qué píldoras
// de Género/Categoría se dibujan — que es el efecto que Daniel quiere ver.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const ETAPA = process.env.ETAPA === "antes" ? "antes" : "despues";
const BASE = process.env.BASE || (ETAPA === "antes" ? "https://www.fashiongr.com" : "http://localhost:3155");
const OUT = `/tmp/capturas-poda-catalogo/${ETAPA}`;
mkdirSync(OUT, { recursive: true });

const ANCHOS = [390, 834, 1440];
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];

const browser = await chromium.launch();
const resumen = [];

for (const ancho of ANCHOS) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  // El SW de la PWA rompe la hidratación si se lo bloquea de otra forma.
  await page.addInitScript(() => { try { delete Navigator.prototype.serviceWorker; } catch {} });

  for (const marca of MARCAS) {
    await page.goto(`${BASE}/catalogo-publico/${marca}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(1500);

    const datos = await page.evaluate(() => {
      const de = document.documentElement;
      const visible = (el) => el.getClientRects().length > 0;
      const arrastre = Math.max(0, de.scrollWidth - de.clientWidth);
      // Cuánto alto ocupa el header: dónde EMPIEZA el buscador de filtros. Es
      // lo que dice si quedó un hueco donde estaba "CATÁLOGO PANAMÁ".
      const buscador = document.querySelector("input[placeholder^='Buscar']");
      const headerAlto = buscador ? Math.round(buscador.getBoundingClientRect().top) : null;

      // Píldoras REALMENTE dibujadas: las dos variantes (desplegable <lg y chips
      // lg+) conviven en el DOM y solo una se ve. Contar el DOM daría el doble.
      const desplegables = [...document.querySelectorAll("button")]
        .filter(visible)
        .map((b) => (b.textContent || "").trim())
        .filter((t) => /^(Género|Categoría|Estado):/.test(t));
      const chips = {};
      for (const span of document.querySelectorAll("span")) {
        const t = (span.textContent || "").trim();
        if ((t !== "Género" && t !== "Categoría") || !visible(span)) continue;
        chips[t] = [...(span.parentElement?.querySelectorAll("button") || [])]
          .filter(visible)
          .map((b) => (b.textContent || "").trim());
      }

      const logos = [...document.querySelectorAll("img")]
        .filter((i) => /tommy|calvin|joybees|reebok/.test(i.currentSrc || i.src))
        .map((i) => ({
          src: (i.currentSrc || i.src).split("/").slice(-1)[0],
          natural: `${i.naturalWidth}x${i.naturalHeight}`,
          css: `${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`,
        }));

      return {
        arrastre,
        headerAlto,
        desplegables,
        chips,
        logos,
        diceCatalogoPanama: /CATÁLOGO PANAMÁ|Catálogo Panamá/i.test(document.body.innerText),
      };
    });

    resumen.push({ ancho, marca, ...datos });
    await page.screenshot({
      path: `${OUT}/${marca}-${ancho}.png`,
      clip: { x: 0, y: 0, width: ancho, height: 300 },
    });
    console.log(
      `${marca} @${ancho}: arrastre ${datos.arrastre}px · header hasta ${datos.headerAlto}px · ` +
      `"Catálogo Panamá" ${datos.diceCatalogoPanama ? "🔴 SIGUE" : "no"} · ` +
      `${datos.desplegables.length ? datos.desplegables.join(" | ") : JSON.stringify(datos.chips)}`,
    );
  }
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/resumen.json`, JSON.stringify(resumen, null, 2));
console.log(`\nCapturas y resumen.json en ${OUT}`);

const malos = resumen.filter(r => r.arrastre > 0 || r.diceCatalogoPanama);
if (ETAPA === "despues" && malos.length) {
  console.error("🔴 HALLAZGOS:", JSON.stringify(malos.map(m => ({ marca: m.marca, ancho: m.ancho, arrastre: m.arrastre, panama: m.diceCatalogoPanama })), null, 2));
  process.exitCode = 1;
}
