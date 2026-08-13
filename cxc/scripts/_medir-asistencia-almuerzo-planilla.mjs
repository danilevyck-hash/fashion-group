// Medición de las pantallas tocadas por el PR «almuerzo fijo + servicio
// profesional», en los TRES anchos: 390 · 834 · 1440.
//
// Qué mide en /asistencia (Configuración → Horarios, la ficha de una persona, y
// la pestaña Planilla):
//   · ARRASTRE — la página pide más ancho del que se ve.
//   · RECORTE  — un contenedor pide más de lo que muestra (peor que arrastrar:
//                el dato queda fuera y no hay forma de alcanzarlo).
//   · Blancos TÁCTILES por debajo de 44 px y textos por debajo de 12 px.
//   · Y lo que este PR vino a cambiar, leído del DOM real:
//       – que en Horarios el almuerzo diga «30 minutos» y NO haya botón de 60;
//       – que la ficha ofrezca «Va en la planilla / Servicio profesional»;
//       – que «Almuerzo por defecto» ya no exista en Reglas del cálculo.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar.
//
// SOLO LECTURA: se abren pantallas y se leen. No se toca ningún botón que
// guarde — la ficha se abre, no se edita.
//
//   npm run build && PORT=3463 npm run start
//   BASE=http://localhost:3463 node scripts/_medir-asistencia-almuerzo-planilla.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3463";
const OUT = process.env.OUT ?? "/tmp/asistencia-t183";
/**
 * "despues" (por defecto) mide esta rama; "antes" mide el build de `origin/main`
 * levantado en otro puerto. Los dos tienen que ENCONTRAR las pantallas: lo que
 * cambia es qué se espera ver en ellas.
 */
const ETAPA = process.env.ETAPA ?? "despues";
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
  // 🩸 Esta app NO tiene <main>. Medir sobre `body` metería el encabezado, la
  // barra lateral y sus textos chicos en la cuenta, que es ruido de otra
  // pantalla; y quedarse con el PRIMER `div[class*="transition-"]` agarra un
  // overlay vacío del menú — 0 en todo, verde sin haber mirado nada. Se elige
  // el contenedor con más texto, que es el del módulo.
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    // `auto`/`scroll` es un scroller DECLARADO: se puede arrastrar, no es un
    // recorte. Lo que se caza es lo que esconde sin dar forma de alcanzarlo.
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({
        el: `${el.tagName}.${String(el.className).slice(0, 60)}`,
        px: el.scrollWidth - el.clientWidth,
      });
    }
    if (el.matches("button, a[href], input, select, [role=button]")) {
      if (r.height < 44 - 0.5) {
        tactiles.push({
          el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`,
          alto: Math.round(r.height * 10) / 10,
          txt: (el.textContent ?? "").trim().slice(0, 28),
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

/** Lo que este PR cambió, leído del DOM. */
const LEER_CAMBIOS = () => {
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  const txt = (raiz.textContent ?? "").replace(/\s+/g, " ");
  const botones = [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
  return {
    // CAMBIO 1
    diceTreintaMinutos: /30 minutos/.test(txt),
    botonesDeAlmuerzo: botones.filter((b) => /^\d+ min$/.test(b)),
    campoAlmuerzoPorDefecto: txt.includes("Almuerzo por defecto"),
    // CAMBIO 2
    pildoraEnPlanilla: botones.filter((b) => b === "Va en la planilla").length,
    pildoraServicioProfesional: botones.filter((b) => b === "Servicio profesional").length,
    chipNoVaEnPlanilla: (txt.match(/No va en planilla/g) ?? []).length,
    // Testigos de que la pantalla TRAJO DATOS (ver la nota del final).
    filasHorario: document.querySelectorAll("table tbody tr").length,
    fichaAbierta: botones.includes("40 horas") && botones.includes("48 horas"),
    hayCamposDeReglas: txt.includes("Tolerancia de tardanza"),
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

  // ── Configuración → Personas (la ficha con las píldoras nuevas) ───────────
  await page.goto(`${BASE}/asistencia?tab=configuracion`, { waitUntil: "networkidle", timeout: 180_000 });
  // 🩸 Una pantalla vacía mide 0 y no prueba NADA: se espera a que la lista de
  // personas exista de verdad antes de medir.
  await page.getByText("Personas", { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1800);
  // Abrir la ficha de la primera persona de la lista (las filas se reconocen
  // por su renglón «N marcaciones», no por su posición).
  await page.locator("button[aria-expanded]").filter({ hasText: "marcaciones" }).first()
    .click({ timeout: 30_000 });
  await page.waitForTimeout(800);
  paso.fichaPersona = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER_CAMBIOS)) };
  await page.screenshot({ path: `${OUT}/ficha-${a.w}.png`, fullPage: true });

  // ── Configuración → Horarios (el almuerzo como dato) ─────────────────────
  await page.locator("section > button").filter({ hasText: "Horarios" }).first()
    .click({ timeout: 30_000 });
  await page.waitForSelector("table", { timeout: 60_000 });
  await page.waitForTimeout(1200);
  paso.horarios = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER_CAMBIOS)) };
  await page.screenshot({ path: `${OUT}/horarios-${a.w}.png`, fullPage: true });

  // ── Configuración → Reglas del cálculo (sin la casilla del almuerzo) ─────
  await page.locator("section > button").filter({ hasText: "Reglas del cálculo" }).first()
    .click({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  paso.reglas = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER_CAMBIOS)) };
  await page.screenshot({ path: `${OUT}/reglas-${a.w}.png`, fullPage: true });

  // ── Planilla ─────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/asistencia?tab=planilla&empresa=vistana`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.getByText(/TOTAL|No hay nadie/).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  paso.planilla = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER_CAMBIOS)) };
  await page.screenshot({ path: `${OUT}/planilla-${a.w}.png`, fullPage: true });

  resultados[a.nombre] = paso;
}

