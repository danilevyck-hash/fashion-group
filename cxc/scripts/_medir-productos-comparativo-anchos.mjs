// Ventas › Productos · «Año en curso» en los CUATRO anchos: 390 (iPhone), 834
// (iPad parado — el ancho del medio, el que nadie mira), 1024 (iPad ACOSTADO)
// y 1440.
//
// Lo que este cambio toca en pantalla es UN renglón de texto: el «Δ contra …»
// que va debajo del total, que pasa de "1 ene 2025 – 31 dic 2025" a
// "1 ene 2025 – 24 ago 2025". Un renglón de texto es exactamente la clase de
// cosa que se lleva la página de lado en iPhone si se le escapa un
// `whitespace-nowrap` (ya pasó una vez en esta misma línea, #573).
//
// Se mide, en cada ancho:
//   · cuerpo            — px que se va de lado la PÁGINA entera (debe ser 0)
//   · arrastre          — px dentro del scroller de la tabla (se compara contra
//                         origin/main: la tabla YA arrastraba a 390, lo que no
//                         puede es EMPEORAR)
//   · RECORTADO         — px de datos que no se alcanzan ni arrastrando
//   · táctiles < 44 px · letra < 12 px
//   · el renglón «Δ contra …»: que EXISTA, qué dice, cuánto mide, en cuántas
//     líneas cae y si se sale del viewport
//
// FALLA si la pantalla no dibuja filas, si el renglón «Δ contra …» no está, o
// si el rango que muestra no es el que se espera (`ESPERADO=…`). Medir cero y
// dar verde sin haber mirado nada es el peor resultado posible.
//
// Solo lectura: navega y mira.
//   BASE=http://localhost:3223 ETAPA=antes   node scripts/_medir-productos-comparativo-anchos.mjs
//   BASE=http://localhost:3222 ETAPA=despues ESPERADO="1 ene 2025 – 24 ago 2025" node scripts/_medir-productos-comparativo-anchos.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3222";
const SALIDA = process.env.SALIDA ?? "/tmp/t222";
const ETAPA = process.env.ETAPA ?? "antes";
const ESPERADO = process.env.ESPERADO ?? null;
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

  // Táctiles chicos y letra chica, solo en lo que se ve.
  const tap = [], letra = [];
  for (const el of document.querySelectorAll("button, a[href], [role=combobox], input, select")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) tap.push({ etiqueta: etiqueta(el), w: Math.round(r.width), h: Math.round(r.height) });
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ").trim();
    if (!txt) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 12) letra.push({ txt: txt.slice(0, 28), px: Math.round(px * 10) / 10 });
  }

  // EL RENGLÓN QUE ESTE CAMBIO TOCA.
  const p = document.querySelector("[data-resumen-productos]");
  let comparativo = null;
  if (p) {
    const r = p.getBoundingClientRect();
    const txt = (p.textContent ?? "").replace(/\\s+/g, " ").trim();
    const m = /Δ contra (.+?)$/.exec(txt);
    const cs = getComputedStyle(p);
    comparativo = {
      texto: txt,
      rango: m ? m[1].trim() : null,
      derecha: Math.round(r.right),
      alto: Math.round(r.height),
      // Alto ÷ interlineado ≈ en cuántas líneas cayó el renglón.
      lineas: Math.max(1, Math.round(r.height / (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5))),
      seSale: Math.round(Math.max(0, r.right - document.documentElement.clientWidth)),
      nowrap: cs.whiteSpace.includes("nowrap"),
      fontPx: Math.round(parseFloat(cs.fontSize) * 10) / 10,
    };
  }

  return {
    arrastrePx: arrastre[0]?.px ?? 0,
    arrastrePeor: arrastre[0] ?? null,
    recortadoPx: recortado[0]?.px ?? 0,
    recortadoPeor: recortado[0] ?? null,
    cuerpoPx: Math.max(0, Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth)),
    tapChicos: tap.length,
    tapEjemplos: tap.slice(0, 4),
    letraChica: letra.length,
    letraEjemplos: letra.slice(0, 4),
    filas: document.querySelectorAll("tr[data-fila-producto]").length,
    comparativo,
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
    await page.goto(`${BASE}/ventas?tab=productos`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });
    await page.waitForSelector("[data-resumen-productos]", { timeout: 45000 });
    await page.waitForTimeout(1500);
    Object.assign(r, await page.evaluate(SONDA));
    await page.screenshot({ path: path.join(SALIDA, `comparativo-${ETAPA}-${ANCHO}.png`), fullPage: true });

    r.veredicto =
      r.filas === 0 ? "SIN-DATOS (el 0 no prueba nada)"
      : !r.comparativo ? "NO DICE CONTRA QUÉ COMPARA"
      : !r.comparativo.rango ? "FALTA EL «Δ contra …»"
      : ESPERADO && r.comparativo.rango !== ESPERADO ? `RANGO INESPERADO (${r.comparativo.rango})`
      : r.comparativo.seSale > 0 ? "EL RENGLÓN SE SALE DEL VIEWPORT"
      : r.cuerpoPx > 0 ? "LA PÁGINA SE VA DE LADO"
      : r.recortadoPx > 0 ? "RECORTADO"
      : r.tapChicos > 0 ? "TÁCTIL <44"
      : r.letraChica > 0 ? "LETRA <12"
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
    `${String(ANCHO).padStart(4)}px cuerpo=${String(r.cuerpoPx ?? "?").padStart(3)} ` +
    `arrastre=${String(r.arrastrePx ?? "?").padStart(4)} RECORTADO=${String(r.recortadoPx ?? "?").padStart(4)} ` +
    `tap<44=${String(r.tapChicos ?? "?").padStart(2)} letra<12=${String(r.letraChica ?? "?").padStart(2)} ` +
    `filas=${String(r.filas ?? "?").padStart(3)} ${r.veredicto}` + (r.error ? `  ⚠️ ${r.error}` : ""),
  );
  if (r.comparativo) {
    console.log(`        Δ contra: "${r.comparativo.rango}" · ${r.comparativo.lineas} línea(s) · ` +
      `alto ${r.comparativo.alto}px · se sale ${r.comparativo.seSale}px · nowrap=${r.comparativo.nowrap} · ${r.comparativo.fontPx}px`);
  }
  if (r.arrastrePeor) console.log(`        arrastra: ${r.arrastrePeor.etiqueta} (${r.arrastrePeor.px}px)`);
  if (r.recortadoPeor) console.log(`        recorta: ${r.recortadoPeor.etiqueta} (${r.recortadoPeor.px}px)`);
  if (r.tapEjemplos?.length) console.log(`        táctil: ${r.tapEjemplos.map(t => `${t.etiqueta} ${t.w}×${t.h}`).join(" · ")}`);
  if (r.letraEjemplos?.length) console.log(`        letra: ${r.letraEjemplos.map(t => `"${t.txt}" ${t.px}px`).join(" · ")}`);
  if (r.erroresJs.length) console.log(`        JS: ${r.erroresJs.join(" | ")}`);
  await page.close();
  await ctx.close();
}
await navegador.close();

