// SOLO LECTURA. ¿Una línea YA atada se puede corregir desde la pantalla?
//
// Es la pregunta que dejó abierta el dogfood: si el código puesto fuera texto
// muerto, la línea de GT-183 atada a `111380` (un código de Boston) no se
// podría arreglar nunca sin tocar la base a mano.
//
// NO GUARDA NADA: abre la ventana y la cierra con Cancelar.
//
//   BASE=http://localhost:3000 ANCHO=390 node scripts/_verif-guias-chip-clickeable.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ANCHO = Number(process.env.ANCHO ?? 1440);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const nav = await chromium.launch();
const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
const ctx = await nav.newContext({ viewport: { width: ANCHO, height: ALTO }, hasTouch: ANCHO < 1200 });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_is_owner", "1"); });
const page = await ctx.newPage();

await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
await page.evaluate(() => {
  const n = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /GT-189/.test(e.textContent || ""));
  let el = n[0];
  while (el && getComputedStyle(el).cursor !== "pointer") el = el.parentElement;
  (el || n[0])?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(6000);

const chip = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^D-80$/.test((x.textContent || "").trim()));
  if (!b) return { esBoton: false };
  const r = b.getBoundingClientRect();
  b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return { esBoton: true, w: Math.round(r.width), h: Math.round(r.height) };
});
await page.waitForTimeout(2500);

const dlg = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"][aria-label="Atar cliente"]');
  if (!d) return null;
  return {
    dice: (d.textContent.match(/En la guía dice(.{0,30})/) || [])[1]?.trim(),
    valorInicial: d.querySelector("input")?.value ?? null,
    botones: [...d.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
    guardarDeshabilitado: [...d.querySelectorAll("button")].find((b) => /Guardar/.test(b.textContent))?.disabled ?? null,
  };
});
console.log(`ancho ${ANCHO} · chip D-80:`, JSON.stringify(chip));
console.log("ventana:", JSON.stringify(dlg, null, 2));
await page.screenshot({ path: `/tmp/guias-atar/chip-${ANCHO}.png` });

// Cerrar SIN guardar.
await page.evaluate(() => {
  [...document.querySelectorAll("[role=dialog] button")]
    .find((b) => /Cancelar/.test(b.textContent || ""))
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(1500);
const cerro = (await page.locator('[role="dialog"][aria-label="Atar cliente"]').count()) === 0;
console.log(`cerró con Cancelar sin guardar: ${cerro ? "SÍ ✅" : "NO ❌"}`);
await nav.close();