await browser.close();

// 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN HABER MIRADO NADA.
// Por eso el script REVIENTA si no encontró lo que fue a medir, y lo que espera
// encontrar depende de qué build se esté midiendo.
const problemas = [];
for (const [ancho, p] of Object.entries(resultados)) {
  if (!p.horarios.filasHorario) problemas.push(`${ancho}: Horarios salió vacío`);
  if (!p.fichaPersona.fichaAbierta) problemas.push(`${ancho}: la ficha no se abrió`);
  if (!p.reglas.hayCamposDeReglas) problemas.push(`${ancho}: Reglas del cálculo salió vacío`);
  if (ETAPA === "despues") {
    if (!p.horarios.diceTreintaMinutos) problemas.push(`${ancho}: Horarios no dice «30 minutos»`);
    if (p.horarios.botonesDeAlmuerzo.length) problemas.push(`${ancho}: volvieron los botones de almuerzo`);
    if (p.reglas.campoAlmuerzoPorDefecto) problemas.push(`${ancho}: volvió «Almuerzo por defecto» a las reglas`);
    if (p.fichaPersona.pildoraServicioProfesional < 1) problemas.push(`${ancho}: la ficha no ofrece «Servicio profesional»`);
    if (p.fichaPersona.pildoraEnPlanilla < 1) problemas.push(`${ancho}: la ficha no ofrece «Va en la planilla»`);
  } else {
    // El build de `origin/main`: acá los botones de almuerzo TIENEN que estar,
    // o se estaría midiendo otra cosa y la comparación no valdría nada.
    if (!p.horarios.botonesDeAlmuerzo.length) problemas.push(`${ancho}: en el build viejo faltan los botones de almuerzo`);
    if (!p.reglas.campoAlmuerzoPorDefecto) problemas.push(`${ancho}: en el build viejo falta «Almuerzo por defecto»`);
  }
}

console.log(JSON.stringify(resultados, null, 2));
if (problemas.length) {
  console.error("\n🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
}
