// Medición de «TRABAJO FUERA DE LA OFICINA» en los tres anchos: 390 · 834 · 1440
// (más 1024, el iPad acostado, donde este repo ya se quemó dos veces).
//
// Qué mide:
//   1. /asistencia?tab=reporte — la fila de la persona con el chip
//      «N días trabajando fuera», SIN abrir nada.
//   2. El detalle abierto — el renglón «Trabajando fuera de la oficina».
//   3. /asistencia?tab=justificaciones — el desplegable con el motivo nuevo.
//
// Y en las tres: ARRASTRE de página · RECORTES · blancos táctiles <44 px ·
// textos <12 px.
//
// 🔑 EL ANCHO QUE DECIDE ES EL ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// 🩸 EN PRODUCCIÓN TODAVÍA NO HAY NINGUNA JUSTIFICACIÓN CON ESTE MOTIVO (la
// carga una persona desde la pantalla), así que sin ayuda no habría nada que
// medir y el script pasaría en verde sin haber mirado nada. Se INTERCEPTA la
// respuesta de `/api/asistencia/reporte` y se le inyectan días con la forma
// EXACTA que van a tener: los datos siguen siendo los de producción y el
// componente que se mide es el REAL. No se toca la base ni se guarda nada.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, la pestaña vive
// en la URL (`?tab=`), y esta app NO tiene <main> (el primer
// `div[class*="transition-"]` es un overlay VACÍO: mediría 0 en todo).
//
//   npm run build && npx next start -p 3489
//   BASE=http://localhost:3489 node scripts/_medir-trabajo-fuera-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3489";
const OUT = process.env.OUT ?? "/tmp/asistencia-trabajo-fuera";
mkdirSync(OUT, { recursive: true });

const MOTIVO = "Trabajo fuera de la oficina";
const TEXTO_DIA = "Trabajando fuera de la oficina";

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPadAcostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "Daniel", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
const COOKIE = cookieDeSesion();

