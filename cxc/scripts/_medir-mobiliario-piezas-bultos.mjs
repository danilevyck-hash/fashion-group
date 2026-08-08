// Medición de los 3 anchos (390 · 834 · 1440) de lo que toca este cambio:
// piezas + bultos por renglón, fotos de producto y la nota de entrega.
//
// QUÉ MIDE, por pantalla y por ancho:
//   · arrastre  — px que hay que arrastrar para ver el resto (overflow auto/scroll)
//   · RECORTADO — px de datos que quedan fuera y NO se alcanzan ni arrastrando
//   · tap<44    — blancos táctiles por debajo de 44 px
//
// 🩸 La página de Mobiliario YA TUVO un recorte grave (jul-2026, documentado en
// su encabezado): dos tablas dentro de un contenedor con `overflow-hidden` y
// sin scroller adentro. Por eso este cambio —que le agrega una columna de foto
// a la tabla de productos y un input de bultos por renglón al formulario— se
// mide y no se supone.
//
// GOTCHAS heredados (no tocar sin leer):
//   · Sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   · Sembrar sessionStorage (`cxc_role`, `fg_modules`): useAuth lee de AHÍ.
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: ningún escenario guarda, borra ni envía nada.
//
//   BASE=http://localhost:3193 node scripts/_medir-mobiliario-piezas-bultos.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3193";
const SALIDA = process.env.SALIDA ?? "/tmp/medir-mobiliario";
const ANCHOS = (process.env.ANCHOS ?? "390,834,1440").split(",").map(Number);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const PROYECTO = process.env.PROYECTO ?? "a29d88e5-d3a7-45e4-895a-76e875deac8d";

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
    // Recorte de DATOS (no de texto con puntos suspensivos): tiene hijos y es
    // una tabla o pasa del umbral medido de 100 px.
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

  return {
    arrastrePx: arrastres.length ? arrastres[0].sobraPx : 0,
    peorArrastre: arrastres[0] ?? null,
    cortadoPx: cortes.length ? cortes[0].sobraPx : 0,
    peorCorte: cortes[0] ?? null,
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    tapChicos: chicos.length,
    ejemplosTap: chicos.slice(0, 4),
    // Control de vacío: un 0 px sin contenido no prueba nada.
    filas: document.querySelectorAll("tbody tr").length,
    tarjetas: document.querySelectorAll("[data-fg-tarjeta]").length,
    textoLargo: document.body.innerText.replace(/\\s+/g," ").trim().length,
    // Señales de que lo NUEVO está en pantalla.
    dicePiezas: /Piezas/.test(document.body.innerText),
    diceBultos: /Bultos|bultos/.test(document.body.innerText),
    diceCompartir: /Compartir/.test(document.body.innerText),
    diceImprimir: /Imprimir/.test(document.body.innerText),
    diceFoto: /Foto|foto/.test(document.body.innerText),
  };
})()`;

const P = [
  {
    id: "mobiliario-lista",
    titulo: "Mobiliario (productos con foto)",
    url: "/marketing/mobiliario",
    espera: 9000,
  },
  {
    id: "mobiliario-modal-producto",
    titulo: "Mobiliario > Editar producto (bloque de foto)",
    url: "/marketing/mobiliario",
    espera: 9000,
    async preparar(page) {
      const b = page.getByRole("button", { name: "Editar" }).first();
      if (!(await b.count())) return false;
      await b.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return (await page.getByText("Editar producto").count()) > 0;
    },
  },
  {
    id: "entrega-detalle",
    titulo: "Proyecto > Entregas desplegadas (piezas+bultos, compartir/imprimir)",
    url: `/marketing?proyecto=${PROYECTO}`,
    espera: 11000,
    async preparar(page) {
      // OJO: "+ Entrega de muebles" también contiene "Entrega" y va ANTES en
      // el DOM. Se apunta a la píldora azul, que sólo existe en las filas.
      const fila = page.locator("button", { has: page.locator("span", { hasText: /^Entrega$/ }) }).first();
      if (!(await fila.count())) return false;
      await fila.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(3500);
      return (await page.getByText("Total línea").count()) > 0;
    },
  },
  {
    id: "entrega-form",
    titulo: "Nueva entrega de muebles (piezas + bultos)",
    url: `/marketing?proyecto=${PROYECTO}`,
    espera: 11000,
    async preparar(page) {
      const b = page.getByRole("button", { name: "+ Entrega de muebles" }).first();
      if (!(await b.count())) return false;
      await b.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500);
      // Escribir paneles para que se llene la curva y las filas crezcan: el
      // ancho hay que medirlo CON contenido, no con el formulario vacío.
      const inp = page.locator("#entrega-paneles");
      if (await inp.count()) {
        await inp.fill("38").catch(() => {});
        await page.waitForTimeout(900);
      }
      return (await page.getByText("Cantidad de paneles").count()) > 0;
    },
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
      if (p.preparar && !(await p.preparar(page))) throw new Error("no pude preparar la pantalla");
      Object.assign(r, await page.evaluate(SONDA));
      r.conDatos = r.arrastrePx > 0 || r.cortadoPx > 0 || r.filas > 0 || r.tarjetas > 0 || r.textoLargo > 250;
      r.veredicto = !r.conDatos ? "SIN-DATOS"
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
      `@${String(ANCHO).padStart(4)} ${p.id.padEnd(28)} arrastre=${String(r.arrastrePx ?? "?").padStart(4)} ` +
      `RECORTADO=${String(r.cortadoPx ?? "?").padStart(4)} tap<44=${String(r.tapChicos ?? "?").padStart(3)} ` +
      `${r.veredicto}` +
      (r.peorArrastre ? `  ← ${r.peorArrastre.etiqueta.slice(0, 40)}` : "") +
      (r.peorCorte ? `  ✂ ${r.peorCorte.etiqueta.slice(0, 40)}` : "") +
      (r.error ? `  ⚠️ ${r.error}` : ""),
    );
    await ctx.close();
  }
}

await navegador.close();
writeFileSync(path.join(SALIDA, "medicion.json"), JSON.stringify(resultados, null, 2));
console.error(`\n→ ${path.join(SALIDA, "medicion.json")}`);
