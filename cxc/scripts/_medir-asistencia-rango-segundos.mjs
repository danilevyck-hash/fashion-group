// Medición de las pantallas tocadas por «rango de fechas + medir al segundo»,
// en los TRES anchos: 390 · 834 · 1440.
//
// Qué mide, en /asistencia:
//   · PLANILLA en modo Quincena (como siempre) y en modo Rango de fechas.
//   · REPORTE, que ahora muestra minutos con decimales (`fmtMin`).
//   · ARRASTRE de página · RECORTES · blancos táctiles <44 px · textos <12 px.
//   · Y lo que este PR vino a cambiar, leído del DOM: que exista el selector
//     Quincena/Rango, que el rango libre avise que NO es una quincena, y que
//     las marcas del reporte se vean con segundos.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, la pestaña vive
// en la URL (`?tab=`), y esta app NO tiene <main> (se elige el contenedor con
// más texto: el primer `div[class*="transition-"]` es un overlay VACÍO).
//
// SOLO LECTURA: se abren pantallas y se leen. No se toca ningún botón que guarde.
//
//   npm run build && npx next start -p 3467
//   BASE=http://localhost:3467 node scripts/_medir-asistencia-rango-segundos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3467";
const OUT = process.env.OUT ?? "/tmp/asistencia-rango";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
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
  // 🩸 Esta app NO tiene <main>, y el primer `div[class*="transition-"]` es un
  // overlay VACÍO del menú: mediría 0 en todo y pasaría en verde sin mirar nada.
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  const arrastre = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    // `auto`/`scroll` es un scroller DECLARADO: se arrastra, no es un recorte.
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 60)}`, px: el.scrollWidth - el.clientWidth });
    }
    if (el.matches("button, a[href], input, select, [role=button]") && r.height < 43.5) {
      tactiles.push({
        el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`,
        alto: Math.round(r.height * 10) / 10,
        txt: (el.textContent ?? "").trim().slice(0, 28),
      });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este PR cambió, leído del DOM. */
const LEER = () => {
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  const txt = (raiz.textContent ?? "").replace(/\s+/g, " ");
  const botones = [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
  return {
    haySelectorPeriodo: botones.includes("Quincena") && botones.includes("Rango de fechas"),
    avisaRangoLibre: txt.includes("Este cuadro NO es una quincena"),
    dicePorcentajeBase: /% de un sueldo quincenal/.test(txt),
    filasCuadro: document.querySelectorAll("table tbody tr").length,
    hayTotal: /TOTAL ·/.test(txt),
    // Marcas con segundos: "08:00:17" (y no "08:00")
    // Se cuentan SOLO dentro del detalle (la tabla anidada): el banner del reloj
    // trae una hora con segundos y contarla daría por bueno un detalle vacío.
    marcasConSegundos: (
      (document.querySelectorAll("table")[1]?.textContent ?? "").match(/\b\d{2}:\d{2}:\d{2}\b/g) ?? []
    ).length,
    // Minutos con decimales: la prueba de que se mide al segundo.
    minutosConDecimales: (txt.match(/\b\d+\.\d{2}\b/g) ?? []).length,
  };
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
  const paso = {};

  // ── PLANILLA · modo Quincena (lo de siempre) ─────────────────────────────
  await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.getByText(/TOTAL ·|No hay nadie/).first().waitFor({ timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  paso.planillaQuincena = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/planilla-quincena-${a.w}.png`, fullPage: true });

  // ── PLANILLA · modo Rango de fechas ──────────────────────────────────────
  await page.getByRole("button", { name: "Rango de fechas" }).first().click({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  // Se mueve el "desde" para que el rango deje de ser una quincena.
  await page.locator('input[aria-label="Desde"]').fill("2026-07-25");
  await page.waitForTimeout(3000);
  paso.planillaRango = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/planilla-rango-${a.w}.png`, fullPage: true });

  // ── REPORTE (minutos con decimales + marcas con segundos) ────────────────
  await page.goto(`${BASE}/asistencia?tab=reporte`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(3500);
  // 🩸 Se abre gente hasta encontrar a alguien CON marcas. El reporte ordena por
  // "tiempo no trabajado", así que arriba están los que más faltaron: abrir solo
  // al primero puede dar un detalle lleno de "—" y el chequeo de los segundos
  // pasaría en verde sin haber visto una sola marca.
  // ⚠️ Las filas se toman de la tabla PRINCIPAL (`table` nth 0 → `tbody > tr`):
  // al abrir a alguien se inserta una tabla ANIDADA, y contar `tbody tr` a secas
  // mezcla sus filas con las de las personas — el índice deja de significar
  // "la persona i" y los clics terminan abriendo y cerrando a la misma.
  const filasPersona = page.locator("table").first().locator("tbody > tr");
  for (let i = 0; i < 8; i++) {
    await filasPersona.nth(i).click({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const hay = await page.evaluate(() => /\b\d{2}:\d{2}:\d{2}\b/.test(
      document.querySelectorAll("table")[1]?.textContent ?? "",
    ));
    if (hay) break;
    // Si esta persona no tiene marcas en el rango, se cierra antes de probar la
    // siguiente: dejarlas todas abiertas mide una pantalla que nadie usa así.
    await filasPersona.nth(i).click({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);
  paso.reporte = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/reporte-${a.w}.png`, fullPage: true });

  resultados[a.nombre] = paso;
}

await browser.close();

// 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN HABER MIRADO NADA.
const problemas = [];
for (const [ancho, p] of Object.entries(resultados)) {
  if (!p.planillaQuincena.haySelectorPeriodo) problemas.push(`${ancho}: falta el selector Quincena/Rango`);
  if (!p.planillaQuincena.filasCuadro) problemas.push(`${ancho}: la planilla salió vacía`);
  if (!p.planillaRango.avisaRangoLibre) problemas.push(`${ancho}: el rango libre NO avisa que no es una quincena`);
  if (!p.planillaRango.dicePorcentajeBase) problemas.push(`${ancho}: el rango libre no dice cuánto del sueldo se paga`);
  if (!p.reporte.filasCuadro) problemas.push(`${ancho}: el reporte salió vacío`);
  if (!p.reporte.marcasConSegundos) problemas.push(`${ancho}: el reporte no muestra las marcas con segundos`);
}

console.log(JSON.stringify(resultados, null, 2));
if (problemas.length) {
  console.error("\n🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
}
