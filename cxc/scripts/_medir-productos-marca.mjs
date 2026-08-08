// Medición de "Multifashion › Productos" CON EL FILTRO DE MARCA, en los TRES
// anchos: 390 · 834 · 1440.
//
// Qué mide, en tres estados (Todas / una marca / una marca con "Ver todo"):
//   · ARRASTRE — contenedor con `overflow-x:auto` que pide más de lo que ve.
//   · RECORTE  — lo mismo con `overflow:hidden`: el dato queda fuera y NO hay
//                forma de alcanzarlo. Es el peor, y ya pasó en este módulo.
//   · Blancos táctiles por debajo de 44 px (las píldoras de este módulo
//     llegaron a medir 26 px — CLAUDE.md).
//   · Peso y tiempo de la respuesta de /api/multifashion/productos.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar.
//
// Solo lectura:
//   npx next build && npx next start -p 3194
//   BASE=http://localhost:3194 node scripts/_medir-productos-marca.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3194";
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
      sobra: Math.round(sobra), ve: el.clientWidth, pide: el.scrollWidth,
      etiqueta: el.tagName.toLowerCase() + "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 60),
    });
  }
  desbordes.sort((a, b) => b.sobra - a.sobra);

  const chicos = [];
  for (const el of document.querySelectorAll("button, a, select, input, [role=button]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) {
      chicos.push({ h: Math.round(r.height), w: Math.round(r.width),
        txt: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) });
    }
  }

  const main = document.querySelector("main") ?? document.body;
  const grupo = document.querySelector('[aria-label="Filtrar por marca"]');
  return {
    util: main.clientWidth,
    bodySobra: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
    desbordes: desbordes.slice(0, 6),
    chicos: chicos.slice(0, 8),
    marcas: grupo ? [...grupo.querySelectorAll("button")].map(b => b.textContent.trim()) : null,
    altoSelector: grupo ? Math.round(grupo.getBoundingClientRect().height) : null,
    titulo: (document.querySelector("h3")?.textContent ?? "").trim(),
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
  let red = null;
  page.on("response", async r => {
    if (!r.url().includes("/api/multifashion/productos")) return;
    const t = r.request().timing();
    const buf = await r.body().catch(() => null);
    red = { ms: Math.round(t.responseEnd - t.requestStart), kb: buf ? Math.round(buf.length / 1024) : null };
  });
  await page.goto(BASE + URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(18000); // la ventana de 12 meses lee ~39.000 filas

  const etapas = [
    ["Todas", async () => {}],
    ["Marca", async () => {
      const b = page.getByRole("button", { name: /Tommy Hilfiger/ });
      if (await b.count()) { await b.first().click(); await page.waitForTimeout(900); }
    }],
    ["Marca + Ver todo", async () => {
      const b = page.getByRole("button", { name: /Ver todo/ });
      if (await b.count()) { await b.first().click(); await page.waitForTimeout(1500); }
    }],
  ];

  for (const [etapa, accion] of etapas) {
    await accion();
    const r = await page.evaluate(SONDA);
    console.error(
      `@${ancho}  útil=${r.util}px  [${etapa}]  ·  body ${r.bodySobra}px  ·  ` +
      `${r.desbordes.length} desborde(s)  ·  ${r.chicos.length} blanco(s) <44px` +
      (r.altoSelector ? `  ·  selector ${r.altoSelector}px` : ""),
    );
    if (etapa === "Todas") {
      console.error(`     título: ${r.titulo}`);
      if (r.marcas) for (const m of r.marcas) console.error(`     marca: ${m}`);
      if (red) console.error(`     respuesta API: ${red.kb} KB · ${red.ms} ms`);
    } else if (etapa === "Marca") {
      console.error(`     título: ${r.titulo}`);
    }
    for (const d of r.desbordes) {
      console.error(`     ${d.modo} ${String(d.sobra).padStart(4)}px  ve ${d.ve} pide ${d.pide}  ${d.etiqueta}`);
    }
    for (const c of r.chicos) console.error(`     TÁCTIL ${c.w}×${c.h}  "${c.txt}"`);
  }
  await page.screenshot({ path: `/tmp/productos-marca-${ancho}.png`, fullPage: false });
  await ctx.close();
}
await navegador.close();