const MEDIR = () => {
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  const arrastre = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const recortados = [], tactiles = [], textosChicos = [];
  const zonas = [raiz, ...document.querySelectorAll("body > div.fixed.inset-0")];
  for (const zona of zonas) {
    for (const el of zona.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
        recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 60)}`, px: el.scrollWidth - el.clientWidth });
      }
      if (el.matches("button, a[href], input, select, textarea, [role=button]") && r.height < 43.5) {
        tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 28) });
      }
      if (el.children.length === 0 && (el.textContent ?? "").trim()) {
        const fs = parseFloat(cs.fontSize);
        if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
      }
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este PR cambió, leído del DOM. */
const LEER = () => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  return {
    chipEnLaPersona: /\d+ días? trabajando fuera/.test(txt),
    renglonDelDia: txt.includes("Trabajando fuera de la oficina"),
    // 🔴 Lo que NO puede aparecer: llamarle ausencia a un día trabajado.
    diceAusenciaDeTrabajoFuera: /Ausencia justificada — Trabajo fuera/.test(txt),
    // El chip del ALTO real, para saber si empujó la fila.
    altoChip: (() => {
      const el = [...document.querySelectorAll("span")]
        .find((s) => /\d+ días? trabajando fuera/.test(s.textContent ?? ""));
      return el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : 0;
    })(),
    filasPersona: document.querySelectorAll("table")[0]?.querySelectorAll("tbody > tr").length ?? 0,
    opcionesMotivo: [...document.querySelectorAll("option")].map((o) => o.textContent?.trim()),
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

// ── La inyección. Datos de producción; días con la forma REAL del motivo. ───
await ctx.route("**/api/asistencia/reporte*", async (route) => {
  const res = await route.fetch();
  const d = await res.json().catch(() => null);
  if (!d?.personas?.length) return route.fulfill({ response: res });

  // La primera persona que tenga al menos 2 días SIN marcas: se le ponen como
  // «trabajando fuera», que es exactamente el caso de Rodrigo.
  for (const p of d.personas) {
    const sinMarcas = p.dias.filter((x) => !x.marcas.length && x.habil && !x.feriado).slice(0, 2);
    if (sinMarcas.length < 2) continue;
    for (const dia of sinMarcas) { dia.justificado = "Trabajo fuera de la oficina"; dia.ausente = false; }
    p.resumen.diasTrabajandoFuera = sinMarcas.length;
    p.resumen.ausenciasSinJustificar = Math.max(0, p.resumen.ausenciasSinJustificar - sinMarcas.length);
    d.__personaFuera = p.codigo;
    break;
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
});

const page = await ctx.newPage();
const resultados = {};
const problemas = [];

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  const paso = {};
  const P = (m) => problemas.push(`${a.nombre} (${a.w}): ${m}`);

  await page.goto(`${BASE}/asistencia?tab=reporte`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForSelector("table tbody tr", { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(3500);

  // 1 ── El reporte cerrado: el chip se ve SIN abrir nada.
  paso.reporteCerrado = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/reporte-cerrado-${a.w}.png`, fullPage: true });

  // 2 ── El detalle de esa persona: el renglón del día.
  const filas = page.locator("table").first().locator("tbody > tr");
  await filas.filter({ hasText: /días? trabajando fuera/ }).first()
    .click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1000);
  paso.detalleAbierto = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/detalle-${a.w}.png`, fullPage: true });

  // 3 ── Justificaciones: el motivo se puede elegir.
  await page.goto(`${BASE}/asistencia?tab=justificaciones`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(2500);
  paso.justificaciones = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/justificaciones-${a.w}.png`, fullPage: true });

  resultados[a.nombre] = paso;

  // 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN MIRAR NADA.
  if (!paso.reporteCerrado.filasPersona) P("el reporte salió vacío");
  if (!paso.reporteCerrado.chipEnLaPersona) P("🔴 la persona NO lleva el chip (no se ve sin abrir)");
  if (!paso.detalleAbierto.renglonDelDia) P(`🔴 el detalle NO dice «${TEXTO_DIA}»`);
  if (paso.detalleAbierto.diceAusenciaDeTrabajoFuera) P("🔴 le llama AUSENCIA a un día trabajado");
  if (!paso.justificaciones.opcionesMotivo?.includes(MOTIVO)) P(`🔴 «${MOTIVO}» no está en el desplegable`);
}

await browser.close();

console.log("═".repeat(78));
console.log("TRABAJO FUERA DE LA OFICINA — arrastre · recortes · táctiles <44 · texto <12");
console.log("═".repeat(78));
for (const [ancho, p] of Object.entries(resultados)) {
  console.log(`\n${ancho}`);
  for (const [pantalla, m] of Object.entries(p)) {
    console.log(
      `  ${pantalla.padEnd(18)} útil ${String(m.innerW).padStart(4)} · ` +
      `arrastre ${String(m.arrastre).padStart(3)} · recortes ${String(m.recortados.length).padStart(2)} · ` +
      `táctil<44 ${String(m.tactiles.length).padStart(2)} · texto<12 ${String(m.textosChicos.length).padStart(2)}` +
      (m.altoChip ? ` · chip ${m.altoChip}px` : ""),
    );
    for (const r of m.recortados) console.log(`      recorte: ${r.px}px ${r.el}`);
    for (const t of m.tactiles) console.log(`      táctil: ${t.alto}px «${t.txt}»`);
    for (const t of m.textosChicos.slice(0, 6)) console.log(`      texto: ${t.fs}px «${t.txt}»`);
  }
}

console.log(`\n${"═".repeat(78)}`);
if (problemas.length) {
  console.log("🔴 PROBLEMAS");
  for (const p of problemas) console.log(`  · ${p}`);
  process.exitCode = 1;
} else {
  console.log("🟢 Las tres pantallas se leen enteras en los cuatro anchos, y el motivo se distingue.");
}
console.log(`Capturas en ${OUT}`);
