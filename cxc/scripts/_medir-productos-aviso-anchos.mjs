// Ventas › Productos en los CUATRO anchos (390 iPhone · 834 iPad parado — el
// ancho del medio, el que nadie mira · 1024 iPad acostado · 1440), CON el aviso
// de "código mal clasificado" A LA VISTA y SIN él.
//
// La tabla YA arrastraba a 390 antes de este cambio (la Descripción es texto
// largo). Por eso acá no se mide "arrastre = 0": se mide contra la CIFRA de
// origin/main y se exige que NO EMPEORE. Un aviso nuevo debajo del nombre no
// puede agregar arrastre nuevo en iPhone.
//
// Mide, en cada ancho:
//   · arrastre lateral  — px que hay que arrastrar dentro del scroller de la tabla
//   · cuerpo            — px que se va de lado la PÁGINA entera (debe ser 0)
//   · RECORTADO         — px de datos que no se alcanzan ni arrastrando (debe ser 0)
//   · táctiles < 44 px  — debe ser 0
//   · letra < 12 px     — debe ser 0
//   · montos cortados   — "$1,23…" parece un número y no lo es
//   · AVISOS            — cuántos renglones lo muestran (con 0 la medición del
//                         aviso no prueba nada)
//   · ALTO              — px de alto de la página y de la tabla. 25-ago-2026:
//                         el aviso SE RETIRÓ, así que lo que se exige acá ya no
//                         es "que no empeore el arrastre" sino que la pantalla
//                         ACORTE — cada aviso era un renglón de más debajo del
//                         nombre. Se reporta antes → después.
//
// GOTCHAS heredados (no tocar sin leer): cookie firmada, `sessionStorage.cxc_role`
// y `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura.
//   BASE=http://localhost:3350 EMPRESA=fashion_shoes ETAPA=antes \
//     node scripts/_medir-productos-aviso-anchos.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3350";
const SALIDA = process.env.SALIDA ?? "/tmp/t350";
const EMPRESA = process.env.EMPRESA ?? "fashion_shoes";
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
    // 🔑 EL ALTO SE MIDE EN LA TABLA Y EN LA PÁGINA. Sacar el aviso quita un
    // <p> de debajo del nombre en cada fila que lo tenía: la tabla acorta y la
    // página con ella. El alto de la PRIMERA fila es la prueba fina — a 390 px
    // el aviso la partía en dos líneas.
    altoPaginaPx: document.documentElement.scrollHeight,
    altoTablaPx: Math.round(document.querySelector("tr[data-fila-producto]")?.closest("table")?.getBoundingClientRect().height ?? 0),
    altoPrimeraFilaPx: Math.round(document.querySelector("tr[data-fila-producto]")?.getBoundingClientRect().height ?? 0),
    avisos: document.querySelectorAll("[data-aviso-clasificacion]").length,
    avisoTexto: (document.querySelector("[data-aviso-clasificacion]")?.textContent ?? "").replace(/\\s+/g, " ").trim(),
    avisoColor: document.querySelector("[data-aviso-clasificacion]")
      ? getComputedStyle(document.querySelector("[data-aviso-clasificacion]")).color : null,
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
  const r = { ancho: ANCHO };
  try {
    await page.goto(`${BASE}/ventas?tab=productos&empresa=${EMPRESA}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });
    await page.waitForTimeout(1500);
    Object.assign(r, await page.evaluate(SONDA));
    await page.screenshot({ path: path.join(SALIDA, `productos-${ETAPA}-${EMPRESA}-${ANCHO}.png`), fullPage: true });

    r.veredicto = r.filas === 0
      ? "SIN-DATOS (el 0 no prueba nada)"
      : r.recortadoPx > 0
        ? "RECORTADO"
        : r.cuerpoPx > 0
          ? "LA PÁGINA SE VA DE LADO"
          : r.tapChicos > 0
            ? "TÁCTIL <44"
            : r.letraChica > 0
              ? "LETRA <12"
              : r.montosCortados > 0
                ? "MONTO CORTADO"
                : "SANO";
    if (r.veredicto !== "SANO") fallos++;
  } catch (err) {
    r.error = String(err.message ?? err).slice(0, 200);
    r.veredicto = "NO-MEDIDO";
    fallos++;
  }
  r.erroresJs = erroresJs.slice(0, 2);
  filas.push(r);
  console.log(
    `${String(ANCHO).padStart(4)}px arrastre=${String(r.arrastrePx ?? "?").padStart(4)} ` +
    `cuerpo=${String(r.cuerpoPx ?? "?").padStart(3)} RECORTADO=${String(r.recortadoPx ?? "?").padStart(4)} ` +
    `tap<44=${String(r.tapChicos ?? "?").padStart(2)} letra<12=${String(r.letraChica ?? "?").padStart(2)} ` +
    `montos✂=${String(r.montosCortados ?? "?").padStart(2)} filas=${String(r.filas ?? "?").padStart(3)} ${r.veredicto}` +
    (r.error ? `  ⚠️ ${r.error}` : ""),
  );
  console.log(`        avisos=${r.avisos ?? "?"}  alto: página=${r.altoPaginaPx ?? "?"} tabla=${r.altoTablaPx ?? "?"} 1ª fila=${r.altoPrimeraFilaPx ?? "?"}`);
  if (r.avisoTexto) console.log(`        aviso: "${r.avisoTexto}"  color=${r.avisoColor}`);
  if (r.columnasVisibles) console.log(`        columnas: ${r.columnasVisibles.join(" · ")}`);
  if (r.primerRenglon) console.log(`        1er renglón: ${r.primerRenglon}`);
  if (r.tapEjemplos?.length) console.log(`        táctil: ${r.tapEjemplos.map(t => `${t.etiqueta} ${t.w}×${t.h}`).join(" · ")}`);
  if (r.letraEjemplos?.length) console.log(`        letra: ${r.letraEjemplos.map(t => `"${t.txt}" ${t.px}px`).join(" · ")}`);
  if (r.arrastrePeor) console.log(`        arrastra: ${r.arrastrePeor.etiqueta} (${r.arrastrePeor.px}px)`);
  if (r.erroresJs.length) console.log(`        JS: ${r.erroresJs.join(" | ")}`);
  await page.close();
  await ctx.close();
}
await navegador.close();

const archivo = path.join(SALIDA, `productos-anchos-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(filas, null, 1));
console.log(`\nGuardado en ${archivo}`);

const otro = path.join(SALIDA, "productos-anchos-antes.json");
if (ETAPA === "despues" && existsSync(otro)) {
  const a = JSON.parse(readFileSync(otro, "utf8"));
  console.log("\n=== ¿EMPEORÓ EL ARRASTRE? (antes → después, por ancho) ===");
  let peor = 0;
  for (const d of filas) {
    const A = a.find(x => x.ancho === d.ancho);
    if (!A) continue;
    const delta = (d.arrastrePx ?? 0) - (A.arrastrePx ?? 0);
    if (delta > 0) peor++;
    console.log(
      `${String(d.ancho).padStart(4)}px  arrastre ${String(A.arrastrePx).padStart(4)} → ${String(d.arrastrePx).padStart(4)}` +
      `  (${delta > 0 ? "+" : ""}${delta})  ${delta > 0 ? "❌ EMPEORÓ" : "✅"}`,
    );
  }
  console.log(peor === 0 ? "\n✅ El arrastre NO empeoró en ningún ancho." : `\n❌ empeoró en ${peor} anchos.`);
  if (peor > 0) fallos++;

  // 🔑 SACAR EL AVISO TIENE QUE ACORTAR, y con la MISMA cantidad de filas: si
  // la tabla acortara porque se perdieron renglones, esto no sería una mejora
  // sino el peor bug posible. Por eso se exige que `filas` no cambie.
  console.log("\n=== ¿ACORTÓ? (antes → después, por ancho) ===");
  let creció = 0;
  let filasDistintas = 0;
  for (const d of filas) {
    const A = a.find(x => x.ancho === d.ancho);
    if (!A) continue;
    const dTabla = (d.altoTablaPx ?? 0) - (A.altoTablaPx ?? 0);
    const dPag = (d.altoPaginaPx ?? 0) - (A.altoPaginaPx ?? 0);
    const dFila = (d.altoPrimeraFilaPx ?? 0) - (A.altoPrimeraFilaPx ?? 0);
    if (dTabla > 0 || dPag > 0) creció++;
    if (d.filas !== A.filas) filasDistintas++;
    console.log(
      `${String(d.ancho).padStart(4)}px  avisos ${String(A.avisos).padStart(2)} → ${String(d.avisos).padStart(2)}` +
      `  tabla ${String(A.altoTablaPx).padStart(5)} → ${String(d.altoTablaPx).padStart(5)} (${dTabla > 0 ? "+" : ""}${dTabla})` +
      `  página ${String(A.altoPaginaPx).padStart(5)} → ${String(d.altoPaginaPx).padStart(5)} (${dPag > 0 ? "+" : ""}${dPag})` +
      `  1ª fila ${String(A.altoPrimeraFilaPx).padStart(3)} → ${String(d.altoPrimeraFilaPx).padStart(3)} (${dFila > 0 ? "+" : ""}${dFila})` +
      `  filas ${A.filas} → ${d.filas}${d.filas !== A.filas ? " ❌" : ""}`,
    );
  }
  if (filasDistintas > 0) { console.log(`\n❌ LA TABLA PERDIÓ FILAS en ${filasDistintas} anchos — acortar así no vale.`); fallos++; }
  else if (creció > 0) { console.log(`\n⚠️ creció en ${creció} anchos.`); }
  else console.log("\n✅ Acortó (o quedó igual) en todos los anchos, con las MISMAS filas.");
}

console.log(`\n${filas.length} anchos medidos · ${fallos} con hallazgos · capturas en ${SALIDA}`);
process.exit(fallos > 0 ? 1 : 0);
