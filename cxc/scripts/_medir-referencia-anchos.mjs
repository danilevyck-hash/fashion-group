// Medición de Ventas › Referencia en los TRES anchos: 390 · 834 · 1440.
// SOLO LECTURA (la pantalla solo consulta switch_articulo_diario).
//
// Estados medidos por ancho:
//   1. tarjeta de una referencia (31KAE22003 buscado, con aviso de agotado,
//      gráfico y tabla por color)
//   2. vista múltiple (5 códigos pegados, tabla + botón Excel)
// Reporta: arrastre del body, desbordes (ARRASTRA/RECORTA), blancos táctiles
// <44 px y textos <12 px. Deja capturas en /tmp/referencia-<estado>-<ancho>.png.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// y `delete Navigator.prototype.serviceWorker` antes de navegar.
//
//   npx next build && npx next start -p 3197
//   BASE=http://localhost:3197 node scripts/_medir-referencia-anchos.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3197";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const desbordes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!visible(el)) continue;
    if (el.children.length === 0) continue; // texto truncado, no es esto
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    desbordes.push({
      modo: cs.overflowX === "auto" || cs.overflowX === "scroll" ? "ARRASTRA" : "RECORTA",
      sobra: Math.round(sobra), ve: el.clientWidth, pide: el.scrollWidth,
      etiqueta: el.tagName.toLowerCase() + "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 60),
    });
  }
  desbordes.sort((a, b) => b.sobra - a.sobra);

  const chicos = [];
  for (const el of document.querySelectorAll("button, a, select, input, textarea, [role=button]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) {
      chicos.push({ h: Math.round(r.height), w: Math.round(r.width),
        txt: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) });
    }
  }

  // Textos por debajo de 12 px (regla de la casa).
  const chiquitos = new Set();
  for (const el of document.querySelectorAll("main *")) {
    if (!visible(el)) continue;
    if (!el.childNodes.length) continue;
    const tieneTexto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!tieneTexto) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) chiquitos.add(fs + "px · " + el.textContent.trim().slice(0, 30));
  }

  const main = document.querySelector("main") ?? document.body;
  return {
    util: main.clientWidth,
    bodySobra: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
    desbordes: desbordes.slice(0, 6),
    chicos: chicos.slice(0, 10),
    chiquitos: [...chiquitos].slice(0, 6),
  };
})()`;

const reportar = (etapa, ancho, r) => {
  console.error(
    `@${ancho}  útil=${r.util}px  ${etapa}  ·  body ${r.bodySobra}px  ·  ` +
      `${r.desbordes.length} desborde(s)  ·  ${r.chicos.length} táctil(es) <44  ·  ${r.chiquitos.length} texto(s) <12px`,
  );
  for (const d of r.desbordes)
    console.error(`     ${d.modo} ${String(d.sobra).padStart(4)}px  ve ${d.ve} pide ${d.pide}  ${d.etiqueta}`);
  for (const c of r.chicos) console.error(`     TÁCTIL ${c.w}×${c.h}  "${c.txt}"`);
  for (const t of r.chiquitos) console.error(`     TEXTO ${t}`);
};

const navegador = await chromium.launch();
for (const ancho of ANCHOS) {
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844 },
    deviceScaleFactor: 1,
    hasTouch: ancho < 1200,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/ventas?tab=referencia", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  // Estado 1 — una referencia con historia real (agotado + colores)
  // ⚠️ Los "Buscar" se buscan DENTRO del form del tab: el AppHeader tiene su
  // propio botón "Buscar" (el buscador global) antes en el DOM.
  await page.locator('form input[placeholder*="Código"]').fill(process.env.Q ?? "31KAE22003");
  await page.locator("form").getByRole("button", { name: "Buscar" }).first().click();
  await page.waitForTimeout(5000);
  reportar("una-ref", ancho, await page.evaluate(SONDA));
  await page.screenshot({ path: `/tmp/referencia-una-${ancho}.png`, fullPage: true });

  // Estado 2 — vista múltiple
  await page.getByRole("button", { name: "Varias · pegar lista" }).click();
  await page.locator("textarea").fill("31KAE22003001 31KAE22001001 31KAE22001201 KACKS26-0046");
  await page.getByRole("button", { name: "Buscar" }).last().click();
  await page.waitForTimeout(5000);
  reportar("multiple", ancho, await page.evaluate(SONDA));
  await page.screenshot({ path: `/tmp/referencia-multi-${ancho}.png`, fullPage: true });

  await ctx.close();
}
await navegador.close();
