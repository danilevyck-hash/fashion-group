// SOLO LECTURA: abre /ventas?tab=referencia contra el build de producción y
// lee TAL CUAL las tarjetas de los casos que Daniel señaló — los 4 KPIs
// (Compré · Vendí · Stock · Meses), la línea del ritmo/90% y la fila de plata.
//
//   BASE=http://localhost:3134 node scripts/_verif-tarjetas-daniel.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const CASOS = (process.env.CASOS ?? "4D5077G001 CVM253CR02001 4D5029G").split(" ");
const SALIDA = "/tmp/referencia-tarjetas";
mkdirSync(SALIDA, { recursive: true });

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  delete Navigator.prototype.serviceWorker;
});
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_is_owner", "1");
});
const page = await ctx.newPage();
await page.goto(`${BASE}/ventas?tab=referencia`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

for (const caso of CASOS) {
  const input = page.locator('input[aria-label="Buscar referencia"]').first();
  await input.waitFor({ timeout: 20000 });
  await input.fill(caso);
  await page.locator('button:has-text("Buscar")').first().click();
  await page.waitForSelector("section.rounded-xl h4", { timeout: 20000 });
  await page.waitForTimeout(1200);

  const lectura = await page.evaluate(() => {
    const tarjeta = document.querySelector("section.rounded-xl.border");
    if (!tarjeta) return null;
    const kpis = [...tarjeta.querySelectorAll("dl > div")].map((d) => ({
      rotulo: d.querySelector("dt")?.textContent?.trim(),
      valor: d.querySelector("dd")?.textContent?.trim(),
      pie: d.querySelector("dd + div")?.textContent?.trim()?.slice(0, 90),
    }));
    const lineas = [...tarjeta.querySelectorAll(":scope > p, :scope > div")]
      .map((e) => e.textContent?.trim().replace(/\s+/g, " ") ?? "")
      .filter((t) => t && !t.startsWith("Compré"));
    return { titulo: tarjeta.querySelector("h4")?.textContent, kpis, lineas: lineas.slice(0, 6) };
  });
  console.log(`\n══════ ${caso} ══════`);
  console.log(JSON.stringify(lectura, null, 2));
  const tarjeta = page.locator("section.rounded-xl.border").first();
  await tarjeta.screenshot({ path: `${SALIDA}/${caso}.png` });
}

await nav.close();
console.log(`\ncapturas en ${SALIDA}/`);
