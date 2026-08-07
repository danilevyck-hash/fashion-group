// Medición de ANCHOS de Multifashion › Productos (Por categoría / Por artículo),
// contra el build de producción y en los tres anchos de la casa: 390 · 834 ·
// 1440, más 1024 (que NO es escritorio: es el mismo iPad acostado).
//
// Reporta por ancho:
//   · el ancho ÚTIL (lo que le queda al contenido después de la barra lateral)
//   · todo lo que RECORTA (píxeles inalcanzables) o ARRASTRA
//   · qué layout está vivo (`data-vista` = tarjetas / tabla) — el chequeo falla
//     si encuentra CERO: buscar por la clase del breakpoint (`.lg\:hidden`)
//     devuelve vacío en cuanto el corte se mueve y el script pasa en verde sin
//     haber mirado nada (CLAUDE.md)
//   · los blancos táctiles por debajo de 44 px
//
// GOTCHAS heredados: sembrar la cookie + sessionStorage (si no, todo al login) y
// `delete Navigator.prototype.serviceWorker` antes de navegar.
//
// Solo lectura.
//
//   node scripts/_medir-productos-ranking.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3175";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const recortes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!visible(el)) continue;
    if (el.children.length === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    recortes.push({
      etiqueta: el.tagName.toLowerCase() + "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 60),
      modo: cs.overflowX === "auto" || cs.overflowX === "scroll" ? "ARRASTRA" : "RECORTA",
      sobra: Math.round(sobra),
      visible: el.clientWidth,
      pide: el.scrollWidth,
    });
  }
  recortes.sort((a, b) => b.sobra - a.sobra);

  const vistas = [...document.querySelectorAll("[data-vista]")]
    .filter(visible)
    .map(el => el.getAttribute("data-vista"));

  const chicos = [];
  for (const el of document.querySelectorAll("button, a, select, input, [role=button]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44) chicos.push(Math.round(r.height) + "px " + (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24));
  }

  const filas = document.querySelectorAll("[data-vista=tabla] tbody tr, [data-vista=tarjetas] > *").length;
  const main = document.querySelector("main") ?? document.body;
  const cuerpo = Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { util: main.clientWidth, cuerpo, recortes: recortes.slice(0, 5), vistas, chicos, filas };
})()`;

const VISTAS = [
  { id: "Por categoría", pill: "Por categoría" },
  { id: "Por artículo", pill: "Por artículo" },
];

const navegador = await chromium.launch();
let fallas = 0;

for (const v of VISTAS) {
  console.error(`\n════ Productos › ${v.id} ════`);
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
    try {
      await page.goto(`${BASE}/multifashion?subtab=productos`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(16000);
      await page.getByRole("button", { name: v.pill, exact: true }).first().click();
      await page.waitForTimeout(2500);

      const r = await page.evaluate(SONDA);
      console.error(`  @${ancho}  útil=${r.util}px · cuerpo arrastra ${r.cuerpo}px · vista=[${r.vistas.join(",")}] · ${r.filas} renglones`);
      if (r.vistas.length === 0) { console.error("      ⚠️ NINGÚN data-vista visible — la medición no miró nada"); fallas += 1; }
      if (r.cuerpo > 0) { console.error("      ⚠️ el CUERPO de la página arrastra"); fallas += 1; }
      if (!r.recortes.length) console.error("      ✅ nada recorta ni arrastra");
      for (const x of r.recortes) {
        console.error(`      ${x.modo} ${String(x.sobra).padStart(4)}px  ve ${x.visible} pide ${x.pide}  ${x.etiqueta.slice(0, 52)}`);
        if (x.modo === "RECORTA") fallas += 1;
      }
      if (r.chicos.length) { console.error(`      ⚠️ blancos táctiles < 44px: ${r.chicos.join(" | ")}`); fallas += 1; }
      else console.error("      ✅ 0 blancos táctiles bajo 44 px");
    } catch (e) {
      console.error(`  @${ancho}  ERROR ${String(e.message).slice(0, 120)}`);
      fallas += 1;
    }
    await ctx.close();
  }
}
await navegador.close();
console.error(`\n${fallas === 0 ? "✅ SIN HALLAZGOS" : `⚠️ ${fallas} hallazgo(s)`}`);
process.exit(fallas === 0 ? 0 : 1);
