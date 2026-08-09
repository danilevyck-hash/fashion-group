// SOLO LECTURA. Los 3 anchos del acordeón de /guias con el chip que dice el nombre.
//
// Mide, en 390 / 834 / 1440, sobre la guía REAL GT-189 (Completada, 4 líneas,
// varias ya atadas):
//   · arrastre horizontal de la PÁGINA (nunca debe haber),
//   · lo que queda RECORTADO fuera de un scroller (peor que arrastrar: no se alcanza),
//   · el arrastre DENTRO del ScrollableTable de los ítems, que es el que puede
//     crecer al meterle el nombre al chip → por eso se compara contra main,
//   · blancos táctiles < 44 px,
//   · y que el aviso de la cabecera aparezca UNA sola vez.
//
// No guarda nada: solo abre, expande y lee.
//
//   ETAPA=despues BASE=http://localhost:3000 node scripts/_medir-guias-chip-anchos.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ETAPA = process.env.ETAPA ?? "despues";
const GUIA = process.env.GUIA ?? "GT-189";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];

mkdirSync(`/tmp/guias-chip`, { recursive: true });
const nav = await chromium.launch();

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_is_owner", "1"); });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await page.evaluate((g) => {
    const n = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && new RegExp(g).test(e.textContent || ""));
    let el = n[0];
    while (el && getComputedStyle(el).cursor !== "pointer") el = el.parentElement;
    (el || n[0])?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, GUIA);
  await page.waitForTimeout(6000);

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const arrastrePagina = Math.max(0, de.scrollWidth - de.clientWidth);

    // ¿Algo recortado por un ancestro con overflow hidden y sin scroller?
    const recortes = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === "hidden" && el.scrollWidth > el.clientWidth + 1) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        recortes.push({
          px: el.scrollWidth - el.clientWidth,
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 44),
          txt: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 34),
        });
      }
    }
    recortes.sort((a, b) => b.px - a.px);
    const recortado = recortes.length ? recortes[0].px : 0;

    // El scroller de la tabla de ítems (ScrollableTable, minWidth 600).
    let scrollerItems = 0;
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.querySelector("table") && el.scrollWidth > el.clientWidth + 1) {
        scrollerItems = Math.max(scrollerItems, el.scrollWidth - el.clientWidth);
      }
    }

    // Blancos táctiles: todo lo tocable visible.
    const chicos = [];
    for (const el of document.querySelectorAll("button, a[href], input, select, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom < 0 || r.top > innerHeight) continue; // fuera de la pantalla
      if (r.height < 44) {
        chicos.push({
          t: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30) || "(sin texto)",
          cls: (el.className || "").toString().slice(0, 50),
          h: Math.round(r.height),
        });
      }
    }

    // Los chips de cliente: cuánto miden y qué dicen.
    const chips = [...document.querySelectorAll("td span")]
      .filter((s) => /^\s*[A-Za-zÀ-ÿ0-9].*D-\d+\s*$/.test(s.textContent || "") && s.querySelector("span"))
      .map((s) => {
        const r = s.getBoundingClientRect();
        return { txt: (s.textContent || "").replace(/\s+/g, " ").trim().slice(0, 46), w: Math.round(r.width), h: Math.round(r.height) };
      });

    // ⚠️ AccordionContent deja el contenido de TODAS las guías en el DOM (anima
    // con grid 0fr), así que contar sobre document.body da 12. Solo cuenta lo
    // que de verdad ocupa lugar en pantalla.
    // Un ancestro con altura 0 (el AccordionContent cerrado) esconde al hijo
    // aunque el hijo mida. Hay que subir por la cadena.
    const visible = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const r = n.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) return false;
      }
      return true;
    };
    const avisos = [...document.querySelectorAll("p")]
      .filter((el) => /Solo se puede cambiar el cliente/.test(el.textContent || "") && visible(el)).length;
    return { arrastrePagina, recortado, recortes, scrollerItems, chicos, chips, avisos };
  });

  console.log(`\n═══ ${ETAPA} · ${ancho} px ═══`);
  console.log(`   arrastre de la PÁGINA : ${m.arrastrePagina} px  ${m.arrastrePagina === 0 ? "✅" : "🔴"}`);
  console.log(`   RECORTADO (inalcanzable): ${m.recortado} px  ${m.recortado === 0 ? "✅" : "🔴"}`);
  for (const r of m.recortes.slice(0, 4)) console.log(`        ${String(r.px).padStart(4)} px  <${r.tag} class="${r.cls}">  "${r.txt}"`);
  console.log(`   scroller de la tabla   : ${m.scrollerItems} px  (comparar contra main)`);
  console.log(`   blancos < 44 px        : ${m.chicos.length}  ${m.chicos.length === 0 ? "✅" : "🔴 " + JSON.stringify(m.chicos)}`);
  console.log(`   aviso de cabecera      : ${m.avisos} vez/veces  ${m.avisos === 1 ? "✅" : "⚠️"}`);
  console.log(`   chips (${m.chips.length}):`);
  for (const c of m.chips) console.log(`      ${String(c.w).padStart(4)}×${String(c.h).padStart(3)}  "${c.txt}"`);

  await page.screenshot({ path: `/tmp/guias-chip/${ETAPA}-${ancho}.png`, fullPage: false });
  await ctx.close();
}
await nav.close();
