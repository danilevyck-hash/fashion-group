// Verificación de Multifashion › Productos en los TRES anchos: 390 (iPhone),
// 834 (iPad — el ancho del medio, el que nadie mira) y 1440 (escritorio).
//
// Mide, en los dos agrupadores (artículo y marca):
//   · arrastre lateral  — px que hay que arrastrar (debe ser 0 salvo scroller propio)
//   · RECORTADO         — px de datos que NO se alcanzan ni arrastrando (debe ser 0)
//   · blancos táctiles  — controles por debajo de 44 px (debe ser 0)
//   · control de vacío  — filas/tarjetas dibujadas (un 0 sin datos no prueba nada)
//
// GOTCHAS heredados de `_medir-scroll-lateral.mjs` (no tocar sin leer): cookie
// firmada, `sessionStorage.cxc_role`, y `delete Navigator.prototype.serviceWorker`
// ANTES de navegar (bloquear el SW de otra forma mata la hidratación).
//
// Solo lectura.
//   node scripts/_verif-productos-anchos.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3111";
const SALIDA = process.env.SALIDA ?? "/tmp/fg-productos";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const etiqueta = (el) =>
    el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 70) : "");

  const arrastre = [], recortado = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    const arrastrable = cs.overflowX === "auto" || cs.overflowX === "scroll";
    const tablaAdentro = Boolean(el.querySelector("table"));
    // Mismo criterio del censo: un recorte de TEXTO (hoja, con puntos
    // suspensivos) es el mecanismo, no un defecto. Recorte de DATOS = tiene
    // hijos y (hay tabla adentro o el recorte es grande).
    const recorteDeDatos = el.children.length > 0 && (tablaAdentro || sobra >= 100);
    const item = { etiqueta: etiqueta(el), px: Math.round(sobra), overflowX: cs.overflowX };
    if (arrastrable) arrastre.push(item);
    else if (recorteDeDatos) recortado.push(item);
  }
  arrastre.sort((a, b) => b.px - a.px);
  recortado.sort((a, b) => b.px - a.px);

  const chicos = [];
  const sel = "button, a[href], [role=button], [role=menuitem], input:not([type=hidden]), select, textarea";
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    chicos.push({
      etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 30),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  chicos.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));

  // Montos cortados: "$1,23…" parece un número completo y no lo es.
  const cortesTexto = [];
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length > 0) continue;
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue;
    if (!visible(el)) continue;
    const txt = (el.textContent ?? "").trim();
    if (txt && /[$%]|\\d[\\d,.]{3,}/.test(txt)) cortesTexto.push({ txt: txt.slice(0, 30), px: Math.round(sobra) });
  }

  const tablas = [...document.querySelectorAll("table")].filter(visible);
  const tarjetas = [...document.querySelectorAll('[data-vista="tarjetas"] > *')].filter(visible);
  return {
    arrastrePx: arrastre[0]?.px ?? 0,
    arrastrePeor: arrastre[0] ?? null,
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    recortadoPx: recortado[0]?.px ?? 0,
    recortadoPeor: recortado[0] ?? null,
    tapChicos: chicos.length,
    tapEjemplos: chicos.slice(0, 5),
    montosCortados: cortesTexto.length,
    montosEjemplos: cortesTexto.slice(0, 3),
    filas: tablas.reduce((n, t) => n + t.querySelectorAll("tbody tr").length, 0),
    tarjetas: tarjetas.length,
    titulo: (document.querySelector("h1")?.textContent ?? "").trim().slice(0, 40),
    hayBannerMarca: /catálogo de marcas de la tienda|todavía no tienen marca/i.test(document.body.innerText),
    primerRenglon: (document.querySelector('[data-vista="tabla"] tbody tr, [data-vista="tarjetas"] > *')?.innerText ?? "")
      .replace(/\\s+/g, " ").trim().slice(0, 90),
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const filas = [];
let fallos = 0;

for (const ANCHO of ANCHOS) {
  const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
  const ctx = await navegador.newContext({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
    hasTouch: ANCHO < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["multifashion", "ventas", "cxc", "clientes"]));
  });

  for (const agrupador of ["articulo", "marca"]) {
    const page = await ctx.newPage();
    const erroresJs = [];
    page.on("pageerror", (x) => erroresJs.push(String(x.message)));
    const r = { ancho: ANCHO, agrupador };
    try {
      await page.goto(`${BASE}/multifashion?subtab=productos`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(11000);
      if (agrupador === "marca") {
        await page.getByRole("button", { name: /Por marca/i }).click({ timeout: 8000 });
        await page.waitForTimeout(1500);
      }
      r.urlFinal = page.url().replace(BASE, "");
      if (/\/$|\/login/.test(r.urlFinal)) throw new Error("me echó al login: " + r.urlFinal);
      Object.assign(r, await page.evaluate(SONDA));
      await page.screenshot({ path: path.join(SALIDA, `productos-${agrupador}-${ANCHO}.png`), fullPage: true });

      const conDatos = r.filas > 0 || r.tarjetas > 0;
      r.veredicto = !conDatos
        ? "SIN-DATOS (el 0 no prueba nada)"
        : r.recortadoPx > 0
          ? "RECORTADO"
          : r.cuerpoPx > 0
            ? "LA PÁGINA SE VA DE LADO"
            : r.tapChicos > 0
              ? "TÁCTIL <44"
              : r.montosCortados > 0
                ? "MONTO CORTADO"
                : "SANO";
      if (r.veredicto !== "SANO") fallos++;
    } catch (err) {
      r.error = String(err.message ?? err).slice(0, 200);
      r.veredicto = "NO-MEDIDO";
      fallos++;
      await page.screenshot({ path: path.join(SALIDA, `productos-${agrupador}-${ANCHO}-ERROR.png`), fullPage: true }).catch(() => {});
    }
    r.erroresJs = erroresJs.slice(0, 2);
    filas.push(r);
    console.log(
      `${String(ANCHO).padStart(4)}px ${agrupador.padEnd(9)} ` +
      `arrastre=${String(r.arrastrePx ?? "?").padStart(4)} cuerpo=${String(r.cuerpoPx ?? "?").padStart(3)} ` +
      `RECORTADO=${String(r.recortadoPx ?? "?").padStart(4)} tap<44=${String(r.tapChicos ?? "?").padStart(2)} ` +
      `montos✂=${String(r.montosCortados ?? "?").padStart(2)} filas=${String(r.filas ?? "?").padStart(3)} ` +
      `tarjetas=${String(r.tarjetas ?? "?").padStart(3)} ${r.veredicto}` +
      (r.error ? `  ⚠️ ${r.error}` : ""),
    );
    if (r.primerRenglon) console.log(`        1er renglón: ${r.primerRenglon}`);
    if (r.tapEjemplos?.length) console.log(`        táctil: ${r.tapEjemplos.map(t => `${t.etiqueta} ${t.w}×${t.h}`).join(" · ")}`);
    if (r.recortadoPeor) console.log(`        recorta: ${r.recortadoPeor.etiqueta}`);
    if (r.arrastrePeor) console.log(`        arrastra: ${r.arrastrePeor.etiqueta} (${r.arrastrePeor.px}px)`);
    if (r.erroresJs.length) console.log(`        JS: ${r.erroresJs.join(" | ")}`);
    await page.close();
  }
  await ctx.close();
}

await navegador.close();
console.log(`\n${filas.length} mediciones · ${fallos} con hallazgos · capturas en ${SALIDA}`);
process.exit(fallos > 0 ? 1 : 0);
