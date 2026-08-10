// Los 3 anchos del tab Referencia CON las columnas de costos (CIF / FOB est. /
// margen). switch_articulo_info aún no existe en producción, así que la
// respuesta del API se INTERCEPTA y se le inyecta `info` a cada referencia —
// la página y el build son los reales; solo el dato de catálogo es simulado.
// SOLO LECTURA.  BASE=http://localhost:3197 node scripts/_medir-referencia-costos-anchos.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3197";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];

const SONDA = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width<=0||r.height<=0) return false;
    const cs = getComputedStyle(el); return cs.visibility!=="hidden"&&cs.display!=="none"&&Number(cs.opacity)>0.05; };
  const desbordes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1 || !visible(el) || el.children.length === 0) continue;
    const cs = getComputedStyle(el); if (cs.overflowX === "visible") continue;
    desbordes.push({ modo: cs.overflowX==="auto"||cs.overflowX==="scroll" ? "ARRASTRA":"RECORTA", sobra: Math.round(sobra),
      etiqueta: el.tagName.toLowerCase()+"."+String(el.className).trim().replace(/\\s+/g,".").slice(0,50) });
  }
  desbordes.sort((a,b)=>b.sobra-a.sobra);
  const chicos = [];
  for (const el of document.querySelectorAll("button, a, select, input, textarea, [role=button]")) {
    if (!visible(el)) continue; const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) chicos.push({ h: Math.round(r.height), w: Math.round(r.width),
      txt: (el.getAttribute("aria-label")||el.textContent||el.tagName).trim().slice(0,30) });
  }
  const chiquitos = new Set();
  for (const el of document.querySelectorAll("main *")) {
    if (!visible(el) || !el.childNodes.length) continue;
    if (![...el.childNodes].some((n)=>n.nodeType===3&&n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) chiquitos.add(fs+"px · "+el.textContent.trim().slice(0,25));
  }
  return { bodySobra: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
    desbordes: desbordes.slice(0,4), chicos: chicos.slice(0,6), chiquitos: [...chiquitos].slice(0,4),
    diceCif: document.body.innerText.includes("Costo CIF"), diceFobEst: document.body.innerText.includes("FOB est.") };
})()`;

const navegador = await chromium.launch();
for (const ancho of ANCHOS) {
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844 },
    deviceScaleFactor: 1, hasTouch: ancho < 1200,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role","admin"); sessionStorage.setItem("fg_is_owner","1"); });
  const page = await ctx.newPage();

  // Inyectar info de catálogo (CIF real medido: 16.94 / precio 23.00).
  await page.route("**/api/ventas/referencia?*", async (route) => {
    const resp = await route.fetch();
    const json = await resp.json();
    if (json.referencias) {
      json.infoDisponible = true;
      for (const r of json.referencias) {
        r.info = { descripcion: "KAHLO PASSCASE", existencia: 12, precioEtiqueta: 23,
          costoCif: 16.94, syncedAt: "2026-08-09T20:10:00.000Z" };
      }
    }
    await route.fulfill({ response: resp, json });
  });

  await page.goto(BASE + "/ventas?tab=referencia", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.locator('form input[placeholder*="Código"]').fill("31KAE22003");
  await page.locator("form").getByRole("button", { name: "Buscar" }).first().click();
  await page.waitForTimeout(5000);
  let r = await page.evaluate(SONDA);
  console.error(`@${ancho} una-ref · body ${r.bodySobra}px · ${r.desbordes.length} desborde(s) · ${r.chicos.length} táctil<44 · ${r.chiquitos.length} texto<12 · CIF:${r.diceCif} FOBest:${r.diceFobEst}`);
  for (const d of r.desbordes) console.error(`     ${d.modo} ${d.sobra}px ${d.etiqueta}`);
  for (const c of r.chicos) console.error(`     TÁCTIL ${c.w}×${c.h} "${c.txt}"`);
  for (const t of r.chiquitos) console.error(`     TEXTO ${t}`);
  await page.screenshot({ path: `/tmp/referencia-costos-una-${ancho}.png`, fullPage: true });

  await page.getByRole("button", { name: "Varias · pegar lista" }).click();
  await page.locator("textarea").fill("31KAE22003001 31KAE22001001 KACKS26-0046");
  await page.locator("form").getByRole("button", { name: "Buscar" }).last().click();
  await page.waitForTimeout(5000);
  r = await page.evaluate(SONDA);
  console.error(`@${ancho} multiple · body ${r.bodySobra}px · ${r.desbordes.length} desborde(s) · ${r.chicos.length} táctil<44 · ${r.chiquitos.length} texto<12 · CIF:${r.diceCif} FOBest:${r.diceFobEst}`);
  for (const d of r.desbordes) console.error(`     ${d.modo} ${d.sobra}px ${d.etiqueta}`);
  await page.screenshot({ path: `/tmp/referencia-costos-multi-${ancho}.png`, fullPage: true });
  await ctx.close();
}
await navegador.close();
