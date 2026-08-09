// Medición de la tarjeta "HOY" de Multifashion en los TRES anchos: 390 · 834 · 1440.
//
// Qué mide:
//   · ARRASTRE — la página pide más ancho del que se ve.
//   · RECORTE  — la tarjeta pide más de lo que muestra (peor que arrastrar: el
//                dato queda fuera y no hay forma de alcanzarlo).
//   · Hijos que se salen de la tarjeta.
//   · El texto completo, para cotejar el monto contra la fuente.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar.
//
// Solo lectura. La cookie sale de /tmp/fg-cookie.txt (misma convención que el
// resto de los `_medir-*`); contra un dev server LOCAL, si ese archivo no
// existe, se firma una con SESSION_SECRET de .env.local.
//
//   npx next dev -p 3457
//   BASE=http://localhost:3457 node scripts/_medir-venta-hoy-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3457";
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    throw new Error("Falta /tmp/fg-cookie.txt (cookie cxc_session de una sesión real)");
  }
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: cookieDeSesion(), url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { sessionStorage.setItem("fg_modules", JSON.stringify(["multifashion"])); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

const page = await ctx.newPage();
for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  await page.goto(`${BASE}/multifashion`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector('section[aria-label="Venta de hoy"]', { timeout: 60_000 });
  await page.waitForTimeout(600);

  const m = await page.evaluate(() => {
    const card = document.querySelector('section[aria-label="Venta de hoy"]');
    const r = card.getBoundingClientRect();
    const desbordes = [];
    for (const el of card.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.right > r.right + 1 || b.left < r.left - 1) desbordes.push(`${el.tagName}.${el.className}`.slice(0, 70));
    }
    return {
      docScrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      cardW: Math.round(r.width),
      cardH: Math.round(r.height),
      cardScrollW: card.scrollWidth,
      cardClientW: card.clientWidth,
      texto: card.innerText.replace(/\n+/g, " · "),
      desbordes,
    };
  });

  const arrastre = m.docScrollW > m.innerW;
  const recorte = m.cardScrollW > m.cardClientW;
  console.log(
    `\n${a.nombre} (${a.w}px)\n` +
      `  página: scrollWidth ${m.docScrollW} vs innerWidth ${m.innerW}  → ${arrastre ? "❌ ARRASTRA" : "✅ 0 arrastre"}\n` +
      `  tarjeta: ${m.cardW}×${m.cardH}px, scrollWidth ${m.cardScrollW} vs clientWidth ${m.cardClientW} → ${recorte ? "❌ RECORTA" : "✅ 0 recorte"}\n` +
      `  hijos desbordados: ${m.desbordes.length === 0 ? "✅ ninguno" : "❌ " + m.desbordes.join(" | ")}\n` +
      `  texto: ${m.texto}`,
  );
  await page.screenshot({ path: `/tmp/venta-hoy-${a.w}.png` });
}

await browser.close();
