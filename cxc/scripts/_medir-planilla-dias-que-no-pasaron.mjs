// Medición de la PLANILLA tocada por el PR «los días que no pasaron», en los
// TRES anchos: 390 · 834 · 1440 (más el iPad acostado, 1024).
//
// Qué mide en /asistencia?tab=planilla, con datos de PRODUCCIÓN:
//   · ARRASTRE — la página pide más ancho del que se ve.
//   · RECORTE  — un contenedor pide más de lo que muestra (peor que arrastrar:
//                el dato queda fuera y no hay forma de alcanzarlo).
//   · Blancos TÁCTILES por debajo de 44 px y textos por debajo de 12 px.
//   · Y lo que este PR vino a cambiar, leído del DOM real:
//       – el aviso «Esta quincena todavía no termina…» arriba del cuadro;
//       – el aviso del código sin ficha, UNA sola vez;
//       – las filas de «Tú decides» con su motivo y su quincenal;
//       – que a esas filas NO se les diga «falta configurar».
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login), `delete Navigator.prototype.serviceWorker`
// antes de navegar, esta app NO tiene <main>, y la pestaña vive en la URL.
//
// SOLO LECTURA: se abren pantallas y se leen. No se toca ningún botón que
// guarde ni ningún campo de monto.
//
//   npm run build && PORT=3499 npm run start
//   BASE=http://localhost:3499 node scripts/_medir-planilla-dias-que-no-pasaron.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3499";
const OUT = process.env.OUT ?? "/tmp/planilla-t199";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

/** Las tres empresas: Boston tiene los dos casos de vigencia parcial. */
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];

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

/** Lo que este PR cambió, leído del DOM. */
const LEER_CAMBIOS = new Function(`
  const raiz = ${RAIZ};
  const txt = (raiz.textContent ?? "").replace(/\\s+/g, " ");
  const cuenta = (re) => (txt.match(re) ?? []).length;
  return {
    avisoPeriodoAbierto: /todavía no termina/.test(txt),
    avisoSinFicha: cuenta(/no tiene ficha \\(código/g),
    // 🔴 Adentro del cuadro NO puede quedar ninguna fila «sin ficha».
    filaSinFichaEnElCuadro: cuenta(/sin ficha en Configuración/g),
    grupoDecidir: /Tú decides:/.test(txt),
    grupoFalta: /Falta un dato:/.test(txt),
    motivosDecidir: cuenta(/(entró el \\d|salió el \\d|Vacaciones del |Trabajo fuera de la oficina del )/g),
    quincenaCompleta: cuenta(/la quincena completa le daría/g),
    // Testigo de que la pantalla TRAJO DATOS.
    hayTotal: /TOTAL/.test(txt) || /Total ·/.test(txt),
    filas: document.querySelectorAll("table tbody tr").length,
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
  const paso = {};
  for (const empresa of EMPRESAS) {
    await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.waitForTimeout(1500);
    // La empresa se elige en el desplegable, que es como lo hace una persona.
    await page.locator("select").nth(1).selectOption(empresa).catch(() => {});
    await page.waitForTimeout(2500);
    paso[empresa] = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER_CAMBIOS)) };
    await page.screenshot({ path: `${OUT}/planilla-${empresa}-${a.w}.png`, fullPage: true });
  }
  resultados[a.nombre] = paso;
}

await browser.close();

// 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN HABER MIRADO NADA.
const problemas = [];
for (const [ancho, p] of Object.entries(resultados)) {
  for (const [empresa, r] of Object.entries(p)) {
    const q = `${ancho}/${empresa}`;
    if (!r.hayTotal) problemas.push(`${q}: la planilla salió vacía`);
    if (!r.avisoPeriodoAbierto) problemas.push(`${q}: falta el aviso del período sin terminar`);
    if (r.avisoSinFicha !== 1) problemas.push(`${q}: el aviso del código sin ficha aparece ${r.avisoSinFicha} veces (tiene que ser 1)`);
    if (r.filaSinFichaEnElCuadro) problemas.push(`${q}: quedó una fila «sin ficha» DENTRO del cuadro`);
    if (!r.grupoDecidir) problemas.push(`${q}: falta el grupo «Tú decides»`);
    if (!r.motivosDecidir) problemas.push(`${q}: ninguna fila trae el motivo escrito`);
    if (r.arrastre > 0) problemas.push(`${q}: ${r.arrastre} px de arrastre`);
    if (r.tactiles.length) problemas.push(`${q}: ${r.tactiles.length} blanco(s) táctil(es) bajo 44 px`);
  }
}

console.log(JSON.stringify(resultados, null, 2));
if (problemas.length) {
  console.error("\n🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
} else {
  console.error("\n🟢 390 · 834 · 1024 · 1440 — 0 arrastre, 0 blancos bajo 44 px, y los tres avisos a la vista.");
}
