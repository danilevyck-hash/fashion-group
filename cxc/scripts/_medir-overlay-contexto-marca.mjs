// Medición de los 3 anchos (390 · 834 · 1440) del overlay del proyecto ABIERTO
// DESDE EL PERÍODO DE UNA MARCA — lo que toca este cambio: la línea de
// contexto ("En Calvin Klein · Período 2026: $X — este proyecto también tiene
// $Y de Tommy Hilfiger") y la celda "Entregas: N · $X" de la cabecera.
//
// QUÉ MIDE, por pantalla y por ancho:
//   · arrastre  — px que hay que arrastrar para ver el resto (overflow auto/scroll)
//   · RECORTADO — px de datos que quedan fuera y NO se alcanzan ni arrastrando
//   · tap<44    — blancos táctiles por debajo de 44 px
// y VERIFICA que lo nuevo esté en pantalla (la línea y la celda): un 0 px
// sobre una pantalla sin el cambio no prueba nada.
//
// GOTCHAS heredados (no tocar sin leer):
//   · Sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   · Sembrar sessionStorage (`cxc_role`, `fg_modules`): useAuth lee de AHÍ.
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: ningún escenario guarda, borra ni envía nada.
//
//   BASE=http://localhost:3197 node scripts/_medir-overlay-contexto-marca.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3197";
const SALIDA = process.env.SALIDA ?? "/tmp/medir-overlay-contexto";
const ANCHOS = (process.env.ANCHOS ?? "390,834,1440").split(",").map(Number);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
// Apertura · Nova Lux — el proyecto REAL con las dos marcas (CK $2.600 + TH $2.470).
const PROYECTO = process.env.PROYECTO ?? "f0c57078-281c-4e34-8225-106eda59dce7";

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const etiqueta = (el) =>
    el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 70) : "");

  const arrastres = [], cortes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1 || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    const item = { etiqueta: etiqueta(el), sobraPx: Math.round(sobra), anchoContenido: el.scrollWidth, anchoVisible: el.clientWidth };
    if (cs.overflowX === "auto" || cs.overflowX === "scroll") { arrastres.push(item); continue; }
    if (el.children.length > 0 && (el.querySelector("table") || sobra >= 100)) cortes.push(item);
  }
  arrastres.sort((a,b)=>b.sobraPx-a.sobraPx); cortes.sort((a,b)=>b.sobraPx-a.sobraPx);

  const chicos = [];
  const sel = "button, a[href], [role=button], input:not([type=hidden]), select, textarea";
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    chicos.push({ etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g," ").trim().slice(0,30), w: Math.round(r.width), h: Math.round(r.height) });
  }
  chicos.sort((a,b)=>Math.min(a.w,a.h)-Math.min(b.w,b.h));

  // Textos por debajo de 12 px (regla de la casa).
  let textosChicos = 0;
  for (const el of document.querySelectorAll("span, div, p, td, th, a, button")) {
    if (!visible(el)) continue;
    if (!el.childNodes.length) continue;
    const directo = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!directo) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 12) textosChicos++;
  }

  const ctxEl = document.querySelector("[data-contexto-marca]");
  return {
    arrastrePx: arrastres.length ? arrastres[0].sobraPx : 0,
    peorArrastre: arrastres[0] ?? null,
    cortadoPx: cortes.length ? cortes[0].sobraPx : 0,
    peorCorte: cortes[0] ?? null,
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    tapChicos: chicos.length,
    ejemplosTap: chicos.slice(0, 4),
    textosChicos,
    textoLargo: document.body.innerText.replace(/\\s+/g," ").trim().length,
    // Señales de que LO NUEVO está en pantalla:
    lineaContexto: ctxEl ? ctxEl.textContent.trim() : null,
    contextoDesborda: ctxEl ? Math.max(0, ctxEl.scrollWidth - ctxEl.clientWidth) : null,
    diceTambienTiene: /este proyecto también tiene/.test(document.body.innerText),
    diceCeldaEntregas: /Entregas/i.test(document.body.innerText),
  };
})()`;

const P = [
  {
    id: "overlay-desde-ck",
    titulo: "Overlay Nova Lux abierto desde Calvin Klein · Período 2026",
    url: `/marketing/calvin-klein/periodo-2026?proyecto=${PROYECTO}`,
    espera: 11000,
  },
  {
    id: "overlay-desde-th",
    titulo: "Overlay Nova Lux abierto desde Tommy Hilfiger · Período 2026",
    url: `/marketing/tommy-hilfiger/periodo-2026?proyecto=${PROYECTO}`,
    espera: 11000,
  },
];

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const ANCHO of ANCHOS) {
  for (const p of P) {
    const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
    const ctx = await navegador.newContext({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: 1,
      hasTouch: ANCHO < 1200,
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript(() => {
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_is_owner", "1");
      sessionStorage.setItem("fg_modules", JSON.stringify(["marketing", "clientes", "admin"]));
    });

    const page = await ctx.newPage();
    const erroresJs = [];
    page.on("pageerror", (x) => erroresJs.push(String(x.message)));

    const r = { id: p.id, titulo: p.titulo, ancho: ANCHO };
    try {
      await page.goto(BASE + p.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(p.espera ?? 8000);
      if (/\/login/.test(page.url())) throw new Error("me echó al login");
      Object.assign(r, await page.evaluate(SONDA));
      const conDatos = r.textoLargo > 250 && r.lineaContexto;
      r.veredicto = !conDatos ? "SIN-DATOS"
        : r.cortadoPx > 0 ? "RECORTADO"
        : r.arrastrePx > 0 ? "ARRASTRE"
        : "SANO";
      await page.screenshot({ path: path.join(SALIDA, `${p.id}-${ANCHO}.png`), fullPage: true });
    } catch (err) {
      r.error = String(err.message ?? err).slice(0, 200);
      r.veredicto = "NO-MEDIDO";
      await page.screenshot({ path: path.join(SALIDA, `${p.id}-${ANCHO}-ERROR.png`), fullPage: true }).catch(() => {});
    }
    r.erroresJs = erroresJs.slice(0, 3);
    resultados.push(r);
    console.error(
      `@${String(ANCHO).padStart(4)} ${p.id.padEnd(18)} arrastre=${String(r.arrastrePx ?? "?").padStart(4)} ` +
      `RECORTADO=${String(r.cortadoPx ?? "?").padStart(4)} tap<44=${String(r.tapChicos ?? "?").padStart(3)} ` +
      `txt<12=${String(r.textosChicos ?? "?").padStart(3)} ctxDesborda=${String(r.contextoDesborda ?? "?").padStart(3)} ` +
      `${r.veredicto}` +
      (r.lineaContexto ? `\n      «${r.lineaContexto.slice(0, 110)}»` : "") +
      (r.error ? `  ⚠️ ${r.error}` : ""),
    );
    await ctx.close();
  }
}

writeFileSync(path.join(SALIDA, "resultados.json"), JSON.stringify(resultados, null, 2));
await navegador.close();
const malos = resultados.filter((r) => r.veredicto !== "SANO");
console.error(malos.length === 0 ? "\n🟢 TODO SANO" : `\n🔴 ${malos.length} pantallas con hallazgos`);
process.exit(malos.length === 0 ? 0 : 1);
