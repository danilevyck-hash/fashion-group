// Medición del indicador "hasta qué mes está al día" en los TRES anchos.
//
// Qué mide, en 390 · 834 · 1440, sobre /gastos-contabilidad (pestaña Gastos,
// fuente Egresos Varios), en DOS estados — un mes con datos y un mes vacío:
//   · La línea de "Cargado hasta …" de CADA empresa, tal como se lee.
//   · Que la que no tiene nada diga que no hay gastos registrados y NUNCA $0.
//   · ARRASTRE, RECORTE, blancos táctiles bajo 44 px y textos bajo 12 px.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// y `delete Navigator.prototype.serviceWorker` antes de navegar. El script
// FALLA si no encuentra las 8 empresas o ninguna línea de "al día": medir cero
// y dar verde sin haber mirado nada es el peor resultado posible.
//
// SOLO LECTURA contra producción.
//
//   npm run build && PORT=3461 npm run start
//   BASE=http://localhost:3461 node scripts/_medir-gastos-al-dia.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3461";
const OUT = process.env.OUT ?? "/tmp/gastos-al-dia";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

// Un mes CON datos de casi todas y uno VACÍO (nadie cargó julio salvo vistana).
const MESES = [
  { etiqueta: "con-datos", mes: "2026-03" },
  { etiqueta: "casi-vacio", mes: "2026-07" },
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

const COOKIE = cookieDeSesion();

const MEDIR = () => {
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - window.innerWidth);
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  for (const el of document.querySelectorAll("main *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 60)}`, px: el.scrollWidth - el.clientWidth });
    }
    if (el.matches("button, a[href], input, select, [role=button]") && r.height < 44 - 0.5) {
      tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** La línea de "al día" de cada empresa, leída como la lee una persona. */
const LEER_AL_DIA = () =>
  Array.from(document.querySelectorAll("main p"))
    .map((p) => (p.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => /^Cargado hasta |^Todavía no hay gastos registrados$/.test(t));

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

const page = await ctx.newPage();
const resultados = {};
const problemas = [];

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  resultados[a.nombre] = { ancho: a.w, estados: {} };

  for (const m of MESES) {
    await page.goto(`${BASE}/gastos-contabilidad?mes=${m.mes}`, { waitUntil: "networkidle", timeout: 180_000 });
    // La lista de empresas: 8 tarjetas (o 8 filas de tabla desde lg).
    await page.waitForSelector('[role="tab"]', { timeout: 60_000 });
    await page.waitForTimeout(1400);

    const medida = await page.evaluate(MEDIR);
    const lineas = await page.evaluate(LEER_AL_DIA);
    const cuerpo = await page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " "));

    // A partir de lg la lista es TABLA y las tarjetas no se montan: se cuentan
    // los nombres de empresa, que están en las dos formas.
    const empresas = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main span.font-semibold"))
        .map((s) => (s.textContent ?? "").trim())
        .filter(Boolean),
    );

    if (empresas.length < 8) problemas.push(`${a.w}/${m.etiqueta}: se esperaban 8 empresas, hay ${empresas.length}`);
    if (lineas.length < 8) problemas.push(`${a.w}/${m.etiqueta}: se esperaban 8 líneas de "cargado hasta", hay ${lineas.length}`);
    if (!cuerpo.includes("Todavía no hay gastos registrados")) {
      problemas.push(`${a.w}/${m.etiqueta}: falta el texto de la empresa sin gastos registrados`);
    }
    // 🔴 La empresa sin nada NO puede aparecer con un monto en su lugar.
    const sinNada = await page.evaluate(() => {
      const out = [];
      for (const p of document.querySelectorAll("main p")) {
        if ((p.textContent ?? "").trim() !== "Todavía no hay gastos registrados") continue;
        const fila = p.closest("div.p-3, tr, div.rounded-lg");
        out.push((fila?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160));
      }
      return out;
    });
    for (const f of sinNada) {
      if (/\$0\.00/.test(f)) problemas.push(`${a.w}/${m.etiqueta}: una empresa sin gastos se muestra en $0.00 → ${f}`);
    }

    await page.screenshot({ path: `${OUT}/${m.etiqueta}-${a.w}.png`, fullPage: true });
    resultados[a.nombre].estados[m.etiqueta] = { mes: m.mes, medida, lineas, sinNada, empresas: empresas.length };
  }
}

console.log(JSON.stringify({ anchos: resultados, problemas }, null, 2));
await browser.close();
if (problemas.length > 0) process.exit(1);
