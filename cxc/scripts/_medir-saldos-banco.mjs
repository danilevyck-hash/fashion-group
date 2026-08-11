// Medición del módulo "Saldos de Banco" en los TRES anchos: 390 · 834 · 1440.
//
// Qué mide, en /saldos-banco, /gastos-empresa (el viejo, que todavía los
// muestra) y /vista-general:
//   · ARRASTRE — la página pide más ancho del que se ve.
//   · RECORTE  — un contenedor pide más de lo que muestra (peor que arrastrar:
//                el dato queda fuera y no hay forma de alcanzarlo).
//   · Blancos TÁCTILES por debajo de 44 px y textos por debajo de 12 px.
//   · Las filas que se ven: empresa, saldo, fecha, y si el input trae el monto.
//   · La "Disponibilidad" de Vista General, para cotejarla contra la base.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar.
//
// SOLO LECTURA contra producción: el guardado se prueba INTERCEPTANDO el POST
// (nunca llega a la base), y la ruta real se prueba con un payload inválido que
// tiene que responder 400 sin escribir nada.
//
//   npm run build && PORT=3461 npm run start
//   BASE=http://localhost:3461 node scripts/_medir-saldos-banco.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3461";
const OUT = process.env.OUT ?? "/tmp/saldos-banco";
mkdirSync(OUT, { recursive: true });

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

const COOKIE = cookieDeSesion();

/** Medición genérica de una pantalla: arrastre, recortes, táctiles y textos. */
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
      recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 50)}`, px: el.scrollWidth - el.clientWidth });
    }
    if (el.matches("button, a[href], input, select, [role=button]")) {
      // `type=date` en Chrome mide el alto del control, no del texto.
      if (r.height < 44 - 0.5) tactiles.push({ el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 24) });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

const LEER_FILAS = () => {
  const filas = [];
  for (const inp of document.querySelectorAll('input[inputmode="decimal"]')) {
    const fila = inp.closest("div.p-3");
    if (!fila) continue;
    const txt = (fila.textContent ?? "").replace(/\s+/g, " ").trim();
    filas.push({
      texto: txt,
      montoEnInput: inp.value,
      inputHabilitado: !inp.disabled,
      guardarHabilitado: !fila.querySelector("button:last-of-type")?.disabled,
      fechaEnInput: fila.querySelector('input[type="date"]')?.value ?? null,
    });
  }
  return filas;
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

const page = await ctx.newPage();
const resultados = {};

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });

  // ── /saldos-banco ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/saldos-banco`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 60_000 });
  await page.waitForTimeout(400);
  const saldos = await page.evaluate(MEDIR);
  const filas = await page.evaluate(LEER_FILAS);
  await page.screenshot({ path: `${OUT}/saldos-banco-${a.w}.png`, fullPage: true });

  // ── /gastos-empresa (el viejo: los saldos siguen ahí) ────────────────────
  await page.goto(`${BASE}/gastos-empresa`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 60_000 });
  await page.waitForTimeout(400);
  const viejo = await page.evaluate(MEDIR);
  const filasViejo = await page.evaluate(LEER_FILAS);
  await page.screenshot({ path: `${OUT}/gastos-empresa-${a.w}.png`, fullPage: true });

  // ── /vista-general (Disponibilidad) ──────────────────────────────────────
  await page.goto(`${BASE}/vista-general`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(1500);
  const disponibilidad = await page.evaluate(() => {
    for (const el of document.querySelectorAll("a")) {
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t.startsWith("Disponibilidad")) return { texto: t, href: el.getAttribute("href") };
    }
    return null;
  });
  await page.screenshot({ path: `${OUT}/vista-general-${a.w}.png`, fullPage: true });

  resultados[a.nombre] = { ancho: a.w, saldos, filas, viejo, filasViejo, disponibilidad };
}

// ── Guardar: se INTERCEPTA el POST, nunca llega a la base ───────────────────
await page.setViewportSize({ width: 390, height: 844 });
let payload = null;
await page.route("**/api/saldos-banco", async (route) => {
  if (route.request().method() !== "POST") return route.continue();
  payload = route.request().postDataJSON();
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, saldo: {} }) });
});
await page.goto(`${BASE}/saldos-banco`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForSelector('input[inputmode="decimal"]');
const primeraFila = page.locator("div.p-3").first();
await primeraFila.locator('input[inputmode="decimal"]').fill("12345.67");
await primeraFila.getByRole("button", { name: /Guardar/ }).click();
await page.waitForTimeout(1200);
const toast = await page.evaluate(() => (document.body.textContent ?? "").includes("Listo, guardado"));

// ── La ruta REAL responde y valida, sin escribir nada ───────────────────────
const rechazo = await fetch(`${BASE}/api/saldos-banco`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: `cxc_session=${COOKIE}` },
  body: JSON.stringify({ empresa_key: "no_existe", saldo: 1, fecha_dato: "2026-08-11" }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

const lectura = await fetch(`${BASE}/api/saldos-banco`, { headers: { Cookie: `cxc_session=${COOKIE}` } })
  .then((r) => r.json());

const vistaGeneralApi = await fetch(`${BASE}/api/dashboard/vista-general`, { headers: { Cookie: `cxc_session=${COOKIE}` } })
  .then((r) => r.json());

console.log(JSON.stringify({
  anchos: resultados,
  guardado: { payload, toast },
  rutaValida: rechazo,
  lectura,
  disponibilidadApi: vistaGeneralApi.disponibilidad,
}, null, 2));

await browser.close();