const archivo = path.join(SALIDA, `comparativo-anchos-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(filas, null, 1));
console.log(`\nGuardado en ${archivo}`);

const otro = path.join(SALIDA, "comparativo-anchos-antes.json");
if (ETAPA === "despues" && existsSync(otro)) {
  const a = JSON.parse(readFileSync(otro, "utf8"));
  console.log("\n=== CONTRA origin/main, ancho por ancho ===");
  let peor = 0;
  for (const d of filas) {
    const A = a.find(x => x.ancho === d.ancho);
    if (!A) continue;
    const cmp = [
      ["arrastre", A.arrastrePx ?? 0, d.arrastrePx ?? 0],
      ["cuerpo", A.cuerpoPx ?? 0, d.cuerpoPx ?? 0],
      ["recortado", A.recortadoPx ?? 0, d.recortadoPx ?? 0],
      ["tap<44", A.tapChicos ?? 0, d.tapChicos ?? 0],
      ["letra<12", A.letraChica ?? 0, d.letraChica ?? 0],
    ];
    const empeoraron = cmp.filter(([, x, y]) => y > x);
    peor += empeoraron.length;
    console.log(
      `${String(d.ancho).padStart(4)}px  ` +
      cmp.map(([n, x, y]) => `${n} ${x}→${y}${y > x ? " ❌" : ""}`).join(" · ") +
      `  |  Δ contra "${A.comparativo?.rango}" → "${d.comparativo?.rango}"` +
      ` (${A.comparativo?.lineas}→${d.comparativo?.lineas} línea(s))`,
    );
  }
  console.log(peor === 0 ? "\n✅ 0 arrastre NUEVO: nada empeoró en ningún ancho." : `\n❌ ${peor} medidas empeoraron.`);
  if (peor > 0) fallos++;
}

console.log(`\n${filas.length} anchos medidos · ${fallos} con hallazgos · capturas en ${SALIDA}`);
process.exit(fallos > 0 ? 1 : 0);
