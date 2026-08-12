// Mide el tab Ventas › Referencia (compras reales) en los 3 anchos, contra el
// build de PRODUCCIÓN y con datos de PRODUCCIÓN. SOLO LECTURA.
//
//   npx next build && npx next start -p 3114
//   BASE=http://localhost:3114 node scripts/_medir-referencia-compras.mjs
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar (bloquearlo de otra forma mata la hidratación).
//
// 🔑 El ancho que decide NO es el de la ventana: la barra lateral se lleva
// 224 px, así que un iPad de 834 deja ~610 útiles — más angosto que un iPhone
// acostado. Por eso se mide también 1024, donde quedan 766 útiles.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3114";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];
const OUT = process.env.OUT ?? "/tmp/ref-compras";

/** Los casos que pide el entregable. */
const CASOS = [
  { nombre: "verificado", q: "40HM265032" },
  { nombre: "tanda-viva", q: "WW0WW505930A8" },
  { nombre: "sin-compra", q: "RETENCION" },
  { nombre: "multi-compra", q: "D1617001" },
  { nombre: "varios-pegados", q: "40HM265032 D1617001 WW0WW505930A8" },
];

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
    if (el.children.length === 0) continue;         // texto con puntos suspensivos, no es esto
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    desbordes.push({
      modo: cs.overflowX === "auto" || cs.overflowX === "scroll" ? "ARRASTRA" : "RECORTA",
      sobra: Math.round(sobra), ve: el.clientWidth, pide: el.scrollWidth,
      etiqueta: el.tagName.toLowerCase() + "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 70),
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

  const chicasLetras = [];
  for (const el of document.querySelectorAll("td, th, p, span, dt, dd, h3, h4")) {
    if (!visible(el)) continue;
    if (el.children.length) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 12) chicasLetras.push({ px, txt: (el.textContent || "").trim().slice(0, 30) });
  }

  const main = document.querySelector("main") ?? document.body;
  const tabla = document.querySelector('[data-vista="tabla"]');
  const tarjetas = document.querySelector('[data-vista="tarjetas"]');
  const filas = [...document.querySelectorAll('[data-vista="tabla"] tbody tr')]
    .map(tr => [...tr.querySelectorAll("td")].map(td => td.textContent.trim()))
    .filter(c => c.length > 1);
  const textoPantalla = (main.textContent || "");

  return {
    util: main.clientWidth,
    bodySobra: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
    desbordes: desbordes.slice(0, 6),
    chicos: chicos.slice(0, 8),
    chicasLetras: chicasLetras.slice(0, 6),
    vista: visible(tabla ?? document.createElement("i")) ? "tabla"
         : visible(tarjetas ?? document.createElement("i")) ? "tarjetas" : "—",
    filas,
    // Candado de textos: nada de lo que Daniel rechazó puede reaparecer.
    prohibidos: ["Se te acaba", "compra ~", "Varias · pegar lista", "SE AGOTÓ", "DESCONTINUADO", "sugerencia"]
      .filter(t => textoPantalla.includes(t)),
  };
})()`;

mkdirSync(OUT, { recursive: true });
const navegador = await chromium.launch();
const resumen = [];

for (const caso of CASOS) {
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
    await page.goto(`${BASE}/referencia`, { waitUntil: "networkidle" });
    await page.fill('input[aria-label="Buscar referencia"]', caso.q);
    await page.click('button[type="submit"]');
    await page.waitForResponse((r) => r.url().includes("/api/ventas/referencia?"), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(900);

    const m = await page.evaluate(SONDA);
    await page.screenshot({ path: `${OUT}/${caso.nombre}-${ancho}.png`, fullPage: true });
    resumen.push({ caso: caso.nombre, ancho, ...m });

    const arrastra = m.desbordes.filter(d => d.modo === "ARRASTRA");
    const recorta = m.desbordes.filter(d => d.modo === "RECORTA");
    console.log(
      `${caso.nombre.padEnd(16)} ${String(ancho).padStart(5)} · útil ${String(m.util).padStart(5)} · body ${String(m.bodySobra).padStart(3)} · vista ${m.vista.padEnd(9)} · arrastra ${arrastra.length} recorta ${recorta.length} · <44px ${m.chicos.length} · <12px ${m.chicasLetras.length}${m.prohibidos.length ? ` · 🔴 PROHIBIDO: ${m.prohibidos}` : ""}`,
    );
    for (const d of recorta) console.log(`      RECORTA ${d.sobra}px  ${d.etiqueta}`);
    for (const d of arrastra) console.log(`      arrastra ${d.sobra}px  ${d.etiqueta}`);
    for (const c of m.chicos) console.log(`      <44px  ${c.h}x${c.w}  "${c.txt}"`);
    for (const c of m.chicasLetras) console.log(`      <12px  ${c.px}px  "${c.txt}"`);
    if (caso.nombre === "verificado" && m.filas.length) {
      for (const f of m.filas) console.log(`      FILA: ${JSON.stringify(f)}`);
    }
    await ctx.close();
  }
}

await navegador.close();
console.log(`\ncapturas en ${OUT}`);
const malos = resumen.filter(r => r.bodySobra > 0 || r.desbordes.some(d => d.modo === "RECORTA") || r.chicos.length || r.chicasLetras.length || r.prohibidos.length);
console.log(malos.length ? `🔴 ${malos.length} estados con hallazgos` : "🟢 0 arrastre de página · 0 recortados · 0 blancos <44px · 0 textos <12px · 0 textos prohibidos");
