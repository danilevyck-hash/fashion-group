// Ventas › Productos — el desplegable «Quién lo compra», en los CUATRO anchos:
// 390 (iPhone), 834 (iPad parado — el ancho del medio, el que nadie mira),
// 1024 (iPad ACOSTADO) y 1440.
//
// Se mide en TRES estados, porque el desplegable no es uno solo:
//   · cerrado           — la tabla de siempre, para comparar contra origin/main
//   · clientes abierto  — la pestaña nueva (la que abre por defecto)
//   · códigos abierto   — la de siempre, ahora detrás de una pestaña
//
// Y en cada estado:
//   · arrastre lateral  — px que hay que arrastrar dentro de un scroller
//   · cuerpo            — px que se va de lado la PÁGINA entera (debe ser 0)
//   · RECORTADO         — px de datos que no se alcanzan ni arrastrando (debe ser 0)
//   · táctiles < 44 px  — debe ser 0
//   · letra < 12 px     — debe ser 0
//
// 🔴 SE COMPARA CONTRA origin/main, no contra 0: la tabla de Productos YA
// arrastraba a 390 px antes de este cambio (la Descripción es texto largo).
// Lo que se exige es que el desplegable NUEVO no agregue arrastre.
//
// GOTCHAS heredados (no tocar sin leer): cookie firmada, `sessionStorage.cxc_role`
// y `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// El script FALLA si no encuentra filas, si no encuentra las dos pestañas o si
// la lista de clientes sale vacía: medir cero y dar verde sin haber mirado nada
// es el peor resultado posible.
//
// Solo lectura: navega, despliega y mira. No toca ningún botón que escriba.
//
//   BASE=http://localhost:3241 ETAPA=despues node scripts/_medir-productos-clientes.mjs
//   BASE=http://localhost:3236 ETAPA=antes   node scripts/_medir-productos-clientes.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3241";
const SALIDA = process.env.SALIDA ?? "/tmp/t241";
const ETAPA = process.env.ETAPA ?? "despues";
const EMPRESA = process.env.EMPRESA ?? "vistana";
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
  const sel = "button, a[href], [role=button], [role=tab], [role=menuitem], input:not([type=hidden]), select, textarea";
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

  const letraChica = [];
  for (const el of document.querySelectorAll("th, td, p, span, button, label")) {
    if (!visible(el)) continue;
    if (!(el.textContent ?? "").trim()) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px && px < 12) letraChica.push({ txt: (el.textContent ?? "").trim().slice(0, 24), px });
  }

  const tablaCli = document.querySelector("[data-drill-clientes]");
  const filasCli = tablaCli ? [...tablaCli.querySelectorAll("tr")] : [];
  const cajaDrill = document.querySelector("[data-drill-clientes], [data-drill-codigos]");

  return {
    arrastrePx: arrastre[0]?.px ?? 0,
    arrastrePeor: arrastre[0] ?? null,
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    recortadoPx: recortado[0]?.px ?? 0,
    recortadoPeor: recortado[0] ?? null,
    tapChicos: chicos.length,
    tapEjemplos: chicos.slice(0, 5),
    letraChica: letraChica.length,
    letraEjemplos: letraChica.slice(0, 3),
    filas: document.querySelectorAll("tr[data-fila-producto]").length,
    // 🩸 SOLO las pestañas del DESPLEGABLE. Un \`[role=tab]\` a secas agarra las
    // del módulo Ventas (Resumen · Clientes · Productos · Utilidad) y el
    // chequeo "tiene 2 pestañas" pasaría en verde sin haber mirado nada.
    pestanas: [...document.querySelectorAll('[aria-label="Detalle de la descripción"] [role=tab]')]
      .map(t => (t.textContent ?? "").trim()),
    clientes: filasCli.length,
    primerCliente: filasCli[0] ? (filasCli[0].innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 80) : null,
    pieClientes: (document.querySelector("[data-pie-clientes]")?.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 150),
    codigos: document.querySelectorAll("[data-drill-codigos] tr").length,
    altoDrill: cajaDrill ? Math.round(cajaDrill.getBoundingClientRect().height) : 0,
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

  try {
    // 🩸 La empresa va por DEEP LINK (`?empresa=`), no tocando el desplegable:
    // desde 834 px la página dibuja los DOS layouts de Ventas y el índice del
    // combobox deja de ser estable — la medición se colgaba esperando filas que
    // nunca llegaban, y eso se lee igual que "la pantalla está rota".
    await page.goto(`${BASE}/ventas?tab=productos&empresa=${EMPRESA}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 90000 });
    await page.waitForTimeout(1500);

    // ── estado 1: cerrado
    const cerrado = { ancho: ANCHO, estado: "cerrado", ...(await page.evaluate(SONDA)) };
    filas.push(veredicto(cerrado, { exigeClientes: false }));
    await page.screenshot({ path: path.join(SALIDA, `prod-${ETAPA}-${ANCHO}-cerrado.png`), fullPage: false });

    // ── estado 2: desplegado (abre en «Quién lo compra»)
    await page.locator("tr[data-fila-producto]").first().click();
    await page.waitForTimeout(3500);
    const clientes = { ancho: ANCHO, estado: "clientes", ...(await page.evaluate(SONDA)) };
    filas.push(veredicto(clientes, { exigeClientes: ETAPA === "despues" }));
    await page.screenshot({ path: path.join(SALIDA, `prod-${ETAPA}-${ANCHO}-clientes.png`), fullPage: false });

    // ── estado 3: la pestaña Códigos
    if (ETAPA === "despues") {
      await page.getByRole("tab", { name: /Códigos/ }).click();
      await page.waitForTimeout(600);
      const codigos = { ancho: ANCHO, estado: "codigos", ...(await page.evaluate(SONDA)) };
      if (codigos.codigos === 0) { codigos.error = "la pestaña Códigos salió VACÍA"; fallos++; }
      filas.push(veredicto(codigos, { exigeClientes: false }));
      await page.screenshot({ path: path.join(SALIDA, `prod-${ETAPA}-${ANCHO}-codigos.png`), fullPage: false });
    }
  } catch (err) {
    filas.push({ ancho: ANCHO, estado: "?", error: String(err.message ?? err).slice(0, 200), veredicto: "NO-MEDIDO" });
    fallos++;
  }
  if (erroresJs.length) console.log(`  ⚠️ JS: ${erroresJs.slice(0, 2).join(" | ")}`);
  await page.close();
  await ctx.close();
}
await navegador.close();

function veredicto(r, { exigeClientes }) {
  r.veredicto = r.filas === 0
    ? "SIN-DATOS (el 0 no prueba nada)"
    : exigeClientes && r.clientes === 0
      ? "SIN CLIENTES (no prueba nada)"
      : exigeClientes && r.pestanas.length < 2
        ? "SIN PESTAÑAS"
        : r.recortadoPx > 0
          ? "RECORTADO"
          : r.cuerpoPx > 0
            ? "LA PÁGINA SE VA DE LADO"
            : r.tapChicos > 0
              ? "TÁCTIL <44"
              : r.letraChica > 0
                ? "LETRA <12"
                : "SANO";
  if (r.veredicto !== "SANO") fallos++;
  console.log(
    `${String(r.ancho).padStart(4)}px ${r.estado.padEnd(9)} arrastre=${String(r.arrastrePx).padStart(4)} ` +
    `cuerpo=${String(r.cuerpoPx).padStart(3)} RECORTADO=${String(r.recortadoPx).padStart(4)} ` +
    `tap<44=${String(r.tapChicos).padStart(2)} letra<12=${String(r.letraChica).padStart(2)} ` +
    `filas=${String(r.filas).padStart(3)} clientes=${String(r.clientes).padStart(3)} ` +
    `cods=${String(r.codigos).padStart(3)} alto=${String(r.altoDrill).padStart(4)} ${r.veredicto}`,
  );
  if (r.pestanas?.length) console.log(`        pestañas: ${r.pestanas.join(" · ")}`);
  if (r.primerCliente) console.log(`        1er cliente: ${r.primerCliente}`);
  if (r.pieClientes) console.log(`        pie: ${r.pieClientes}`);
  if (r.tapEjemplos?.length) console.log(`        táctil: ${r.tapEjemplos.map(t => `${t.etiqueta} ${t.w}×${t.h}`).join(" · ")}`);
  if (r.letraEjemplos?.length) console.log(`        letra: ${r.letraEjemplos.map(t => `"${t.txt}" ${t.px}px`).join(" · ")}`);
  if (r.arrastrePeor) console.log(`        arrastra: ${r.arrastrePeor.etiqueta} (${r.arrastrePeor.px}px)`);
  return r;
}

const archivo = path.join(SALIDA, `productos-clientes-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(filas, null, 1));
console.log(`\nGuardado en ${archivo}`);

const otro = path.join(SALIDA, "productos-clientes-antes.json");
if (ETAPA === "despues" && existsSync(otro)) {
  const a = JSON.parse(readFileSync(otro, "utf8"));
  console.log("\n=== ¿EMPEORÓ EL ARRASTRE contra origin/main? (por ancho y estado) ===");
  let peor = 0;
  for (const d of filas) {
    const A = a.find(x => x.ancho === d.ancho && x.estado === d.estado);
    if (!A) continue;
    const delta = (d.arrastrePx ?? 0) - (A.arrastrePx ?? 0);
    if (delta > 0) peor++;
    console.log(
      `${String(d.ancho).padStart(4)}px ${d.estado.padEnd(9)} ${String(A.arrastrePx).padStart(4)} → ` +
      `${String(d.arrastrePx).padStart(4)}  ${delta > 0 ? `❌ +${delta}` : delta < 0 ? `✅ ${delta}` : "✅ igual"}`,
    );
  }
  if (peor > 0) { console.log(`\n❌ el arrastre EMPEORÓ en ${peor} caso(s).`); fallos++; }
  else console.log("\n✅ el desplegable nuevo no agregó ni un píxel de arrastre.");
}

console.log(fallos === 0 ? "\n✅ SANO en los cuatro anchos." : `\n❌ ${fallos} hallazgo(s).`);
process.exit(fallos === 0 ? 0 : 1);
