// Lista los tocables de menos de 44px de las DOS pantallas del cambio, para
// poder COMPARARLAS contra main.
//
// 🩸 POR QUÉ EXISTE. La medición de anchos encontró tocables chicos en el
// checkout y en el detalle del pedido. Llamarlos "preexistentes" sin medirlos
// contra main es suponer, no medir — y si alguno lo hubiera metido yo, sería un
// hallazgo mío disfrazado de herencia. Este script corre IGUAL en las dos ramas
// (no usa ningún selector nuevo) y su salida se compara línea a línea.
//
//   # rama del cambio
//   npx next start -p 3477   →  BASE=http://localhost:3477 node scripts/_medir-tactiles-comparar.mjs
//   # main
//   npx next start -p 3478   →  BASE=http://localhost:3478 node scripts/_medir-tactiles-comparar.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3477";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];

const TOM_SIN_CLIENTE = "c68f1479-adb0-4863-b74e-1177df23cac2"; // TOM-005
const PED_DEL_LINK = "35c81d33-f77c-4f85-bb08-599035b2cc23";    // PED-022

const PANTALLAS = [
  { nombre: "checkout tommy", url: "/catalogo/tommy/checkout", espera: "main" },
  { nombre: "detalle TOM-005", url: `/catalogo/tommy/pedido/${TOM_SIN_CLIENTE}`, espera: "main" },
  { nombre: "detalle PED-022 (link)", url: `/catalogo/reebok/pedido/${PED_DEL_LINK}`, espera: "main" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"])); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
  try {
    sessionStorage.setItem("tommy_cart", JSON.stringify([{
      product_id: "medicion-1", sku: "TH-MEDICION-0001", name: "Sandalia de medición con nombre largo",
      image_url: "", quantity: 3, unit_price: 24.5, category: "footwear", bulto_pzas: 12,
    }]));
  } catch {}
});
const page = await ctx.newPage();

for (const p of PANTALLAS) {
  for (const w of ANCHOS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector(p.espera, { timeout: 60_000 });
    await page.waitForTimeout(600);
    const lista = await page.evaluate(() => {
      const out = [];
      for (const n of document.querySelectorAll("button, input, a")) {
        const b = n.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (b.height >= 44 && b.width >= 44) continue;
        const lbl = n.closest("label");
        const lr = lbl ? lbl.getBoundingClientRect() : null;
        if (lr && lr.height >= 44 && lr.width >= 44) continue;
        const txt = (n.textContent || n.getAttribute("aria-label") || n.getAttribute("placeholder") || n.type || "").trim().replace(/\s+/g, " ").slice(0, 28);
        out.push(`${n.tagName}[${txt}] ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      const cuenta = {};
      for (const t of out) cuenta[t] = (cuenta[t] || 0) + 1;
      return Object.entries(cuenta).sort().map(([t, n]) => (n > 1 ? `${t} x${n}` : t));
    });
    for (const l of lista) console.log(`${p.nombre} @${w} :: ${l}`);
    if (lista.length === 0) console.log(`${p.nombre} @${w} :: (ninguno)`);
  }
}

await browser.close();
