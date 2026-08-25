// Los 4 anchos de la pantalla de empresas de Reclamos (390 · 834 · 1024 · 1440).
//
// Lo tocado en esta pantalla es el TEXTO del toast ("… — 3 reclamos pendientes")
// y los `title` de los dos botones; nada de layout. Igual se mide: el toast es
// una línea nueva que no existía así de larga, y el ancho del medio es el que
// nadie mira.
//
// Solo lectura: no guarda, no borra, no envía. El clic en ↓Excel dispara una
// descarga (GET/POST de generación de archivo) — se INTERCEPTA la petición y se
// aborta, así que no se genera nada en el servidor.
//
//   BASE=http://localhost:3167 node scripts/_medir-reclamos-anchos.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3167";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const SONDA = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width<=0||r.height<=0) return false;
    const cs = getComputedStyle(el); return cs.visibility!=="hidden" && cs.display!=="none" && Number(cs.opacity)>0.05; };
  const desbordes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra > 1 && visible(el)) desbordes.push({ et: el.tagName.toLowerCase()+"."+String(el.className||"").slice(0,60), px: Math.round(sobra) });
  }
  desbordes.sort((a,b)=>b.px-a.px);
  const cortes = [];
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length > 0) continue;
    const sobra = el.scrollWidth - el.clientWidth; if (sobra <= 1) continue;
    const cs = getComputedStyle(el); if (cs.overflowX!=="hidden" && cs.overflowX!=="clip") continue;
    if (!visible(el)) continue;
    const txt = (el.textContent??"").trim(); if (!txt) continue;
    cortes.push({ txt: txt.slice(0,50), px: Math.round(sobra) });
  }
  const chicos = [];
  for (const el of document.querySelectorAll("button, a[href], [role=button], input, select, textarea")) {
    if (!visible(el)) continue; const r = el.getBoundingClientRect();
    if (r.height>=44 && r.width>=44) continue;
    chicos.push({ et:(el.getAttribute("aria-label")||el.textContent||el.tagName).replace(/\\s+/g," ").trim().slice(0,30), w:Math.round(r.width), h:Math.round(r.height) });
  }
  const chiquitos = [];
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length>0 || !visible(el)) continue;
    const t=(el.textContent??"").trim(); if(!t) continue;
    const fs=parseFloat(getComputedStyle(el).fontSize); if (fs<12) chiquitos.push({t:t.slice(0,30),fs});
  }
  return { cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    peorPx: desbordes[0]?.px ?? 0, ejemplos: desbordes.slice(0,4),
    textosCortados: cortes.length, ejemplosCorte: cortes.slice(0,4),
    targetsChicos: chicos.length, ejemplosTarget: chicos.slice(0,4),
    textosChicos: chiquitos.length,
    tarjetas: document.querySelectorAll("div.rounded-lg.p-6").length };
})()`;

const nav = await chromium.launch();
for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, hasTouch: ancho < 1200, isMobile: false });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_is_owner", "1"); });
  const page = await ctx.newPage();
  // Nada de generación de archivos EN EL SERVIDOR: la petición se responde acá
  // con un archivo de mentira, así el aviso que se mide es el BUENO (el largo,
  // el que dice cuántos pendientes bajó) y no el de error.
  const falso = { status: 200, contentType: "application/octet-stream", body: "x" };
  await page.route("**/export-zip", (r) => r.fulfill(falso));
  await page.route("**/export-pdf", (r) => r.fulfill(falso));
  await page.goto(`${BASE}/reclamos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  const reposo = await page.evaluate(SONDA);
  // Con el toast puesto (el texto nuevo más largo de la pantalla).
  let conToast = null;
  const btn = page.locator("button", { hasText: "↓ Excel" }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    conToast = await page.evaluate(SONDA);
    conToast.aviso = await page.evaluate(() => {
      const t = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /descargado|pendientes/i.test(e.textContent || ""));
      return t.length ? t[t.length - 1].textContent.trim() : null;
    });
  }
  console.log(JSON.stringify({ ancho, reposo, conToast }, null, 1));
  await ctx.close();
}
await nav.close();
