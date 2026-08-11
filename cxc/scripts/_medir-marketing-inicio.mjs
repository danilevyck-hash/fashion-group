// Medición REAL en navegador del INICIO de Marketing rediseñado (11-ago-2026).
//
// Qué mide, en 390 / 834 / 1440, contra el build de producción y con datos de
// producción (SOLO LECTURA — no se toca ningún botón que escriba):
//   A. ARRASTRE DE PÁGINA — documentElement.scrollWidth − clientWidth.
//   B. RECORTADOS — elementos cuyo contenido se sale de su caja sin scroller.
//   C. BLANCOS TÁCTILES < 44 px dentro de <main>.
//   D. TEXTOS < 12 px dentro de <main>.
//   E. ANCHO ÚTIL de <main> (el número que decide, no el viewport).
//   F. CONTENIDO: qué dice la tarjeta de cada marca y si Nova Lux aparece
//      dentro del bucket de Calvin Klein.
//
// GOTCHAS (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que sembrar sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
//   PORT=3175 SALIDA=/tmp/mk node scripts/_medir-marketing-inicio.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3175";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/tmp/mk-inicio";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
// uuid de Calvin Klein en producción (para abrir su bucket sin adivinar).
const MARCA_CK = process.env.MARCA_CK ?? "6dc27cc7-c061-440e-9dc9-915198852a47";

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

const MEDIR = `(() => {
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;
  const main = document.querySelector("main");
  let anchoUtil = null;
  if (main) {
    const cs = getComputedStyle(main);
    anchoUtil = Math.round(
      main.getBoundingClientRect().width -
        parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    );
  }
  const recortados = [];
  const chicos = [];
  const textosChicos = [];
  if (main) {
    for (const el of main.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      // B. recortado: se sale de su caja y NADIE puede arrastrar.
      const desborde = el.scrollWidth - el.clientWidth;
      if (desborde > 1 && cs.overflowX === "hidden") {
        recortados.push({
          tag: el.tagName.toLowerCase(),
          clase: (el.className || "").toString().slice(0, 60),
          px: desborde,
          texto: (el.textContent || "").trim().slice(0, 40),
        });
      }
      // C. blancos táctiles
      if (el.tagName === "BUTTON" || el.tagName === "A" ||
          el.tagName === "INPUT" || el.tagName === "SELECT") {
        if (cs.display !== "none" && r.height > 0 && r.height < 44) {
          chicos.push({
            tag: el.tagName.toLowerCase(),
            alto: Math.round(r.height * 10) / 10,
            texto: (el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 40),
          });
        }
      }
      // D. textos bajo 12 px (solo nodos con texto propio)
      const propio = [...el.childNodes]
        .filter((n) => n.nodeType === 3 && n.textContent.trim())
        .map((n) => n.textContent.trim()).join(" ");
      if (propio) {
        const fs = parseFloat(cs.fontSize);
        if (fs < 12) textosChicos.push({ px: fs, texto: propio.slice(0, 40) });
      }
    }
  }
  return { arrastrePagina, anchoUtil, recortados, chicos, textosChicos };
})()`;

const LEER_TARJETAS = `(() => {
  const out = [];
  for (const b of document.querySelectorAll("main button")) {
    const t = (b.innerText || "").trim();
    if (/proyecto/i.test(t) && /\\n/.test(t)) out.push(t.replace(/\\n/g, " | "));
  }
  return out;
})()`;

(async () => {
  mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const informe = {};

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

    await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    const m = await page.evaluate(MEDIR);
    const tarjetas = await page.evaluate(LEER_TARJETAS);
    await page.screenshot({
      path: path.join(SALIDA, `inicio-${t.nombre}.png`),
      fullPage: true,
    });

    // Bucket de Calvin Klein: ¿está Nova Lux en la lista?
    await page.goto(`${BASE}/marketing?marca=${MARCA_CK}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(900);
    const mCk = await page.evaluate(MEDIR);
    const proyectosCk = await page.evaluate(`(() => {
      const filas = [...document.querySelectorAll("main tbody tr")];
      return filas.map((tr) => (tr.innerText || "").split("\\n")[0].trim());
    })()`);
    await page.screenshot({
      path: path.join(SALIDA, `ck-${t.nombre}.png`),
      fullPage: true,
    });

    informe[t.nombre] = { inicio: m, tarjetas, calvin: mCk, proyectosCk };
    await ctx.close();

    console.log(`\n=== ${t.nombre} px (útil ${m.anchoUtil}) ===`);
    console.log(`  INICIO   arrastre ${m.arrastrePagina} · recortados ${m.recortados.length} · táctiles<44 ${m.chicos.length} · texto<12 ${m.textosChicos.length}`);
    console.log(`  CALVIN   arrastre ${mCk.arrastrePagina} · recortados ${mCk.recortados.length} · táctiles<44 ${mCk.chicos.length} · texto<12 ${mCk.textosChicos.length}`);
    if (m.recortados.length) console.log("   recortados:", JSON.stringify(m.recortados));
    if (m.chicos.length) console.log("   táctiles:", JSON.stringify(m.chicos));
    if (m.textosChicos.length) console.log("   textos:", JSON.stringify(m.textosChicos));
    if (mCk.recortados.length) console.log("   CK recortados:", JSON.stringify(mCk.recortados));
    if (mCk.chicos.length) console.log("   CK táctiles:", JSON.stringify(mCk.chicos));
    if (t.nombre === "1440") {
      console.log("  TARJETAS:");
      tarjetas.forEach((x) => console.log("   ", x));
      console.log("  PROYECTOS EN CALVIN KLEIN:", proyectosCk.length);
      proyectosCk.forEach((x) => console.log("   -", x));
      console.log(
        "  ¿NOVA LUX?",
        proyectosCk.some((x) => /nova lux/i.test(x)) ? "SÍ ✅" : "NO ❌",
      );
    }
  }

  writeFileSync(
    path.join(SALIDA, "informe.json"),
    JSON.stringify(informe, null, 2),
  );
  await browser.close();
  console.log(`\nCapturas e informe en ${SALIDA}`);
})();
