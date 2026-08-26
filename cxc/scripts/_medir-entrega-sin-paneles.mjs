// Medición de los 4 anchos (390 · 834 · 1024 · 1440) del formulario de ENTREGA
// DE MUEBLES con paneles ya NO obligatorio (23-ago-2026).
//
// QUÉ MIDE, por escenario y por ancho:
//   · arrastre  — px que hay que arrastrar para ver el resto (overflow auto/scroll)
//   · RECORTADO — px de datos que quedan fuera y NO se alcanzan ni arrastrando
//   · tap<44    — blancos táctiles por debajo de 44 px
//   · y el ESTADO del freno: si el botón está apagado y qué dice el "Falta: …"
//
// Escenarios (los tres estados que el cambio toca):
//   1. vacío         → botón APAGADO, "Falta: … al menos un producto con cantidad"
//   2. sin-paneles   → sólo Barra plana; botón ENCENDIDO (esto era imposible antes)
//   3. con-paneles   → lo de siempre, para probar que no se rompió
//
// 🔴 SOLO LECTURA, Y NO POR PROMESA: el contexto ABORTA en el navegador todo
//   pedido que no sea GET/HEAD (y el `route` corta antes de que salga a la red),
//   así que ni un clic accidental en "Registrar entrega" puede escribir en
//   producción. Cada aborto se cuenta y se imprime.
//
// GOTCHAS heredados de `_medir-mobiliario-piezas-bultos.mjs` (no tocar sin leer):
//   · Sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   · Sembrar sessionStorage (`cxc_role`, `fg_modules`): useAuth lee de AHÍ.
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
//   BASE=http://localhost:3193 node scripts/_medir-entrega-sin-paneles.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3193";
const SALIDA = process.env.SALIDA ?? "/tmp/medir-entrega-sin-paneles";
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);
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

  const guardar = [...document.querySelectorAll("button")].find(
    (b) => /Registrar entrega|Guardar cambios/.test(b.textContent || ""),
  );
  const falta = [...document.querySelectorAll("p")].find(
    (p) => /^Falta:/.test((p.textContent || "").trim()),
  );
  const panel = document.querySelector("#entrega-paneles");

  return {
    arrastrePx: arrastres.length ? arrastres[0].sobraPx : 0,
    peorArrastre: arrastres[0] ?? null,
    cortadoPx: cortes.length ? cortes[0].sobraPx : 0,
    peorCorte: cortes[0] ?? null,
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    tapChicos: chicos.length,
    ejemplosTap: chicos.slice(0, 4),
    textoLargo: document.body.innerText.replace(/\\s+/g," ").trim().length,
    // Estado del freno — lo que este cambio mueve.
    botonApagado: guardar ? guardar.disabled : null,
    textoFalta: falta ? falta.textContent.trim() : null,
    panelValor: panel ? panel.value : null,
    panelMin: panel ? panel.getAttribute("min") : null,
    diceObligatorio: /Obligatorio — sin paneles/.test(document.body.innerText),
    dicePiezas: /Piezas/.test(document.body.innerText),
    diceBultos: /Bultos/.test(document.body.innerText),
  };
})()`;

async function abrirForm(page) {
  // 🩸 NADA de `if (!(await b.count()))` sobre un fijo `waitForTimeout`: con la
  // máquina cargada la lista del proyecto tarda de más y el botón todavía no
  // está — daba "no pude preparar la pantalla" al azar en 3 de 12 corridas y
  // eso se lee igual que un bug. Se ESPERA al botón, con su propio timeout.
  const b = page.getByRole("button", { name: "+ Entrega de muebles" }).first();
  try {
    await b.waitFor({ state: "visible", timeout: 30000 });
  } catch {
    return false;
  }
  await b.click({ timeout: 8000 }).catch(() => {});
  try {
    await page.locator("#entrega-paneles").waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return false;
  }
  await page.waitForTimeout(600);
  return true;
}

const P = [
  {
    id: "vacio",
    titulo: "Entrega VACÍA (botón apagado, dice qué falta)",
    preparar: async (page) => abrirForm(page),
  },
  {
    id: "sin-paneles",
    titulo: "SIN paneles, sólo Barra plana (antes imposible)",
    preparar: async (page) => {
      if (!(await abrirForm(page))) return false;
      const barra = page.getByLabel("Piezas de Barra plana").first();
      try { await barra.waitFor({ state: "visible", timeout: 15000 }); }
      catch { return false; }
      await barra.fill("120").catch(() => {});
      const bultos = page.getByLabel("Bultos de Barra plana").first();
      if (await bultos.count()) await bultos.fill("4").catch(() => {});
      await page.waitForTimeout(900);
      return true;
    },
  },
  {
    id: "con-paneles",
    titulo: "CON paneles y accesorios (que no se rompió nada)",
    preparar: async (page) => {
      if (!(await abrirForm(page))) return false;
      const inp = page.locator("#entrega-paneles");
      if (await inp.count()) await inp.fill("38").catch(() => {});
      for (const cat of ["Tablas", "Conjunto soporte", "Norte (colgador)", "Barra plana"]) {
        const el = page.getByLabel(`Piezas de ${cat}`).first();
        if (await el.count()) await el.fill("114").catch(() => {});
      }
      await page.waitForTimeout(900);
      return true;
    },
  },
];

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];
let abortados = 0;

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
    // 🔴 NADA que no sea GET/HEAD sale de este navegador.
    await ctx.route("**/*", (route) => {
      const m = route.request().method();
      if (m === "GET" || m === "HEAD") return route.continue();
      abortados++;
      console.error(`   ⛔ ABORTADO ${m} ${route.request().url().slice(0, 90)}`);
      return route.abort();
    });

    const page = await ctx.newPage();
    const erroresJs = [];
    page.on("pageerror", (x) => erroresJs.push(String(x.message)));

    const r = { id: p.id, titulo: p.titulo, ancho: ANCHO };
    try {
      await page.goto(`${BASE}/marketing?proyecto=${PROYECTO}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(11000);
      if (/\/login/.test(page.url())) throw new Error("me echó al login");
      if (!(await p.preparar(page))) throw new Error("no pude preparar la pantalla");
      Object.assign(r, await page.evaluate(SONDA));
      r.conDatos = r.textoLargo > 250;
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
      `@${String(ANCHO).padStart(4)} ${p.id.padEnd(13)} arrastre=${String(r.arrastrePx ?? "?").padStart(4)} ` +
      `RECORTADO=${String(r.cortadoPx ?? "?").padStart(4)} tap<44=${String(r.tapChicos ?? "?").padStart(3)} ` +
      `apagado=${String(r.botonApagado)} min=${String(r.panelMin)} oblig=${String(r.diceObligatorio)} ` +
      `${r.veredicto}` +
      (r.textoFalta ? `  «${r.textoFalta}»` : "") +
      (r.peorCorte ? `  ✂ ${r.peorCorte.etiqueta.slice(0, 40)}` : "") +
      (r.error ? `  ⚠️ ${r.error}` : ""),
    );
    await ctx.close();
  }
}

await navegador.close();
writeFileSync(path.join(SALIDA, "medicion.json"), JSON.stringify(resultados, null, 2));
console.error(`\n⛔ pedidos que NO eran GET, abortados: ${abortados}`);
console.error(`→ ${path.join(SALIDA, "medicion.json")}`);
