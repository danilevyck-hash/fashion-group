// Medición REAL en navegador de los TRES NIVELES de Marketing (12-ago-2026).
//
// SOLO LECTURA: no se toca Cerrar, ni ZIP, ni Registrar gasto. Se navega y se
// mide. Qué mide, en 390 · 834 · 1024 · 1440, contra el build de producción
// con datos de producción:
//   A. ARRASTRE DE PÁGINA — documentElement.scrollWidth − clientWidth.
//   B. RECORTADOS — contenido que se sale de su caja SIN scroller.
//   C. BLANCOS TÁCTILES < 44 px.
//   D. TEXTOS < 12 px.
// Y además VERIFICA en pantalla:
//   - Nivel 1: los montos de las marcas (chips del control).
//   - Nivel 2 de Calvin: abierto $5,840.00 y mid 2026 $46,462.14.
//   - Nivel 3 de Calvin abierto: Nova Lux $1,040.00 + General $4,800.00.
//   - Nivel 3 de Tommy cerrado (mid 2026): $94,104.43.
//   - Joybees (UN período) salta directo al nivel 3.
//
// GOTCHAS medidos de este repo (no tocar sin leer):
//   * Sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Y ADEMÁS sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Y `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
//   PORT=3141 SALIDA=/tmp/mk-niveles node scripts/_medir-marketing-niveles.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3141";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/tmp/mk-niveles";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true, captura: true },
  { nombre: "834", width: 834, height: 1194, movil: true, captura: false },
  { nombre: "1024", width: 1024, height: 768, movil: false, captura: false },
  { nombre: "1440", width: 1440, height: 900, movil: false, captura: true },
];

const PANTALLAS = [
  { key: "nivel1", ruta: "/marketing" },
  { key: "nivel2-calvin", ruta: "/marketing/calvin-klein" },
  { key: "nivel3-calvin-abierto", ruta: "/marketing/calvin-klein/periodo-2026" },
  { key: "nivel3-calvin-cerrado", ruta: "/marketing/calvin-klein/mid-2026" },
  { key: "nivel2-tommy", ruta: "/marketing/tommy-hilfiger" },
  { key: "nivel3-tommy-cerrado", ruta: "/marketing/tommy-hilfiger/mid-2026" },
];

// Lo que la pantalla TIENE que decir (los chips del control, al centavo).
const TEXTOS = {
  nivel1: ["$8,800.00", "$5,840.00", "$1,540.00", "$8,061.63", "2 períodos"],
  "nivel2-calvin": ["Período 2026", "$5,840.00", "mid 2026", "$46,462.14"],
  "nivel3-calvin-abierto": ["$5,840.00", "Nova Lux", "$1,040.00", "General", "$4,800.00"],
  "nivel3-calvin-cerrado": ["$46,462.14", "City Mall David"],
  "nivel2-tommy": ["$8,800.00", "$94,104.43"],
  "nivel3-tommy-cerrado": ["$94,104.43"],
};

const MEDIR = `(() => {
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;
  const root = document.querySelector("main");
  if (!root) return { falta: "main" };
  const recortados = [], chicos = [], textosChicos = [];
  for (const el of root.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    const desborde = el.scrollWidth - el.clientWidth;
    if (desborde > 1 && cs.overflowX === "hidden") {
      recortados.push({
        tag: el.tagName.toLowerCase(),
        clase: (el.className || "").toString().slice(0, 60),
        px: desborde,
        texto: (el.textContent || "").trim().slice(0, 40),
      });
    }
    if (["BUTTON","A","INPUT","SELECT","TEXTAREA"].includes(el.tagName)) {
      const srOnly = (el.className || "").toString().includes("sr-only");
      if (cs.display !== "none" && !srOnly && r.height > 0 && r.height < 44) {
        chicos.push({
          tag: el.tagName.toLowerCase(),
          alto: Math.round(r.height * 10) / 10,
          texto: (el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 40),
        });
      }
    }
    const propio = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(" ");
    if (propio) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ px: fs, texto: propio.slice(0, 40) });
    }
  }
  // Las filas con role=button también son blancos táctiles: se miden aparte.
  for (const el of root.querySelectorAll('[role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 44) {
      chicos.push({ tag: "fila", alto: Math.round(r.height * 10) / 10, texto: (el.textContent || "").trim().slice(0, 40) });
    }
  }
  return { arrastrePagina, recortados, chicos, textosChicos, texto: root.innerText };
})()`;

const ok = (m) =>
  m.falta
    ? `FALTA ${m.falta}`
    : `arrastre ${m.arrastrePagina} · recortados ${m.recortados.length} · táctiles<44 ${m.chicos.length} · texto<12 ${m.textosChicos.length}`;

(async () => {
  mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const informe = {};
  let fallas = 0;

  for (const t of TAMANOS) {
    const ctx = await browser.newContext({
      viewport: { width: t.width, height: t.height },
      isMobile: t.movil,
      hasTouch: t.movil,
      deviceScaleFactor: 2,
    });
    await ctx.addCookies([
      { name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" },
    ]);
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    const page = await ctx.newPage();
    const caso = {};

    for (const p of PANTALLAS) {
      await page.goto(`${BASE}${p.ruta}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1100);
      const m = await page.evaluate(MEDIR);
      // Los textos de control tienen que estar EN PANTALLA.
      m.faltantes = (TEXTOS[p.key] ?? []).filter((s) => !(m.texto ?? "").includes(s));
      delete m.texto;
      caso[p.key] = m;
      if (t.captura) {
        await page.screenshot({
          path: path.join(SALIDA, `${p.key}-${t.nombre}.png`),
          fullPage: true,
        });
      }
    }

    // Joybees: UN período → el nivel 2 tiene que aterrizar en el nivel 3.
    await page.goto(`${BASE}/marketing/joybees`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    caso.joybeesSalto = {
      url: page.url().replace(BASE, ""),
      salta: /\/marketing\/joybees\/.+/.test(page.url()),
    };
    if (t.captura) {
      await page.screenshot({
        path: path.join(SALIDA, `nivel3-joybees-${t.nombre}.png`),
        fullPage: true,
      });
    }

    informe[t.nombre] = caso;
    await ctx.close();

    console.log(`\n=== ${t.nombre} px ===`);
    for (const [k, m] of Object.entries(caso)) {
      if (k === "joybeesSalto") {
        console.log(`  joybees salta a: ${m.url} ${m.salta ? "✅" : "❌"}`);
        if (!m.salta) fallas++;
        continue;
      }
      console.log(`  ${k.padEnd(24)} ${ok(m)}${m.faltantes?.length ? `  ❌ faltan: ${JSON.stringify(m.faltantes)}` : "  ✅ textos"}`);
      if (m.recortados?.length) console.log("     recortados:", JSON.stringify(m.recortados));
      if (m.chicos?.length) console.log("     táctiles:", JSON.stringify(m.chicos));
      if (m.textosChicos?.length) console.log("     textos:", JSON.stringify(m.textosChicos));
      if (!m.falta) {
        fallas +=
          (m.arrastrePagina > 0 ? 1 : 0) + m.recortados.length +
          m.chicos.length + m.textosChicos.length + (m.faltantes?.length ?? 0);
      }
    }
  }

  writeFileSync(path.join(SALIDA, "informe.json"), JSON.stringify(informe, null, 2));
  await browser.close();
  console.log(`\nCapturas e informe en ${SALIDA}`);
  console.log(fallas === 0 ? "\n🟢 0 hallazgos en los cuatro anchos." : `\n🔴 ${fallas} hallazgos.`);
})();
