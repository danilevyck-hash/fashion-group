// SOLO LECTURA de la pantalla. Abre /guias, expande una guía, abre la ventana
// de "Atar cliente" de una línea SIN atar y mide los 3 anchos: cuánto arrastra
// la página, cuánto se recorta y si algún blanco táctil baja de 44 px.
//
// 🔴 NO GUARDA NADA. No toca el botón Guardar ni Quitar.
//
//   BASE=http://localhost:3000 node scripts/_medir-guias-sugerencias-anchos.mjs
//
// Gotchas de medición de la casa: sembrar `sessionStorage.cxc_role` (si no,
// `useAuth` redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar (bloquearlo de otra forma mata la hidratación).

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ETIQUETA = process.env.ETIQUETA ?? "rama";
const SALIDA = `/tmp/guias-sug-${ETIQUETA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];
/** Texto a buscar antes de expandir, para elegir QUÉ línea se mide. */
const TEXTO = process.env.TEXTO ?? "";

mkdirSync(SALIDA, { recursive: true });
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

  console.log(`  url tras cargar: ${page.url()}`);
  if (TEXTO) {
    await page.locator('input[placeholder*="Buscar"]').first().fill(TEXTO);
    await page.waitForTimeout(1500);
  }
  // Buscar la primera guía que tenga alguna línea SIN atar. Se abre una, se
  // mira, y si no hay "Atar cliente" se cierra y se prueba la siguiente.
  let abrio = false;
  const cuantas = await page.evaluate(
    () => [...document.querySelectorAll("button")].filter((b) => /GT-\d+/.test(b.textContent || "")).length,
  );
  for (let i = 0; i < Math.min(cuantas, 12) && !abrio; i++) {
    await page.evaluate((idx) => {
      const btns = [...document.querySelectorAll("button")].filter((b) => /GT-\d+/.test(b.textContent || ""));
      btns[idx]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, i);
    await page.waitForTimeout(3500);
    abrio = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^Atar cliente$/.test((x.textContent || "").trim()));
      if (!b) return false;
      b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    });
    if (!abrio) {
      await page.evaluate((idx) => {
        const btns = [...document.querySelectorAll("button")].filter((b) => /GT-\d+/.test(b.textContent || ""));
        btns[idx]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }, i);
      await page.waitForTimeout(600);
    }
  }
  await page.waitForTimeout(4000);

  const m = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Atar cliente"]');
    if (!d) return { ventana: false };
    const de = document.documentElement;
    const chicos = [...d.querySelectorAll("button, input, a")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44); })
      .map((e) => ({ t: (e.textContent || e.tagName).trim().slice(0, 28), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }));
    // Hijos que se salen de su contenedor (recortados / desbordados).
    const desbordes = [...d.querySelectorAll("*")]
      // `sr-only` mide 1 px de ancho A PROPÓSITO (es para lectores de pantalla,
      // no se ve): contarlo como desborde sería ruido puro.
      .filter((e) => e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2 && getComputedStyle(e).overflowX !== "auto" && getComputedStyle(e).overflowX !== "scroll")
      .map((e) => ({ tag: e.tagName, extra: e.scrollWidth - e.clientWidth, t: (e.textContent || "").trim().slice(0, 30) }));
    const chico = [...d.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
      .map((e) => parseFloat(getComputedStyle(e).fontSize))
      .filter((n) => n && n < 12);
    const r = d.getBoundingClientRect();
    return {
      ventana: true,
      arrastrePagina: de.scrollWidth - de.clientWidth,
      ventanaDentro: r.left >= -1 && r.right <= window.innerWidth + 1,
      anchoVentana: Math.round(r.width),
      altoVentana: Math.round(r.height),
      haySugerencias: d.textContent.includes("¿Quisiste decir"),
      hayAvisoSinParecidos: d.textContent.includes("No hay ningún cliente parecido"),
      sugerencias: [...d.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter((t) => /D-\d+/.test(t)).slice(0, 4),
      targetsChicos: chicos,
      desbordes,
      textosBajo12px: chico,
    };
  });

  console.log(`\n═══ ${ancho} px (abrió la ventana: ${abrio}) ═══`);
  console.log(JSON.stringify(m, null, 2));
  await page.screenshot({ path: `${SALIDA}/atar-${ancho}.png` });
  await ctx.close();
}

await nav.close();
