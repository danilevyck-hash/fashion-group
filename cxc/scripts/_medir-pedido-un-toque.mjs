// SOLO LECTURA de la pantalla del pedido (`/catalogo/[marca]/pedido/[id]`).
// Mide los cuatro anchos de la casa en los DOS estados que trajo el toque
// único: con un PRECIO EDITADO (aviso inline "← lista $X") y con la PANTALLA
// DE PROBLEMA abierta.
//
//   BASE=http://localhost:3161 MARCA=tommy PEDIDO=<uuid> node scripts/_medir-pedido-un-toque.mjs
//
// 🔴 NO ESCRIBE NADA, NI EN LA BASE NI EN SWITCH. Tres candados:
//   · todo método que no sea GET se corta en el navegador (nunca sale),
//   · `/permiso-precio` se responde con un doble → NO se abre sesión de Switch
//     (sesión ÚNICA por empresa: una sesión de medición podría tumbarle el
//     token a un cron),
//   · `/enviar-switch` POST se responde con un 422 de mentira para poder
//     DIBUJAR la pantalla de problema sin tocar el ERP.
//
// Gotchas de medición de la casa: sembrar la cookie de sesión Y
// `sessionStorage.cxc_role`, y `delete Navigator.prototype.serviceWorker`
// antes de navegar.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3161";
const MARCA = process.env.MARCA ?? "tommy";
const PEDIDO = process.env.PEDIDO;
const SALIDA = `/tmp/pedido-un-toque-${MARCA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);

if (!PEDIDO) { console.error("Falta PEDIDO=<uuid>"); process.exit(1); }
mkdirSync(SALIDA, { recursive: true });

const PROBLEMA = {
  error: "El pedido no pasa la pre-validación",
  errores: [
    "SKU TH-DEMO-1 no existe en Switch (fashion_shoes) — agregarlo en el panel antes de enviar",
    "SKU TH-DEMO-2 tiene precio 0 en Switch — corregirlo en el panel antes de enviar",
  ],
  warnings: [], avisos: [],
  lineas: [
    { sku: "TH-DEMO-3", descripcionSwitch: "CAMISA MANGA LARGA SLIM FIT AZUL MARINO", bultos: 3, piezas: 36, precioCatalogo: 15, precioSwitch: 16.5 },
  ],
};

/** Mide arrastre, recortes, blancos táctiles y textos chicos. */
const medir = () => {
  const de = document.documentElement;
  const arrastre = Math.max(0, de.scrollWidth - de.clientWidth);
  const chicos = [], textos = [], recortados = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const tag = el.tagName.toLowerCase();
    if ((tag === "button" || tag === "a" || tag === "input" || tag === "select") && (r.height < 44 || r.width < 44)) {
      chicos.push({ tag, txt: (el.textContent || el.getAttribute("aria-label") || tag).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
    }
    const px = parseFloat(cs.fontSize);
    if (px && px < 12 && (el.textContent || "").trim() && el.children.length === 0) {
      textos.push({ px, txt: (el.textContent || "").trim().slice(0, 40) });
    }
    // Un scroller DECLARADO (overflow auto/scroll) es el mecanismo, no un
    // defecto: no cuenta como recorte.
    const declara = /auto|scroll/.test(cs.overflowX);
    if (!declara && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ tag, cls: String(el.className).slice(0, 50), px: el.scrollWidth - el.clientWidth });
    }
  }
  return { arrastre, chicos, textos, recortados };
};

const nav = await chromium.launch();
let malas = 0;

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
    // El guard del catálogo mira `fg_modules`, no el rol.
    sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
  });
  const page = await ctx.newPage();

  // ── Los tres candados de escritura ──
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes("/permiso-precio")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ permiso: true, verificado: true, mensaje: null }) });
    }
    if (url.includes("/enviar-switch") && req.method() === "POST") {
      return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify(PROBLEMA) });
    }
    if (req.method() !== "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, bloqueadoPorElMedidor: true }) });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/catalogo/${MARCA}/pedido/${PEDIDO}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Enviar a Switch")', { timeout: 30000 });
  await page.waitForTimeout(1500);

  // ── ESTADO 1: precio EDITADO → aviso inline "← lista $X" ──
  const precio = page.locator('input[type="number"][step="1"][min="0"]').first();
  await precio.fill("7");
  await page.waitForTimeout(600);
  const avisoLista = await page.locator("text=/← lista/").first().textContent().catch(() => null);
  const m1 = await page.evaluate(medir);

  // ── ESTADO 2: pantalla de problema ──
  await page.locator('button:has-text("Enviar a Switch")').first().click();
  await page.waitForSelector("text=No se puede enviar a Switch", { timeout: 30000 });
  await page.waitForTimeout(600);
  const m2 = await page.evaluate(medir);

  for (const [estado, m] of [["precio editado", m1], ["pantalla de problema", m2]]) {
    const ok = m.arrastre === 0 && m.recortados.length === 0 && m.chicos.length === 0 && m.textos.length === 0;
    if (!ok) malas++;
    console.log(
      `${ancho}px · ${estado.padEnd(21)} arrastre ${String(m.arrastre).padStart(4)} · recortados ${String(m.recortados.length).padStart(2)} · táctiles<44 ${String(m.chicos.length).padStart(2)} · texto<12 ${String(m.textos.length).padStart(2)} ${ok ? "🟢" : "🔴"}`,
    );
    if (!ok) {
      for (const r of m.recortados.slice(0, 5)) console.log(`      recorta ${r.px}px  ${r.tag}.${r.cls}`);
      for (const c of m.chicos.slice(0, 5)) console.log(`      táctil ${c.w}×${c.h}  ${c.txt}`);
      for (const t of m.textos.slice(0, 5)) console.log(`      texto ${t.px}px  ${t.txt}`);
    }
  }
  console.log(`      aviso inline: ${avisoLista ? JSON.stringify(avisoLista.trim()) : "(no apareció)"}`);
  await page.screenshot({ path: `${SALIDA}/${ancho}-problema.png`, fullPage: true });
  await ctx.close();
}

await nav.close();
console.log(malas === 0 ? "\n🟢 TODO LIMPIO" : `\n🔴 ${malas} estado(s) con hallazgos`);
process.exit(malas === 0 ? 0 : 1);
