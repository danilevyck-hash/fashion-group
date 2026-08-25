// Medición de la ficha de CONFIGURACIÓN tocada por el PR del interruptor de
// seguros, en los CUATRO anchos: 390 · 834 · 1024 · 1440.
//
// Qué mide en /asistencia?tab=configuracion, con datos de PRODUCCIÓN y la ficha
// de una persona ABIERTA (que es donde viven las píldoras nuevas):
//   · ARRASTRE — la página pide más ancho del que se ve.
//   · RECORTE  — un contenedor pide más de lo que muestra.
//   · Blancos TÁCTILES bajo 44 px y textos bajo 12 px.
//   · Y lo que este PR agregó, leído del DOM real: la pregunta, las dos
//     píldoras, y que la de «no se le descuentan» esté APAGADA mientras la
//     migración no corra (que es el estado de hoy en producción).
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, esta app NO
// tiene <main>, y la pestaña vive en la URL.
//
// 🔴 SOLO LECTURA: se abre la ficha y se lee. NO se toca ninguna píldora — cada
// una GUARDA al tocarse, y tocar la de los seguros escribiría en producción.
//
//   npm run build && PORT=3499 npm run start
//   BASE=http://localhost:3499 node scripts/_medir-seguros-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3499";
const OUT = process.env.OUT ?? "/tmp/seguros-anchos";
const ETAPA = process.env.ETAPA ?? "despues";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
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

const RAIZ = `[...document.querySelectorAll('div[class*="transition-"]')]
  .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0] ?? document.body`;

const MEDIR = new Function(`
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - window.innerWidth);
  const recortados = []; const tactiles = []; const textosChicos = [];
  const raiz = ${RAIZ};
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: el.tagName + "." + String(el.className).slice(0, 60), px: el.scrollWidth - el.clientWidth });
    }
    if (el.matches("button, a[href], input, select, [role=button]") && r.height < 43.5) {
      tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 28) });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
`);

/** Lo que este PR agregó, leído del DOM. */
const LEER_CAMBIOS = new Function(`
  const raiz = ${RAIZ};
  const txt = (raiz.textContent ?? "").replace(/\\s+/g, " ");
  const botones = [...raiz.querySelectorAll("button")].map((b) => ({
    txt: (b.textContent ?? "").trim(), off: b.disabled,
  }));
  const dePagar = botones.find((b) => /seguro social y educativo/.test(b.txt));
  const deQuitar = botones.find((b) => /No se le descuentan/.test(b.txt));
  return {
    pregunta: /¿Se le descuentan los seguros\\?/.test(txt),
    botonPagar: !!dePagar,
    botonQuitar: !!deQuitar,
    quitarApagado: deQuitar ? deQuitar.off : null,
    avisoMigracion: /Todavía no se le puede quitar el seguro a nadie/.test(txt),
    // Testigos de que la ficha ABRIÓ y de que la pantalla trajo datos.
    fichaAbierta: /Empresa/.test(txt) && /¿Se le paga por planilla\\?/.test(txt),
    hayPersonas: (txt.match(/Código \\d|marcaciones/g) ?? []).length > 0,
  };
`);

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
  await page.goto(`${BASE}/asistencia?tab=configuracion`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(2000);
  // Abrir la ficha de BRICEIDA MONTERO (código 8), que es una de las cuatro
  // que en el Excel de la contadora SÍ pagan seguros. Abrir NO guarda nada:
  // el botón de la fila solo despliega el formulario.
  // 🩸 Se elige por NOMBRE y no `.first()`: el primer `aria-expanded` de la
  // página puede ser cualquier otra cosa, y entonces el script mediría un
  // formulario cerrado y pasaría en verde sin haber mirado la ficha.
  const abrir = page.locator('button[aria-expanded]:has-text("BRICEIDA")').first();
  await abrir.click({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  resultados[a.nombre] = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER_CAMBIOS)) };
  await page.screenshot({ path: `${OUT}/config-${ETAPA}-${a.w}.png`, fullPage: true });
}

await browser.close();

// 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN HABER MIRADO NADA.
const problemas = [];
for (const [ancho, r] of Object.entries(resultados)) {
  if (!r.hayPersonas) problemas.push(`${ancho}: la pantalla salió vacía`);
  if (!r.fichaAbierta) problemas.push(`${ancho}: la ficha no abrió`);
  if (ETAPA === "despues") {
    if (!r.pregunta) problemas.push(`${ancho}: falta la pregunta de los seguros`);
    if (!r.botonPagar || !r.botonQuitar) problemas.push(`${ancho}: falta alguna de las dos píldoras`);
  }
  if (r.arrastre > 0) problemas.push(`${ancho}: ${r.arrastre} px de arrastre`);
  if (r.tactiles.length) problemas.push(`${ancho}: ${r.tactiles.length} blanco(s) táctil(es) bajo 44 px`);
}

console.log(JSON.stringify(resultados, null, 2));
if (problemas.length) {
  console.error("\n🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
} else {
  console.error(`\n🟢 [${ETAPA}] 390 · 834 · 1024 · 1440 — 0 arrastre, 0 blancos bajo 44 px.`);
}
