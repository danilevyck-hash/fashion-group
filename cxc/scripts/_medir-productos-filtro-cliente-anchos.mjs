// Ventas › Productos CON Y SIN el filtro por cliente, en los CUATRO anchos:
// 390 (iPhone), 834 (iPad parado — el ancho del medio, el que nadie mira),
// 1024 (iPad ACOSTADO) y 1440.
//
// La tabla YA arrastraba a 390 antes de este cambio (la Descripción es texto
// largo). Por eso acá no se mide "arrastre = 0": se mide contra la CIFRA de
// origin/main y se exige que NO EMPEORE — ni con el filtro puesto ni sin él.
//
// 🔑 SE MIDE DOS VECES POR ANCHO: la pantalla como está, y después de ABRIR el
// desplegable «Cliente» y ELEGIR el primer cliente. Medir sólo el estado inicial
// dejaría sin mirar justo lo que se agregó.
//
// Mide, en cada ancho y en cada estado:
//   · arrastre lateral  — px que hay que arrastrar dentro del scroller de la tabla
//   · cuerpo            — px que se va de lado la PÁGINA entera (debe ser 0)
//   · RECORTADO         — px de datos que no se alcanzan ni arrastrando (debe ser 0)
//   · táctiles < 44 px  — debe ser 0
//   · letra < 12 px     — debe ser 0
//   · montos cortados   — "$1,23…" parece un número y no lo es
//   · control de vacío  — filas dibujadas; con 0 la medición no prueba nada
//
// GOTCHAS heredados (no tocar sin leer): cookie firmada, `sessionStorage.cxc_role`
// y `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura.
//   BASE=http://localhost:3331 ETAPA=antes   node scripts/_medir-productos-filtro-cliente-anchos.mjs
//   BASE=http://localhost:3330 ETAPA=despues node scripts/_medir-productos-filtro-cliente-anchos.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3214";
const SALIDA = process.env.SALIDA ?? "/tmp/t330";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const etiqueta = (el) =>
    el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 60) : "");

  const arrastre = [], recortado = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    const arrastrable = cs.overflowX === "auto" || cs.overflowX === "scroll";
    const tablaAdentro = Boolean(el.querySelector("table"));
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

  // Letra por debajo de 12 px en lo que se lee de verdad (regla de la casa).
  const letraChica = [];
  for (const el of document.querySelectorAll("th, td, p, span, button, label")) {
    if (!visible(el)) continue;
    if (!(el.textContent ?? "").trim()) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px && px < 12) letraChica.push({ txt: (el.textContent ?? "").trim().slice(0, 24), px });
  }

  const cols = [...document.querySelectorAll("thead th")]
    .filter(visible)
    .map(th => (th.textContent ?? "").replace(/\\s+/g, " ").trim());

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
    letraChica: letraChica.length,
    letraEjemplos: letraChica.slice(0, 3),
    filas: document.querySelectorAll("tr[data-fila-producto]").length,
    columnasVisibles: cols,
    primerRenglon: (document.querySelector("tr[data-fila-producto]")?.innerText ?? "")
      .replace(/\\s+/g, " ").trim().slice(0, 100),
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
    sessionStorage.setItem("fg_modules", JSON.stringify(["ventas", "cxc", "clientes", "multifashion"]));
  });

  const page = await ctx.newPage();
  const erroresJs = [];
  page.on("pageerror", x => erroresJs.push(String(x.message)));

  /** Corre la sonda y le pone veredicto. */
  const medir = async (estado) => {
    const r = { ancho: ANCHO, estado };
    Object.assign(r, await page.evaluate(SONDA));
    await page.screenshot({ path: path.join(SALIDA, `productos-${ETAPA}-${estado}-${ANCHO}.png`), fullPage: true });
    r.veredicto = r.filas === 0
      ? "SIN-DATOS (el 0 no prueba nada)"
      : r.recortadoPx > 0 ? "RECORTADO"
      : r.cuerpoPx > 0 ? "LA PÁGINA SE VA DE LADO"
      : r.tapChicos > 0 ? "TÁCTIL <44"
      : r.letraChica > 0 ? "LETRA <12"
      : r.montosCortados > 0 ? "MONTO CORTADO"
      : "SANO";
    if (r.veredicto !== "SANO") fallos++;
    r.erroresJs = erroresJs.slice(0, 2);
    return r;
  };

  const imprimir = (r) => {
    console.log(
      `${String(r.ancho).padStart(4)}px ${r.estado.padEnd(11)} arrastre=${String(r.arrastrePx ?? "?").padStart(4)} ` +
      `cuerpo=${String(r.cuerpoPx ?? "?").padStart(3)} RECORTADO=${String(r.recortadoPx ?? "?").padStart(4)} ` +
      `tap<44=${String(r.tapChicos ?? "?").padStart(2)} letra<12=${String(r.letraChica ?? "?").padStart(2)} ` +
      `montos✂=${String(r.montosCortados ?? "?").padStart(2)} filas=${String(r.filas ?? "?").padStart(3)} ${r.veredicto}` +
      (r.error ? `  ⚠️ ${r.error}` : ""),
    );
    if (r.columnasVisibles) console.log(`        columnas: ${r.columnasVisibles.join(" · ")}`);
    if (r.primerRenglon) console.log(`        1er renglón: ${r.primerRenglon}`);
    if (r.tapEjemplos?.length) console.log(`        táctil: ${r.tapEjemplos.map(t => `${t.etiqueta} ${t.w}×${t.h}`).join(" · ")}`);
    if (r.letraEjemplos?.length) console.log(`        letra: ${r.letraEjemplos.map(t => `"${t.txt}" ${t.px}px`).join(" · ")}`);
    if (r.arrastrePeor) console.log(`        arrastra: ${r.arrastrePeor.etiqueta} (${r.arrastrePeor.px}px)`);
    if (r.erroresJs.length) console.log(`        JS: ${r.erroresJs.join(" | ")}`);
  };

  try {
    await page.goto(`${BASE}/ventas?tab=productos`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });
    await page.waitForTimeout(1500);
    const sinFiltro = await medir("sin-filtro");
    filas.push(sinFiltro);
    imprimir(sinFiltro);

    // ── El estado NUEVO: con un cliente puesto ──────────────────────────────
    const trigger = await page.$("[data-filtro-cliente]");
    if (!trigger) {
      console.log(`${String(ANCHO).padStart(4)}px con-filtro   (no existe el control — es la etapa "antes")`);
    } else {
      await trigger.click();
      // El primer cliente REAL (la primera opción es «Cliente: todos»).
      await page.waitForSelector('[role="option"]', { timeout: 30000 });
      await page.waitForFunction(
        () => document.querySelectorAll('[role="option"]').length > 1,
        null, { timeout: 45000 },
      );
      const opciones = await page.$$('[role="option"]');
      const nombre = (await opciones[1].textContent() ?? "").trim();
      await opciones[1].click();
      await page.waitForSelector("[data-sin-mostrador]", { timeout: 60000 });
      // 🩸 Y ESPERAR A QUE LA VENTANA ANTERIOR ATERRICE. Sin esto se medía la
      // pantalla a medio cargar: la columna de cambio decía "—" y «Dejó de
      // comprar» salía vacío, y las dos cosas eran del cronómetro, no del código.
      await page.waitForFunction(
        () => !document.querySelector("[data-dejo-de-comprar-cargando]"),
        null, { timeout: 60000 },
      );
      await page.waitForTimeout(1200);
      const conFiltro = await medir("con-filtro");
      conFiltro.cliente = nombre;
      filas.push(conFiltro);
      imprimir(conFiltro);
      console.log(`        cliente elegido: ${nombre}`);
      const dejo = await page.$("[data-dejo-de-comprar]");
      console.log(`        «Dejó de comprar»: ${dejo ? "dibujado" : "sin renglones"}`);
    }
  } catch (err) {
    filas.push({ ancho: ANCHO, estado: "error", error: String(err.message ?? err).slice(0, 200), veredicto: "NO-MEDIDO" });
    console.log(`${String(ANCHO).padStart(4)}px NO-MEDIDO  ⚠️ ${String(err.message ?? err).slice(0, 160)}`);
    fallos++;
  }
  await page.close();
  await ctx.close();
}
await navegador.close();

