// SOLO LECTURA. Mide la tira de pestañas de /ventas ahora que Referencia se fue
// a su propio módulo (12-ago-2026) y comprueba, en el mismo viaje, que el
// enlace viejo `/ventas?tab=referencia` termina en /referencia.
//
//   BASE=http://localhost:3010 node scripts/_medir-ventas-tira-4-pestanas.mjs
//
// Qué mide, en 390 · 834 · 1024 · 1440:
//   · arrastre de la PÁGINA (documentElement) y de la TIRA (el TabsList, que es
//     lo que con 5 pestañas se quedaba corto en celular),
//   · blancos táctiles < 44 px y textos < 12 px de la tira,
//   · que la palabra "Referencia" NO aparezca en /ventas,
//   · que `/ventas?tab=referencia` redirija y que `/ventas?tab=loquesea` caiga
//     en Resumen (nunca en blanco).
//
// 🔴 NO ESCRIBE NADA: solo navega y lee. Gotchas de la casa: sembrar la cookie
// de sesión Y `sessionStorage.cxc_role`, y `delete Navigator.prototype
// .serviceWorker` antes de navegar.

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const COOKIE = readFileSync(process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);

const nav = await chromium.launch();
let malas = 0;

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
  });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/ventas`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="tablist"]', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const tira = document.querySelector('[role="tablist"]');
    const chicos = [];
    const textos = [];
    for (const e of tira.querySelectorAll('[role="tab"]')) {
      const r = e.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) {
        chicos.push({ t: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) });
      }
      const px = parseFloat(getComputedStyle(e).fontSize);
      if (px < 12) textos.push({ t: e.textContent.trim(), px });
    }
    return {
      arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
      arrastreTira: Math.max(0, tira.scrollWidth - tira.clientWidth),
      pestanas: [...tira.querySelectorAll('[role="tab"]')].map((e) => e.textContent.trim()),
      activa: document.querySelector('[role="tab"][data-state="active"]')?.textContent.trim() ?? null,
      chicos,
      textos,
      // Se mira el CONTENIDO (`main`), no el body: el módulo Referencia sigue
      // —y debe seguir— en el menú lateral y en el cajón del header.
      rastroReferencia: (document.querySelector("main")?.textContent ?? "").includes("Referencia"),
      enMenu: (document.body.textContent ?? "").includes("Referencia"),
    };
  });

  // El enlace viejo, en el mismo contexto (misma sesión, mismo navegador).
  await page.goto(`${BASE}/ventas?tab=referencia`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const urlVieja = new URL(page.url()).pathname;
  const hayBuscador = await page.locator('input[aria-label="Buscar referencia"]').count();

  // Y un tab que no existe: cae en Resumen, no en blanco.
  await page.goto(`${BASE}/ventas?tab=loquesea`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="tablist"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const desconocido = await page.evaluate(() => ({
    activa: document.querySelector('[role="tab"][data-state="active"]')?.textContent.trim() ?? null,
    panel: document.querySelector('[role="tabpanel"]') ? "sí" : "no",
  }));

  const mal =
    m.arrastrePagina > 0 ||
    m.arrastreTira > 0 ||
    m.chicos.length ||
    m.textos.length ||
    m.rastroReferencia ||
    m.pestanas.length !== 4 ||
    urlVieja !== "/referencia" ||
    !hayBuscador ||
    desconocido.activa !== "Resumen" ||
    desconocido.panel !== "sí";
  if (mal) malas++;

  console.log(`\n── ${ancho} px ${mal ? "🔴" : "🟢"}`);
  console.log(`   pestañas: ${m.pestanas.join(" · ")} (activa: ${m.activa})`);
  console.log(`   arrastre página ${m.arrastrePagina} · tira ${m.arrastreTira}`);
  console.log(`   táctiles <44: ${m.chicos.length ? JSON.stringify(m.chicos) : 0} · textos <12: ${m.textos.length ? JSON.stringify(m.textos) : 0}`);
  console.log(`   rastro de "Referencia" en el contenido de /ventas: ${m.rastroReferencia ? "🔴 SÍ" : "no"} (en el menú: ${m.enMenu ? "sí, como debe" : "no"})`);
  console.log(`   /ventas?tab=referencia → ${urlVieja} (buscador de referencia: ${hayBuscador ? "sí" : "🔴 no"})`);
  console.log(`   /ventas?tab=loquesea → pestaña ${desconocido.activa}, panel ${desconocido.panel}`);

  await ctx.close();
}

await nav.close();
console.log(malas ? `\n🔴 ${malas} ancho(s) con hallazgos` : "\n🟢 los 4 anchos limpios");
process.exit(malas ? 1 : 0);
