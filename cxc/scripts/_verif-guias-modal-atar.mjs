// SOLO LECTURA de la pantalla: abre /guias, expande GT-189, abre la ventana de
// "Atar cliente" y busca un cliente. NO GUARDA — no toca el botón Guardar.
//
//   BASE=http://localhost:3000 ANCHO=1440 node scripts/_verif-guias-modal-atar.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ANCHO = Number(process.env.ANCHO ?? 1440);
const SALIDA = "/tmp/guias-atar";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

mkdirSync(SALIDA, { recursive: true });
const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: ANCHO, height: ALTO }, hasTouch: ANCHO < 1200 });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_is_owner", "1"); });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [consola]", m.text().slice(0, 160)); });

await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
await page.evaluate(() => {
  const n = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /GT-189/.test(e.textContent || ""));
  let el = n[0];
  while (el && getComputedStyle(el).cursor !== "pointer") el = el.parentElement;
  (el || n[0])?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(6000);

// Abrir la ventana desde el DOM (a 390 el SwipeableRow se come el click nativo).
const abrio = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Atar cliente/.test(x.textContent || ""));
  if (!b) return false;
  b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return true;
});
console.log(`enlace "Atar cliente" encontrado y disparado: ${abrio}`);
await page.waitForTimeout(2500);

const dlg = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"][aria-label="Atar cliente"]');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  const inp = d.querySelector("input");
  const chicos = [...d.querySelectorAll("button, input")].filter((e) => {
    const rr = e.getBoundingClientRect();
    return rr.width > 0 && rr.height > 0 && (rr.height < 44 || rr.width < 44);
  }).map((e) => ({ t: (e.textContent || e.tagName).trim().slice(0, 20), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }));
  return {
    ancho: Math.round(r.width), alto: Math.round(r.height),
    dentroDePantalla: r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1,
    textoEnLaGuia: d.textContent.includes("En la guía dice"),
    inputPresente: Boolean(inp),
    botones: [...d.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
    targetsChicos: chicos,
    cuerpoScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
console.log("VENTANA:", JSON.stringify(dlg, null, 2));
await page.screenshot({ path: `${SALIDA}/modal-${ANCHO}.png` });

// Escribir en el buscador y ver que salgan clientes reales.
if (dlg) {
  await page.locator('[role="dialog"] input').first().fill("city");
  await page.waitForTimeout(6000);
  const ops = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => /^(City|Otro)/i.test(t)).slice(0, 10)
  );
  console.log("sugerencias al escribir 'city':", JSON.stringify(ops));
  await page.screenshot({ path: `${SALIDA}/modal-busca-${ANCHO}.png` });
}

await nav.close();
