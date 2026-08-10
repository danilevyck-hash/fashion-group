// SOLO LECTURA. Los 3 anchos del tab Ventas › Referencia con el estado nuevo.
//
// Mide en 390 / 834 / 1440, sobre DOS referencias REALES:
//   · NB2075902      → última venta may-2024 → DESCONTINUADO, sin sugerencia
//   · 31KAE22003001  → última venta may-2026 → SE AGOTÓ, con su sugerencia
//
// Chequea: arrastre horizontal de la PÁGINA, lo RECORTADO fuera de un scroller,
// el arrastre DENTRO del scroller de la tabla por color (que es donde puede
// crecer la píldora de estado), blancos táctiles < 44 px y textos < 12 px.
// Además lee el aviso que se pintó y si aparece la palabra "unidades".
//
//   BASE=http://localhost:3000 node scripts/_medir-referencia-descontinuado.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];
const CODIGOS = (process.env.CODIGOS ?? "NB2075902,31KAE22003001").split(",");

const nav = await chromium.launch();
let malas = 0;

for (const codigo of CODIGOS) {
  for (const ancho of ANCHOS) {
    const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_is_owner", "1"); });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/ventas?tab=referencia`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    await page.fill('input[placeholder*="Código"]', codigo);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(7000);

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const arrastrePagina = Math.max(0, de.scrollWidth - de.clientWidth);

      const recortes = [];
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.overflowX === "hidden" && el.scrollWidth > el.clientWidth + 1) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          recortes.push({ px: el.scrollWidth - el.clientWidth, cls: (el.className || "").toString().slice(0, 44) });
        }
      }
      recortes.sort((a, b) => b.px - a.px);

      let scrollerTabla = 0;
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.querySelector("table") && el.scrollWidth > el.clientWidth + 1) {
          scrollerTabla = Math.max(scrollerTabla, el.scrollWidth - el.clientWidth);
        }
      }

      const chicos = [];
      for (const el of document.querySelectorAll("button, a[href], input, select, [role=button], textarea")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom < 0 || r.top > innerHeight) continue;
        if (r.height < 44) chicos.push({ t: (el.textContent || "").trim().slice(0, 26) || "(sin texto)", h: Math.round(r.height) });
      }

      const chicaLetra = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length) continue;
        const t = (el.textContent || "").trim();
        if (!t) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 12) chicaLetra.push({ t: t.slice(0, 26), px });
      }

      const texto = (document.body.textContent || "").replace(/\s+/g, " ");
      const aviso = (texto.match(/(Se agotó|Descontinuado)[^.]*\./g) || []).join(" | ").slice(0, 260);
      const pills = [...document.querySelectorAll("td span")]
        .filter((s) => /^(ACTIVO|NUNCA VENDIDO|SE AGOTÓ|DESCONTINUADO)/.test((s.textContent || "").trim()))
        .map((s) => (s.textContent || "").trim());
      return { arrastrePagina, recortes, scrollerTabla, chicos, chicaLetra, aviso, pills, sugiere: /unidades\./.test(texto) };
    });

    const ok = m.arrastrePagina === 0 && m.recortes.length === 0 && m.chicos.length === 0 && m.chicaLetra.length === 0;
    if (!ok) malas += 1;
    console.log(`\n═══ ${codigo} · ${ancho} px ═══`);
    console.log(`   arrastre de la PÁGINA   : ${m.arrastrePagina} px  ${m.arrastrePagina === 0 ? "✅" : "🔴"}`);
    console.log(`   RECORTADO (inalcanzable): ${m.recortes.length ? m.recortes[0].px : 0} px  ${m.recortes.length === 0 ? "✅" : "🔴 " + JSON.stringify(m.recortes.slice(0, 3))}`);
    console.log(`   scroller de la tabla    : ${m.scrollerTabla} px  (se arrastra adentro, es el patrón)`);
    console.log(`   blancos < 44 px         : ${m.chicos.length}  ${m.chicos.length === 0 ? "✅" : "🔴 " + JSON.stringify(m.chicos)}`);
    console.log(`   textos < 12 px          : ${m.chicaLetra.length}  ${m.chicaLetra.length === 0 ? "✅" : "🔴 " + JSON.stringify(m.chicaLetra.slice(0, 5))}`);
    console.log(`   píldoras de estado      : ${JSON.stringify(m.pills)}`);
    console.log(`   ¿sugiere comprar?       : ${m.sugiere ? "SÍ" : "no"}`);
    console.log(`   aviso                   : ${m.aviso || "(ninguno)"}`);

    await ctx.close();
  }
}
await nav.close();
console.log(`\n${malas === 0 ? "🟢 los 3 anchos limpios en los dos casos" : `🔴 ${malas} combinaciones con hallazgos`}`);
