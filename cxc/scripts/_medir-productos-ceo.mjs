// Medición de Multifashion › Productos en los TRES anchos: 390 · 834 · 1440.
//
// Qué mide, con el detalle cerrado y otra vez con "Ver todo" abierto:
//   · ARRASTRE — un contenedor con `overflow-x:auto` que pide más de lo que ve.
//   · RECORTE  — lo mismo con `overflow:hidden`: el dato queda fuera de la
//                pantalla y NO hay forma de alcanzarlo. Es el peor de los dos y
//                es el que ya pasó en este módulo (Clientes, 288 px).
//   · Blancos táctiles por debajo de 44 px.
// Deja capturas en /tmp/productos-ceo-<ancho>.png.
//
// 🔑 El ancho que decide es el ÚTIL, no el de la ventana: la barra lateral se
// lleva 224 px, así que un iPad de 834 deja ~610 — más angosto que un iPhone
// acostado. Por eso se imprime `util` al lado de cada ancho.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar (bloquearlo de otra forma mata la hidratación).
//
// Solo lectura. Requiere el build de producción levantado y la cookie:
//   npx next build && npx next start -p 3193
//   BASE=http://localhost:3193 node scripts/_medir-productos-ceo.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3193";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const URL = "/multifashion?subtab=productos";
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
    if (el.children.length === 0) continue;         // texto truncado, no es esto
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    desbordes.push({
      modo: cs.overflowX === "auto" || cs.overflowX === "scroll" ? "ARRASTRA" : "RECORTA",
      sobra: Math.round(sobra),
      ve: el.clientWidth,
      pide: el.scrollWidth,
      etiqueta: el.tagName.toLowerCase() + "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 60),
    });
  }
  desbordes.sort((a, b) => b.sobra - a.sobra);

  // Blancos táctiles: todo lo que se toca tiene que medir 44 px.
  const chicos = [];
  for (const el of document.querySelectorAll("button, a, select, input, [role=button]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) {
      chicos.push({
        h: Math.round(r.height), w: Math.round(r.width),
        txt: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40),
      });
    }
  }

  const main = document.querySelector("main") ?? document.body;
  return {
    util: main.clientWidth,
    // El body NUNCA debe scrollear de lado: eso es la pantalla entera corrida.
    bodySobra: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
    desbordes: desbordes.slice(0, 6),
    chicos: chicos.slice(0, 8),
  };
})()`;

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
  await page.goto(BASE + URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(16000); // la ventana de 12 meses lee ~40.000 filas

  for (const etapa of ["cerrado", "abierto"]) {
    if (etapa === "abierto") {
      const btn = page.getByRole("button", { name: /Ver todo/ });
      if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(1200); }
    }
    const r = await page.evaluate(SONDA);
    console.error(
      `@${ancho}  útil=${r.util}px  detalle ${etapa}  ·  body ${r.bodySobra}px  ·  ` +
      `${r.desbordes.length} desborde(s)  ·  ${r.chicos.length} blanco(s) <44px`,
    );
    for (const d of r.desbordes) {
      console.error(`     ${d.modo} ${String(d.sobra).padStart(4)}px  ve ${d.ve} pide ${d.pide}  ${d.etiqueta}`);
    }
    for (const c of r.chicos) console.error(`     TÁCTIL ${c.w}×${c.h}  "${c.txt}"`);
    if (etapa === "abierto") {
      await page.screenshot({ path: `/tmp/productos-ceo-${ancho}.png`, fullPage: false });
    }
  }
  await ctx.close();
}
await navegador.close();