const archivo = path.join(SALIDA, `productos-filtro-anchos-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(filas, null, 1));
console.log(`\nGuardado en ${archivo}`);

const otro = path.join(SALIDA, "productos-filtro-anchos-antes.json");
if (ETAPA === "despues" && existsSync(otro)) {
  const a = JSON.parse(readFileSync(otro, "utf8"));
  console.log("\n=== ¿EMPEORÓ ALGO CONTRA origin/main? ===");
  let peor = 0;
  for (const d of filas) {
    // origin/main no tiene el filtro, así que "con-filtro" se compara contra el
    // "sin-filtro" del MISMO ancho de main: la regla es que el estado nuevo no
    // puede arrastrar más de lo que ya arrastraba la pantalla.
    const A = a.find(x => x.ancho === d.ancho && x.estado === "sin-filtro");
    if (!A) continue;
    const delta = (d.arrastrePx ?? 0) - (A.arrastrePx ?? 0);
    const marca = delta > 0 ? "⛔ EMPEORÓ" : delta < 0 ? "✅ mejoró" : "= igual";
    if (delta > 0) peor++;
    console.log(
      `${String(d.ancho).padStart(4)}px ${d.estado.padEnd(11)} arrastre ${String(A.arrastrePx ?? "?").padStart(4)} → ${String(d.arrastrePx ?? "?").padStart(4)}  ${marca}` +
      `   recortado ${A.recortadoPx ?? "?"} → ${d.recortadoPx ?? "?"} · tap<44 ${A.tapChicos ?? "?"} → ${d.tapChicos ?? "?"} · letra<12 ${A.letraChica ?? "?"} → ${d.letraChica ?? "?"}`,
    );
  }
  console.log(peor === 0 ? "\n✅ NADA EMPEORÓ" : `\n⛔ ${peor} anchos/estados con más arrastre`);
}

process.exit(fallos > 0 ? 1 : 0);
