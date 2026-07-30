// Vuelca la GEOMETRÍA y el HTML de las cards de Reebok y Tommy para comparar
// antes/después de un cambio. Inmune a la carga de fotos (no compara pixeles).
// Uso: node scripts/_verif-cards-reebok-tommy.mjs <archivo-salida.json>
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";

const BASE = "http://localhost:3156";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const salida = process.argv[2] || "/tmp/cards.json";

const DUMP = `(() => {
  const cards = [...document.querySelectorAll('.rounded-xl.relative')].slice(0, 15);
  return cards.map(c => {
    const r = c.getBoundingClientRect();
    const info = c.querySelector('[class*="p-2"]');
    return {
      alto: Math.round(r.height * 10) / 10,
      ancho: Math.round(r.width * 10) / 10,
      texto: (info ? info.innerText : c.innerText).replace(/\\n+/g, ' · '),
      html: info ? info.outerHTML : '',
    };
  });
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
await page.addInitScript(() => {
  delete Navigator.prototype.serviceWorker;
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("cxc_user", "daniel");
  sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
});

const out = {};
for (const marca of ["reebok", "tommy"]) {
  await page.goto(`${BASE}/catalogo/${marca}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rounded-xl.relative", { timeout: 40000 });
  await page.waitForTimeout(2000);
  out[marca] = await page.evaluate(DUMP);
  console.log(`${marca}: ${out[marca].length} cards, altos ${[...new Set(out[marca].map(c => c.alto))].join("/")}px`);
}
writeFileSync(salida, JSON.stringify(out, null, 2));
console.log("→ " + salida);
await browser.close();
