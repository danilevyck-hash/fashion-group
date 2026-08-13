// Medición de la FUSIÓN "Gastos + Saldos de banco" en los TRES anchos.
//
// Qué mide, en 390 · 834 · 1440:
//   · /gastos-contabilidad (pestaña Gastos)
//   · /gastos-contabilidad?tab=saldos-banco (pestaña Saldos, cerrada Y con el
//     historial de una empresa desplegado — es el estado nuevo de este PR)
//   · /saldos-banco → tiene que REDIRIGIR a la pestaña, no dar 404
//   · /vista-general → la "Disponibilidad" no se puede mover ni un centavo
//
// En cada una: ARRASTRE (la página pide más ancho del que se ve), RECORTE (un
// contenedor pide más de lo que muestra y el dato queda inalcanzable), blancos
// TÁCTILES bajo 44 px y textos bajo 12 px.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar. Y el script FALLA si no encuentra sus selectores: medir
// cero y dar verde sin haber mirado nada es el peor resultado posible.
//
// SOLO LECTURA contra producción.
//
//   npm run build && PORT=3461 npm run start
//   BASE=http://localhost:3461 node scripts/_medir-gastos-saldos-fusion.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3461";
const OUT = process.env.OUT ?? "/tmp/gastos-saldos-fusion";
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
    if (el.matches("button, a[href], input, select, [role=button]")) {
      if (r.height < 44 - 0.5) {
        tactiles.push({
          el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`,
          alto: Math.round(r.height * 10) / 10,
          txt: (el.textContent ?? "").trim().slice(0, 30),
        });
      }
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
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
const problemas = [];

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });

  // ── Pestaña Gastos ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/gastos-contabilidad`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForSelector('[role="tab"]', { timeout: 60_000 });
  await page.waitForTimeout(1200);
  const pestanas = await page.$$eval('[role="tab"]', (els) => els.map((e) => e.textContent.trim()));
  if (pestanas.length !== 2) problemas.push(`${a.w}: se esperaban 2 pestañas, hay ${pestanas.length}`);
  const gastos = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${OUT}/gastos-${a.w}.png`, fullPage: true });

  // ── Pestaña Saldos de banco (cerrada) ─────────────────────────────────────
  await page.goto(`${BASE}/gastos-contabilidad?tab=saldos-banco`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 60_000 });
  await page.waitForTimeout(600);
  const saldos = await page.evaluate(MEDIR);
  const filas = await page.$$eval("div.p-3", (els) =>
    els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean),
  );
  if (filas.length < 8) problemas.push(`${a.w}: se esperaban 8 empresas, hay ${filas.length}`);
  const avisoRepetidos = await page.evaluate(() =>
    (document.body.textContent ?? "").match(/(\d+) saldos quedaron igualitos al anterior/)?.[0] ?? null,
  );
  if (!avisoRepetidos) problemas.push(`${a.w}: NO se ve el aviso de los saldos repetidos`);
  const chips = await page.$$eval("span", (els) =>
    els.map((e) => e.textContent.trim()).filter((t) => /^igual al /.test(t)),
  );
  await page.screenshot({ path: `${OUT}/saldos-${a.w}.png`, fullPage: true });

  // ── Pestaña Saldos con el HISTORIAL desplegado ────────────────────────────
  const abrir = page.locator("text=/Ver las \\d+ cargas anteriores/").first();
  if ((await abrir.count()) === 0) problemas.push(`${a.w}: no se encontró el botón del historial`);
  await abrir.click();
  await page.waitForTimeout(400);
  const historialVisible = await page.evaluate(() =>
    Array.from(document.querySelectorAll("li button")).map((b) => b.textContent.replace(/\s+/g, " ").trim()),
  );
  if (historialVisible.length === 0) problemas.push(`${a.w}: el historial no se desplegó`);
  const saldosAbierto = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${OUT}/saldos-historial-${a.w}.png`, fullPage: true });

  // ── La dirección vieja tiene que llegar ───────────────────────────────────
  const resp = await page.goto(`${BASE}/saldos-banco`, { waitUntil: "networkidle", timeout: 180_000 });
  const redirect = { status: resp.status(), url: page.url() };
  if (!page.url().includes("tab=saldos-banco")) problemas.push(`${a.w}: /saldos-banco NO redirige a la pestaña`);

  // ── Vista General: la Disponibilidad no se mueve ──────────────────────────
  await page.goto(`${BASE}/vista-general`, { waitUntil: "networkidle", timeout: 240_000 });
  await page.waitForTimeout(1800);
  const disponibilidad = await page.evaluate(() => {
    for (const el of document.querySelectorAll("a")) {
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t.startsWith("Disponibilidad")) return { texto: t, href: el.getAttribute("href") };
    }
    return null;
  });
  if (!disponibilidad) problemas.push(`${a.w}: no se encontró la tarjeta Disponibilidad`);

  resultados[a.nombre] = {
    ancho: a.w,
    pestanas,
    gastos,
    saldos,
    saldosAbierto,
    filas,
    avisoRepetidos,
    chips,
    historialVisible,
    redirect,
    disponibilidad,
  };
}

// ── La API: historial y último saldo, en el mismo payload ───────────────────
const api = await fetch(`${BASE}/api/saldos-banco`, { headers: { Cookie: `cxc_session=${COOKIE}` } })
  .then((r) => r.json());
const repetidosApi = Object.entries(api.historial ?? {})
  .filter(([, h]) => h.length > 0 && h[0].repiteAnterior)
  .map(([e, h]) => `${e} ${h[0].fecha_dato} $${h[0].saldo} = ${h[0].fechaAnterior}`);

const vg = await fetch(`${BASE}/api/dashboard/vista-general`, { headers: { Cookie: `cxc_session=${COOKIE}` } })
  .then((r) => r.json());

console.log(JSON.stringify({
  anchos: resultados,
  api: { bancos: api.bancos, repetidosApi },
  disponibilidadApi: vg.disponibilidad,
  problemas,
}, null, 2));

await browser.close();
if (problemas.length > 0) process.exit(1);
