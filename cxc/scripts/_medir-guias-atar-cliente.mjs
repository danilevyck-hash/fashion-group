// Medición de /guias con el acordeón ABIERTO, en los 3 anchos: 390 · 834 · 1440.
//
// Lo que se está midiendo es lo que este PR agregó: la segunda línea de la
// celda CLIENTE (el chip D-XXX o el enlace "Atar cliente") dentro de la tabla
// de ítems, y la ventana de atar. Lo que interesa saber es si eso empeoró el
// arrastre de la tabla o metió un blanco táctil por debajo de 44 px.
//
// SOLO LECTURA: navega, expande un acordeón y mide. No guarda nada, no toca
// ningún endpoint de escritura.
//
// GOTCHAS heredados de `_medir-scroll-lateral.mjs` (no tocar sin leer):
//   · hay que sembrar la COOKIE de sesión firmada o todo redirige al login;
//   · hay que sembrar sessionStorage (`cxc_role`): useAuth lo lee de AHÍ;
//   · hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
//   BASE=http://localhost:3000 node scripts/_medir-guias-atar-cliente.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SALIDA = process.env.SALIDA ?? "/tmp/guias-atar";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const etiqueta = (el) =>
    el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 70) : "");

  // Arrastre y recorte
  const arrastrables = [], cortados = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1 || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    const tablaAdentro = Boolean(el.querySelector("table"));
    const fila = { etiqueta: etiqueta(el), sobraPx: Math.round(sobra), tablaAdentro };
    if (cs.overflowX === "auto" || cs.overflowX === "scroll") arrastrables.push(fila);
    else if (el.children.length > 0 && (tablaAdentro || sobra >= 100)) cortados.push(fila);
  }
  arrastrables.sort((a, b) => b.sobraPx - a.sobraPx);
  cortados.sort((a, b) => b.sobraPx - a.sobraPx);

  // Blancos táctiles < 44 px
  const chicos = [];
  const sel = "button, a[href], [role=button], [role=menuitem], input:not([type=hidden]), select, textarea";
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    chicos.push({
      etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 30),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  chicos.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));

  // Lo de ESTE PR
  const enlaces = [...document.querySelectorAll("button")].filter((b) => /Atar cliente/.test(b.textContent || "") && visible(b));
  const chips = [...document.querySelectorAll("span")].filter((s) => /^D-\\d+$/.test((s.textContent || "").trim()) && visible(s));

  return {
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    peorArrastrePx: arrastrables.length ? arrastrables[0].sobraPx : 0,
    peorArrastre: arrastrables[0] ?? null,
    cortadoPx: cortados.length ? cortados[0].sobraPx : 0,
    cortado: cortados[0] ?? null,
    targetsChicos: chicos.length,
    ejemplosTarget: chicos.slice(0, 6),
    enlacesAtar: enlaces.length,
    medidasAtar: enlaces.slice(0, 4).map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }),
    chipsCodigo: chips.length,
    filasItems: document.querySelectorAll("tbody tr").length,
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();

for (const ANCHO of ANCHOS) {
  const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
  const ctx = await navegador.newContext({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
    hasTouch: ANCHO < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);

  // Abrir el acordeón de la PRIMERA guía. Sin esto no hay tabla de ítems y la
  // medición sería un cero falso.
  // GT-189 es la guía real de 4 destinos (America Clasic, Jerusalem, City Mall
  // Paso Canoa, City Mall David): el caso que este PR tiene que soportar.
  //
  // ⚠️ A 390 px con `hasTouch` la fila vive dentro de un `SwipeableRow` que se
  // come el click de Playwright — la medición daba `filasItems: 0`, un CERO
  // FALSO. Se dispara el click desde el DOM sobre el ancestro clickeable, que
  // es lo que hace el dedo de verdad.
  await page.evaluate(() => {
    const nodos = [...document.querySelectorAll("*")].filter(
      (e) => e.children.length === 0 && /GT-189/.test(e.textContent || "")
    );
    let el = nodos[0];
    while (el && !el.getAttribute("onclick") && el.tagName !== "BUTTON") {
      const cs = getComputedStyle(el);
      if (cs.cursor === "pointer") break;
      el = el.parentElement;
    }
    (el || nodos[0])?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(6000);

  const r = await page.evaluate(SONDA);
  console.log(`\n═══ ${ANCHO} px ═══`);
  console.log(JSON.stringify(r, null, 2));
  await page.screenshot({ path: `${SALIDA}/guias-${ANCHO}.png`, fullPage: false });

  // Y la ventana de atar, si hay algún enlace.
  if (r.enlacesAtar > 0) {
    await page.locator("button", { hasText: "Atar cliente" }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const rm = await page.evaluate(SONDA);
    console.log(`--- ventana ATAR a ${ANCHO} px ---`);
    console.log(JSON.stringify({ cuerpoPx: rm.cuerpoPx, cortadoPx: rm.cortadoPx, cortado: rm.cortado, targetsChicos: rm.targetsChicos, ejemplosTarget: rm.ejemplosTarget }, null, 2));
    await page.screenshot({ path: `${SALIDA}/atar-${ANCHO}.png`, fullPage: false });
  }
  await ctx.close();
}
await navegador.close();
