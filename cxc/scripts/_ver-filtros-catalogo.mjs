// Capturas del arreglo de filtros del catálogo: 390 (iPhone) con el
// desplegable ABIERTO, 834 (iPad) y 1440 (escritorio) sin tocar nada.
// Solo lectura. Complementa a `_medir-filtros-catalogo.mjs`, que da los números.
//
//   node scripts/_ver-filtros-catalogo.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3166";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const MARCAS = ["reebok", "joybees", "tommy"];
// 1024 es el BORDE: el primer ancho donde vuelven las píldoras al cortar en
// `lg`. Se captura para poder mirar con los ojos lo que dice el número.
const TAMANOS = [
  { nombre: "390-iphone", width: 390, height: 844, abrir: true },
  { nombre: "834-ipad", width: 834, height: 1194, abrir: true },
  { nombre: "1024-ipad-horizontal", width: 1024, height: 768, abrir: false },
  { nombre: "1180-ipad-pro", width: 1180, height: 820, abrir: false },
  { nombre: "1440-escritorio", width: 1440, height: 900, abrir: false },
];

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();

for (const vista of ["interno", "publico"]) {
  for (const marca of MARCAS) {
    for (const t of TAMANOS) {
      const ctx = await navegador.newContext({
        viewport: { width: t.width, height: t.height },
        deviceScaleFactor: 1,
      });
      if (vista === "interno") {
        await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
      }
      await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
      await ctx.addInitScript(() => {
        sessionStorage.setItem("cxc_role", "admin");
        sessionStorage.setItem("cxc_user", "daniel");
        sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
      });
      const page = await ctx.newPage();
      const url = vista === "interno" ? `/catalogo/${marca}` : `/catalogo-publico/${marca}`;
      try {
        await page.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 90000 });
        await page.waitForSelector('input[placeholder*="uscar"]:visible', { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(3000);
        let sufijo = "";
        if (t.abrir) {
          const b = page.locator('button[aria-haspopup="listbox"]:visible').first();
          if (await b.count()) {
            await b.click({ timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(500);
            sufijo = "-desplegable-abierto";
          }
        }
        await page.screenshot({
          path: path.join(SALIDA, `filtros-${marca}-${vista}-${t.nombre}${sufijo}.png`),
        });
        console.error(`${marca}/${vista} @${t.nombre}${sufijo} ✓`);
      } catch (err) {
        console.error(`${marca}/${vista} @${t.nombre} ✗ ${String(err.message).slice(0, 90)}`);
      }
      await ctx.close();
    }
  }
}

await navegador.close();
console.error(`\nCapturas en ${SALIDA}`);
